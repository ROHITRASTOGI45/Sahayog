const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
export async function api(path, options = {}) {
  const isSystemAdminRequest = String(path).startsWith("/system-admin");
  const storedAdmin = isSystemAdminRequest ? localStorage.getItem("sahayog_system_admin_session") : null;
  let adminToken = null;
  try { adminToken = JSON.parse(storedAdmin || "null")?.accessToken || null; } catch {}
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...(options.headers || {}),
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}
export { API_BASE };
