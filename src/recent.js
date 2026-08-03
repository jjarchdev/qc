const RECENT_KEY = "qm_recent_scenarios";
const RECENT_MAX = 8;

export function readRecentIds() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    return list.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
}

export function pushRecentId(id) {
  const num = Number(id);
  if (!Number.isFinite(num)) return;
  const next = [num, ...readRecentIds().filter((x) => x !== num)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
