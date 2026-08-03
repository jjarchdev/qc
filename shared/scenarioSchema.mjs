export function isScenarioRecord(s) {
  if (!s || typeof s !== "object") return false;
  const id = Number(s.id);
  if (!Number.isFinite(id) || id < 1) return false;
  for (const k of ["category", "title", "scenario", "solution"]) {
    if (typeof s[k] !== "string") return false;
  }
  if (!Array.isArray(s.tags)) return false;
  if (!s.tags.every((t) => typeof t === "string")) return false;
  return true;
}

export function normalizeScenario(s) {
  if (!isScenarioRecord(s)) return null;
  const out = {
    id: Number(s.id),
    category: s.category,
    title: s.title,
    scenario: s.scenario,
    solution: s.solution,
    tags: s.tags.map((t) => String(t)),
  };
  if (typeof s.is_published === "boolean") {
    out.is_published = s.is_published;
  } else if (s.is_published === 0 || s.is_published === 1) {
    out.is_published = Boolean(s.is_published);
  }
  return out;
}

export function normalizeScenarioList(list) {
  if (!Array.isArray(list)) return null;
  const normalized = list.map(normalizeScenario).filter(Boolean);
  return normalized.length ? normalized : null;
}
