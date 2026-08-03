import dotenv from "dotenv";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (existsSync(envPath)) dotenv.config({ path: envPath });

const url = (process.env.SUPABASE_URL || "").trim();
const key = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim();

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}

if (!(process.env.SUPABASE_SECRET_KEY || "").trim() && (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) {
  console.warn(
    "Using legacy SUPABASE_SERVICE_ROLE_KEY; rename to SUPABASE_SECRET_KEY (sb_secret_...)."
  );
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cats = await sb.from("categories").select("slug", { count: "exact", head: true });
const scens = await sb.from("scenarios").select("id", { count: "exact", head: true });

function formatErr(label, error) {
  if (!error) return null;
  return `${error.message}${error.hint ? ` (${error.hint})` : ""}${error.code ? ` [${error.code}]` : ""}`;
}

if (cats.error || scens.error) {
  console.error("Supabase check failed.");
  if (cats.error) console.error("categories:", formatErr("categories", cats.error));
  if (scens.error) console.error("scenarios:", formatErr("scenarios", scens.error));
  console.error(
    "If permission denied, grant privileges to service_role (see DEPLOY.md). If relation missing, run supabase/migrations/001_schema.sql."
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      host: new URL(url).host,
      keyType: key.startsWith("sb_secret_") ? "secret" : key.startsWith("eyJ") ? "legacy_jwt" : "other",
      categories: cats.count ?? 0,
      scenarios: scens.count ?? 0,
    },
    null,
    2
  )
);
