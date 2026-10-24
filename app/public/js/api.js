// Thin wrapper around fetch() for the TaskBoard REST API.

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  info: () => request("GET", "/api/info"),
  health: () => fetch("/health").then((r) => r.ok),
  stats: () => request("GET", "/api/stats"),
  list: (filters = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    return request("GET", "/api/tasks?" + params);
  },
  create: (task) => request("POST", "/api/tasks", task),
  update: (id, changes) => request("PATCH", "/api/tasks/" + id, changes),
  remove: (id) => request("DELETE", "/api/tasks/" + id),
  // keepalive lets a pending delete finish even while the page is closing
  removeOnUnload: (id) => fetch("/api/tasks/" + id, { method: "DELETE", keepalive: true }),
  clearDone: () => request("DELETE", "/api/tasks?status=done"),
};
