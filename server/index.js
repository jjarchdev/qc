import dotenv from "dotenv";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import express from "express";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const envPath = path.join(ROOT, ".env");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const {
  isSupabaseConfigured,
  usingLegacySupabaseKeyEnv,
  listPublishedScenarios,
  listAllScenarios,
  insertScenario,
  updateScenario,
  deleteScenarioById,
  listCategories,
  insertCategory,
  updateCategory,
  deleteCategory,
} = await import("./db.js");
const {
  readScenariosFromDisk,
  writeScenariosToDisk,
  readCategoriesFromDisk,
  insertCategoryOnDisk,
  updateCategoryOnDisk,
  deleteCategoryOnDisk,
  resolveCategoryLabelOnDisk,
  withPublishedDefault,
} = await import("./fileStore.js");
const { normalizeScenario, sanitizeImageUrl } = await import("../shared/scenarioSchema.mjs");
const { normalizeCategory } = await import("../shared/categoryMap.mjs");
const { saveUploadedImage, UPLOADS_DIR } = await import("./upload.js");

const isProd = process.env.NODE_ENV === "production";
const adminPassword = (process.env.ADMIN_PASSWORD || "").trim() || (!isProd ? "admin123" : "");
const adminUser = (process.env.ADMIN_USER || "").trim();
const jwtSecret =
  (process.env.JWT_SECRET || "").trim() || (!isProd ? "dev-jwt-secret" : "");
const ADMIN_COOKIE = "qm_admin";
const SESSION_MAX_AGE_SEC = 8 * 60 * 60;

function authConfigured() {
  if (!isProd) return true;
  return adminPassword.length > 0 && jwtSecret.length > 0;
}

function storageMode() {
  return isSupabaseConfigured() ? "supabase" : "file";
}

function requireSupabaseInProd(res) {
  if (isProd && !isSupabaseConfigured()) {
    res.status(503).json({ error: "Supabase is required in production" });
    return true;
  }
  return false;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = Object.create(null);
  if (!header || typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function readAdminToken(req) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ") && h.length > 7) {
    return h.slice(7).trim();
  }
  const cookies = parseCookies(req);
  return typeof cookies[ADMIN_COOKIE] === "string" ? cookies[ADMIN_COOKIE] : "";
}

function verifyAdminToken(token) {
  if (!token || !jwtSecret) return false;
  try {
    jwt.verify(token, jwtSecret);
    return true;
  } catch {
    return false;
  }
}

