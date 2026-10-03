import api from "./axios";

export const transfersApi = {
  // `wallet_id` filtra as transferências em que a carteira é origem OU destino.
  list: (params) => api.get("/transfers/", { params }),
  // Total com o mesmo filtro de `list`: a lista é paginada.
  summary: (params) => api.get("/transfers/summary", { params }),
  create: (data) => api.post("/transfers/", data),
  delete: (id) => api.delete(`/transfers/${id}`),
};
