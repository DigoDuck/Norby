import api from "./axios";

export const transfersApi = {
  // `wallet_id` filtra as transferências em que a carteira é origem OU destino.
  list: (params) => api.get("/transfers/", { params }),
  create: (data) => api.post("/transfers/", data),
  delete: (id) => api.delete(`/transfers/${id}`),
};
