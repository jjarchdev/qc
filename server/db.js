import { createClient } from "@supabase/supabase-js";
import { normalizeCategory, slugifyLabel } from "../shared/categoryMap.mjs";
import { normalizeScenario } from "../shared/scenarioSchema.mjs";

function supabaseUrl() {
  return (process.env.SUPABASE_URL || "").trim();
}

/** Prefer the new Supabase secret key (`sb_secret_...`). Legacy service_role JWT still accepted temporarily. */
function supabaseSecretKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
}

export function isSupabaseConfigured() {
  return supabaseUrl().length > 0 && supabaseSecretKey().length > 0;
}

export function usingLegacySupabaseKeyEnv() {
  return (
    !(process.env.SUPABASE_SECRET_KEY || "").trim() &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  );
}

let client = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl(), supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function rowToScenario(row) {
  if (!row) return null;
  return normalizeScenario({
    id: Number(row.id),
    category: row.category,
    title: row.title,
    scenario: row.scenario,
    solution: row.solution,
    tags: Array.isArray(row.tags) ? row.tags : [],
    image_url: typeof row.image_url === "string" ? row.image_url : "",
    is_published: typeof row.is_published === "boolean" ? row.is_published : undefined,
  });
}

function rowToCategory(row) {
  return normalizeCategory(row);
}

export async function listCategories() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("categories")
    .select("slug, label, sort_order")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToCategory).filter(Boolean);
}

async function findCategoryByLabel(label) {
  const sb = getSupabase();
  const trimmed = String(label || "").trim();
  const { data, error } = await sb
    .from("categories")
    .select("slug, label, sort_order")
    .eq("label", trimmed)
    .maybeSingle();
  if (error) throw error;
  return rowToCategory(data);
}

async function findCategoryBySlug(slug) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("categories")
    .select("slug, label, sort_order")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return rowToCategory(data);
}

async function resolveCategorySlug(labelOrSlug) {
  const value = String(labelOrSlug || "").trim();
  if (!value) throw new Error("Category required");

  const byLabel = await findCategoryByLabel(value);
  if (byLabel) return byLabel.slug;

  const bySlug = await findCategoryBySlug(value);
  if (bySlug) return bySlug.slug;

  throw new Error(`Unknown category: ${value}`);
}

export async function insertCategory(payload) {
  const sb = getSupabase();
  const label = String(payload?.label || "").trim();
  if (!label) throw new Error("Label required");

  let slug = typeof payload?.slug === "string" && payload.slug.trim()
    ? slugifyLabel(payload.slug)
    : slugifyLabel(label);

  const existing = await findCategoryBySlug(slug);
  if (existing) {
    slug = `${slug}_${Date.now().toString(36)}`;
  }

  const sort_order =
    payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : 0;

  const { data, error } = await sb
    .from("categories")
    .insert({ slug, label, sort_order })
    .select("slug, label, sort_order")
    .single();
  if (error) throw error;
  return rowToCategory(data);
}

export async function updateCategory(slug, payload) {
  const sb = getSupabase();
  const current = await findCategoryBySlug(slug);
  if (!current) return null;

  const updates = {};
  if (typeof payload?.label === "string" && payload.label.trim()) {
    updates.label = payload.label.trim();
  }
  if (payload?.sort_order != null && Number.isFinite(Number(payload.sort_order))) {
    updates.sort_order = Number(payload.sort_order);
  }
  if (Object.keys(updates).length === 0) return current;

  const { error } = await sb.from("categories").update(updates).eq("slug", slug);
  if (error) throw error;
  return findCategoryBySlug(slug);
}

export async function deleteCategory(slug) {
  const sb = getSupabase();
  const current = await findCategoryBySlug(slug);
  if (!current) return { deleted: false, reason: "not_found" };

  const { count, error: countError } = await sb
    .from("scenarios")
    .select("id", { count: "exact", head: true })
    .eq("category_slug", slug);
  if (countError) throw countError;
  if ((count || 0) > 0) {
    return { deleted: false, reason: "in_use", count };
  }

  const { error } = await sb.from("categories").delete().eq("slug", slug);
  if (error) throw error;
  return { deleted: true };
}

export async function listPublishedScenarios() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("scenarios_employee")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToScenario).filter(Boolean);
}

export async function listAllScenarios() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("scenarios_admin")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToScenario).filter(Boolean);
}

export async function insertScenario(payload) {
  const sb = getSupabase();
  const category_slug = await resolveCategorySlug(payload.category);
  const { data, error } = await sb
    .from("scenarios")
    .insert({
      category_slug,
      title: payload.title.trim(),
      situation: payload.scenario.trim(),
      solution: payload.solution.trim(),
      tags: payload.tags ?? [],
      image_url: payload.image_url || null,
      sort_order: payload.sort_order ?? 0,
      is_published: payload.is_published !== false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return getScenarioById(data.id);
}

export async function updateScenario(id, payload) {
  const sb = getSupabase();
  const category_slug = await resolveCategorySlug(payload.category);
  const updates = {
    category_slug,
    title: payload.title.trim(),
    situation: payload.scenario.trim(),
    solution: payload.solution.trim(),
    tags: payload.tags ?? [],
    image_url: payload.image_url || null,
    sort_order: payload.sort_order ?? 0,
  };
  if (typeof payload.is_published === "boolean") {
    updates.is_published = payload.is_published;
  }
  const { error } = await sb.from("scenarios").update(updates).eq("id", id);
  if (error) throw error;
  return getScenarioById(id);
}

export async function deleteScenarioById(id) {
  const sb = getSupabase();
  const { error } = await sb.from("scenarios").delete().eq("id", id);
  if (error) throw error;
}

async function getScenarioById(id) {
  const sb = getSupabase();
  const { data, error } = await sb.from("scenarios_admin").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return rowToScenario(data);
}
