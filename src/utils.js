export const ALL_FILTER = "All";

export const ACCENT_PALETTE = [
  "#e74c3c",
  "#e67e22",
  "#3498db",
  "#9b59b6",
  "#1abc9c",
  "#2980b9",
  "#16a085",
  "#c0392b",
  "#8e44ad",
  "#27ae60",
];

const DEFAULT_ACCENT = "#7f8c8d";

export function accentForCategory(label) {
  const s = String(label || "");
  if (!s) return DEFAULT_ACCENT;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

export function buildCategoryCounts(scenarios) {
  const by = Object.create(null);
  for (let i = 0; i < scenarios.length; i++) {
    const c = scenarios[i].category;
    by[c] = (by[c] || 0) + 1;
  }
  return { total: scenarios.length, by };
}

export function localePath(lng, ...parts) {
  const rest = parts.filter(Boolean).join("/").replace(/^\/+/, "");
  return rest ? `/${lng}/${rest}` : `/${lng}`;
}
