import api from "./axios";

export const goalsApi = {
  list: () => api.get("/goals/"),
  create: (data) => api.post("/goals/", data),
  update: (id, data) => api.put(`/goals/${id}`, data),
  delete: (id) => api.delete(`/goals/${id}`),
  contribute: (id, amount) => api.post(`/goals/${id}/contribute`, { amount }),
};
