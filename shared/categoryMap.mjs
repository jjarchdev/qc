export function slugifyLabel(label) {
  const raw = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!raw) throw new Error("Invalid category label");
  return raw.slice(0, 64);
}

export function labelToSlug(label) {
  return slugifyLabel(label);
}

export function normalizeCategory(row) {
  if (!row || typeof row !== "object") return null;
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!slug || !label) return null;
  const sort_order = Number(row.sort_order);
  return {
    slug,
    label,
    sort_order: Number.isFinite(sort_order) ? sort_order : 0,
  };
}

export function normalizeCategoryList(list) {
  if (!Array.isArray(list)) return null;
  return list.map(normalizeCategory).filter(Boolean);
}
