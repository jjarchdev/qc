function apiBase() {
  return String(import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
}

export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase()}${p}`;
}

export function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

/** Same as apiFetch; cookie session is sent via credentials: "include". */
export function apiFetchWithAuth(path, options = {}) {
  return apiFetch(path, options);
}

export async function fetchAdminSession() {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return data?.admin === true;
}

export async function logoutAdmin() {
  await apiFetch("/api/auth/logout", { method: "POST" });
}
