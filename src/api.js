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

/** Upload an image file; returns public URL string. */
export async function uploadImageFile(file) {
  const body = new FormData();
  body.append("file", file);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res;
  try {
    res = await fetch(apiUrl("/api/uploads/image"), {
      method: "POST",
      credentials: "include",
      body,
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("Upload timed out. Try a smaller image or check Storage bucket setup.");
    }
    throw new Error("Upload failed (network). Is the API running?");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    throw new Error("Sign in again, then retry the upload.");
  }
  if (!res.ok) {
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  if (!data?.url) throw new Error("Bad upload response");
  return data.url;
}
