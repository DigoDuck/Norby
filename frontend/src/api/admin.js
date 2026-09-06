import api from "./axios";

export const adminApi = {
  metrics: () => api.get("/admin/metrics"),
  users: () => api.get("/admin/users"),
  cancelSubscription: (id, password) =>
    api.post(`/admin/users/${encodeURIComponent(id)}/cancel-subscription`, { password }),
  // axios manda corpo em DELETE via `data`; o backend lê a senha de lá, como no /auth/me.
  deleteUser: (id, password) =>
    api.delete(`/admin/users/${encodeURIComponent(id)}`, { data: { password } }),
  sendRecoveryEmail: (id, password) =>
    api.post(`/admin/users/${encodeURIComponent(id)}/recovery-email`, { password }),
};