function setAdminCookie(res, token) {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAdminCookie(res) {
  const parts = [
    `${ADMIN_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function requireAuth(req, res, next) {
  if (!verifyAdminToken(readAdminToken(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function isAdminRequest(req) {
  return verifyAdminToken(readAdminToken(req));
}

async function listScenariosForRequest(req) {
  const admin = isAdminRequest(req);
  if (isSupabaseConfigured()) {
    return admin ? listAllScenarios() : listPublishedScenarios();
  }
  const list = await readScenariosFromDisk();
  if (!list) return null;
  if (admin) return list;
  return list.filter((s) => s.is_published !== false);
}

function parseScenarioBody(body) {
  const tags = Array.isArray(body?.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean)
    : typeof body?.tags === "string"
      ? body.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  const row = {
    category: body?.category,
    title: body?.title,
    scenario: body?.scenario,
    solution: body?.solution,
    tags,
    image_url: sanitizeImageUrl(body?.image_url),
    is_published: body?.is_published !== false && body?.is_published !== "false",
  };
  const normalized = normalizeScenario({
    id: 1,
    ...row,
    tags,
  });
  if (!normalized) return null;
  return normalized;
}

function parseCategoryBody(body) {
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) return null;
  const sort_order =
    body?.sort_order != null && Number.isFinite(Number(body.sort_order))
      ? Number(body.sort_order)
      : undefined;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : undefined;
  return { label, sort_order, slug };
}

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    loginAttempts.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= LOGIN_MAX_ATTEMPTS;
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(UPLOADS_DIR, { fallthrough: true, maxAge: isProd ? "1d" : 0 }));

app.post("/api/uploads/image", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE" ? "Image must be 5MB or smaller" : err.message || "Upload failed";
      return res.status(400).json({ error: msg });
    }
    try {
      const url = await saveUploadedImage(req.file);
      return res.status(201).json({ url });
    } catch (e) {
      console.error("[upload]", e);
      return res.status(400).json({ error: e.message || "Upload failed" });
    }
  });
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    storage: storageMode(),
    supabaseConfigured: isSupabaseConfigured(),
    productionRequiresSupabase: isProd,
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    authConfigured: authConfigured(),
    requireUsername: adminUser.length > 0,
    storage: storageMode(),
    supabaseRequired: isProd && !isSupabaseConfigured(),
  });
});

app.get("/api/categories", async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const categories = isSupabaseConfigured()
      ? await listCategories()
      : await readCategoriesFromDisk();
    if (!categories) {
      return res.status(500).json({ error: "Read failed" });
    }
    res.json({ categories });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/categories", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const payload = parseCategoryBody(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Invalid category" });
    }
    const category = isSupabaseConfigured()
      ? await insertCategory(payload)
      : await insertCategoryOnDisk(payload);
    res.status(201).json({ category });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Create failed" });
  }
});

app.put("/api/categories/:slug", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const slug = String(req.params.slug || "").trim();
  if (!slug) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  try {
    const label =
      typeof req.body?.label === "string" && req.body.label.trim()
        ? req.body.label.trim()
        : undefined;
    const sort_order =
      req.body?.sort_order != null && Number.isFinite(Number(req.body.sort_order))
        ? Number(req.body.sort_order)
        : undefined;
    if (label === undefined && sort_order === undefined) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    const category = isSupabaseConfigured()
      ? await updateCategory(slug, { label, sort_order })
      : await updateCategoryOnDisk(slug, { label, sort_order });
    if (!category) return res.status(404).json({ error: "Not found" });
    res.json({ category: normalizeCategory(category) });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Update failed" });
  }
});

app.delete("/api/categories/:slug", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const slug = String(req.params.slug || "").trim();
  if (!slug) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  try {
    const result = isSupabaseConfigured()
      ? await deleteCategory(slug)
      : await deleteCategoryOnDisk(slug);
    if (result.reason === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result.reason === "in_use") {
      return res.status(409).json({
        error: `Category is used by ${result.count} scenario(s)`,
        count: result.count,
      });
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Delete failed" });
  }
});

app.get("/api/scenarios", async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const scenarios = await listScenariosForRequest(req);
    if (!scenarios) {
      return res.status(500).json({ error: "Read failed" });
    }
    res.json({ scenarios });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/scenarios", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  try {
    const payload = parseScenarioBody(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Invalid scenario" });
    }
    if (isSupabaseConfigured()) {
      const scenario = await insertScenario(payload);
      return res.status(201).json({ scenario });
    }
    const categories = await readCategoriesFromDisk();
    if (!categories) return res.status(500).json({ error: "Read failed" });
    const categoryLabel = resolveCategoryLabelOnDisk(categories, payload.category);
    const list = (await readScenariosFromDisk()) || [];
    const nextId = list.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    const scenario = withPublishedDefault(
      { id: nextId, ...payload, category: categoryLabel },
      payload.is_published !== false
    );
    await writeScenariosToDisk([...list, scenario]);
    res.status(201).json({ scenario });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Create failed" });
  }
});

app.put("/api/scenarios/:id", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const payload = parseScenarioBody(req.body);
    if (!payload) {
      return res.status(400).json({ error: "Invalid scenario" });
    }
    if (isSupabaseConfigured()) {
      const scenario = await updateScenario(id, payload);
      if (!scenario) return res.status(404).json({ error: "Not found" });
      return res.json({ scenario });
    }
    const categories = await readCategoriesFromDisk();
    if (!categories) return res.status(500).json({ error: "Read failed" });
    const categoryLabel = resolveCategoryLabelOnDisk(categories, payload.category);
    const list = (await readScenariosFromDisk()) || [];
    if (!list.some((s) => s.id === id)) {
      return res.status(404).json({ error: "Not found" });
    }
    const scenario = withPublishedDefault(
      { id, ...payload, category: categoryLabel },
      payload.is_published !== false
    );
    const next = list.map((s) => (s.id === id ? scenario : s));
    await writeScenariosToDisk(next);
    res.json({ scenario });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Update failed" });
  }
});

app.delete("/api/scenarios/:id", requireAuth, async (req, res) => {
  if (requireSupabaseInProd(res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    if (isSupabaseConfigured()) {
      await deleteScenarioById(id);
      return res.status(204).send();
    }
    const list = (await readScenariosFromDisk()) || [];
    if (!list.some((s) => s.id === id)) {
      return res.status(404).json({ error: "Not found" });
    }
    await writeScenariosToDisk(list.filter((s) => s.id !== id));
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "Delete failed" });
  }
});

app.post("/api/auth/login", (req, res) => {
  if (!authConfigured()) {
    return res.status(503).json({ error: "Login disabled" });
  }
  const ip = clientIp(req);
  if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({ error: "Too many login attempts. Try again later." });
  }
  const bodyUser = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const bodyPass = typeof req.body?.password === "string" ? req.body.password : "";
  const userOk = adminUser.length === 0 || bodyUser === adminUser;
  const passOk = bodyPass === adminPassword;
  if (!userOk || !passOk) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const token = jwt.sign({ role: "admin" }, jwtSecret, { expiresIn: "8h" });
  setAdminCookie(res, token);
  res.json({ ok: true });
});

app.post("/api/auth/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ admin: isAdminRequest(req) });
});

const distPath = path.resolve(ROOT, "dist");
const indexHtml = path.join(distPath, "index.html");
const distReady = existsSync(indexHtml);

function validateDistBundle() {
  if (!distReady) return false;
  const html = readFileSync(indexHtml, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const missing = refs.filter((ref) => !existsSync(path.join(distPath, ref.replace(/^\//, ""))));
  if (missing.length > 0) {
    console.error("[qm-playbook] missing dist assets:", missing.join(", "));
    return false;
  }
  return true;
}

const distBundleOk = distReady && validateDistBundle();

if (distBundleOk) {
  app.use(express.static(distPath, { index: false, maxAge: isProd ? "1h" : 0 }));
  app.get("*", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    const ext = path.extname(req.path);
    if (ext && ext !== ".html") {
      return res.status(404).type("text/plain").send("Not found");
    }
    res.sendFile(indexHtml);
  });
} else if (isProd && distReady) {
  console.error("[qm-playbook] dist bundle invalid");
  app.get("/", (_req, res) => {
    res.status(503).send("Build incomplete");
  });
} else if (isProd) {
  console.error("[qm-playbook] missing dist/index.html");
  app.get("/", (_req, res) => {
    res.status(503).send("Not built");
  });
}

const port = Number(process.env.PORT) || 3001;
if (isProd && (!adminPassword || !jwtSecret)) {
  console.warn("[qm-playbook] ADMIN_PASSWORD and JWT_SECRET required");
}
if (isProd && adminPassword && (adminPassword.length < 12 || adminPassword === "admin123")) {
  console.warn("[qm-playbook] ADMIN_PASSWORD looks weak; use a long unique password");
}
if (isProd && jwtSecret && (jwtSecret.length < 32 || jwtSecret === "dev-jwt-secret")) {
  console.warn("[qm-playbook] JWT_SECRET looks weak; use a long random secret (32+ chars)");
}
if (isProd && !adminUser) {
  console.warn("[qm-playbook] ADMIN_USER is unset; set it to require a username at login");
}
if (isProd && !isSupabaseConfigured()) {
  console.error("[qm-playbook] SUPABASE_URL and SUPABASE_SECRET_KEY are required in production");
}
if (isSupabaseConfigured() && usingLegacySupabaseKeyEnv()) {
  console.warn(
    "[qm-playbook] SUPABASE_SERVICE_ROLE_KEY is legacy; set SUPABASE_SECRET_KEY (sb_secret_...) instead"
  );
}

const host = isProd ? "0.0.0.0" : "127.0.0.1";

if (isProd && !isSupabaseConfigured()) {
  console.error("[qm-playbook] Refusing to start without Supabase in production");
  process.exit(1);
}

const server = app.listen(port, host, () => {
  console.log(
    `[qm-playbook] listening on ${host}:${port} (storage: ${storageMode()}, dist: ${distBundleOk ? "ok" : distReady ? "broken" : "missing"})`
  );
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[qm-playbook] Port ${port} in use.`);
  } else {
    console.error("[qm-playbook] Server failed to start:", err.message);
  }
  process.exit(1);
});
