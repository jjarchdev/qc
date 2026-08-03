import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeCategory, slugifyLabel } from "../shared/categoryMap.mjs";
import { normalizeScenario } from "../shared/scenarioSchema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_FILE = process.env.SCENARIOS_DATA_PATH || path.join(ROOT, "data", "scenarios.json");
const STORAGE_VERSION = 2;

async function readRaw() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeRaw(payload) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

function defaultPayload() {
  return {
    v: STORAGE_VERSION,
    categories: [],
    scenarios: [],
  };
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  if (!existsSync(DATA_FILE)) {
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultPayload(), null, 2), "utf8");
  }
}

function parseScenarioList(rawList) {
  if (!Array.isArray(rawList)) return null;
  const normalized = rawList.map(normalizeScenario).filter(Boolean);
  if (normalized.length !== rawList.length) return null;
  return normalized;
}

function parseCategoryList(rawList) {
  if (!Array.isArray(rawList)) return null;
  const normalized = rawList.map(normalizeCategory).filter(Boolean);
  if (normalized.length !== rawList.length) return null;
  return normalized;
}

async function loadStore() {
  const data = await readRaw();
  if (!data) return null;

  if (Array.isArray(data)) {
    const scenarios = parseScenarioList(data);
    if (!scenarios) return null;
    const labels = [...new Set(scenarios.map((s) => s.category))];
    const categories = labels.map((label, i) => ({
      slug: slugifyLabel(label),
      label,
      sort_order: i + 1,
    }));
    return { categories, scenarios };
  }

  const scenarios = parseScenarioList(
    Array.isArray(data.scenarios) ? data.scenarios : []
  );
  if (!scenarios) return null;

  let categories = parseCategoryList(
    Array.isArray(data.categories) ? data.categories : []
  );
  if (!categories) {
    if (data.categories != null && !Array.isArray(data.categories)) return null;
    const labels = [...new Set(scenarios.map((s) => s.category))];
    categories = labels.map((label, i) => ({
      slug: slugifyLabel(label),
      label,
      sort_order: i + 1,
    }));
  }

  return { categories, scenarios };
}

async function persistStore({ categories, scenarios }) {
  if (!Array.isArray(categories) || !Array.isArray(scenarios)) {
    throw new Error("Invalid store data");
  }
  const normalizedCategories = categories.map((c) => normalizeCategory(c)).filter(Boolean);
  if (normalizedCategories.length !== categories.length) {
    throw new Error("Invalid categories");
  }
  const normalizedScenarios = scenarios.map((s) => normalizeScenario(s)).filter(Boolean);
  if (normalizedScenarios.length !== scenarios.length) {
    throw new Error("Invalid scenarios");
  }
  await writeRaw({
    v: STORAGE_VERSION,
    categories: normalizedCategories,
    scenarios: normalizedScenarios,
  });
  return { categories: normalizedCategories, scenarios: normalizedScenarios };
}

export async function readScenariosFromDisk() {
  const store = await loadStore();
  return store?.scenarios ?? null;
}

export async function writeScenariosToDisk(scenarios) {
  const store = await loadStore();
  if (!store) throw new Error("Invalid scenarios file");
  const result = await persistStore({ categories: store.categories, scenarios });
  return result.scenarios;
}

export async function readCategoriesFromDisk() {
  const store = await loadStore();
  return store?.categories ?? null;
}

export async function writeCategoriesToDisk(categories) {
  const store = await loadStore();
  if (!store) throw new Error("Invalid scenarios file");
  const result = await persistStore({ categories, scenarios: store.scenarios });
  return result.categories;
}

export async function insertCategoryOnDisk(payload) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");

  const label = String(payload?.label || "").trim();
  if (!label) throw new Error("Label required");
  if (store.categories.some((c) => c.label === label)) {
    throw new Error("Category label already exists");
  }

  let slug =
    typeof payload?.slug === "string" && payload.slug.trim()
      ? slugifyLabel(payload.slug)
      : slugifyLabel(label);
  if (store.categories.some((c) => c.slug === slug)) {
    slug = `${slug}_${Date.now().toString(36)}`;
  }

  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : store.categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1;

  const category = { slug, label, sort_order };
  await persistStore({
    categories: [...store.categories, category].sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
    ),
    scenarios: store.scenarios,
  });
  return category;
}

export async function updateCategoryOnDisk(slug, payload) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");
  const idx = store.categories.findIndex((c) => c.slug === slug);
  if (idx < 0) return null;

  const current = store.categories[idx];
  const nextLabel =
    typeof payload?.label === "string" && payload.label.trim()
      ? payload.label.trim()
      : current.label;
  if (store.categories.some((c) => c.slug !== slug && c.label === nextLabel)) {
    throw new Error("Category label already exists");
  }

  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : current.sort_order;

  const updated = { ...current, label: nextLabel, sort_order };
  const categories = store.categories.map((c) => (c.slug === slug ? updated : c));

  const scenarios =
    nextLabel === current.label
      ? store.scenarios
      : store.scenarios.map((s) =>
          s.category === current.label ? { ...s, category: nextLabel } : s
        );

  await persistStore({ categories, scenarios });
  return updated;
}

export async function deleteCategoryOnDisk(slug) {
  const store = await loadStore();
  if (!store) throw new Error("Read failed");
  const cat = store.categories.find((c) => c.slug === slug);
  if (!cat) return { deleted: false, reason: "not_found" };

  const inUse = store.scenarios.filter((s) => s.category === cat.label).length;
  if (inUse > 0) {
    return { deleted: false, reason: "in_use", count: inUse };
  }

  await persistStore({
    categories: store.categories.filter((c) => c.slug !== slug),
    scenarios: store.scenarios,
  });
  return { deleted: true };
}

export function resolveCategoryLabelOnDisk(categories, labelOrSlug) {
  const value = String(labelOrSlug || "").trim();
  const byLabel = categories.find((c) => c.label === value);
  if (byLabel) return byLabel.label;
  const bySlug = categories.find((c) => c.slug === value);
  if (bySlug) return bySlug.label;
  throw new Error(`Unknown category: ${value}`);
}

export function withPublishedDefault(scenario, isPublished = true) {
  const normalized = normalizeScenario({
    ...scenario,
    is_published:
      typeof scenario.is_published === "boolean" ? scenario.is_published : isPublished,
  });
  return normalized;
}
