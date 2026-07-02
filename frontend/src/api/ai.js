import api from "./axios";

export const aiApi = {
  getInsight: () => api.get("/ai/insight"),
  chat: (data) => api.post("/ai/chat", data),
  getSessions: () => api.get("/ai/chat/sessions"),
  getSession: (id) => api.get(`/ai/chat/sessions/${id}`),
};
