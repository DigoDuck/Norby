import api from "./axios";

export const recurringApi = {
  list: () => api.get("/recurring/"),
  create: (data) => api.post("/recurring/", data),
  update: (id, data) => api.put(`/recurring/${id}`, data),
  delete: (id) => api.delete(`/recurring/${id}`),
  run: () => api.post("/recurring/run"),
};
