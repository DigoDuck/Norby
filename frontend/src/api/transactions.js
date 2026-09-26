import api from "./axios";

export const transactionsApi = {
    list: (params) => api.get("/transactions/", { params }),
    // Totais (count, income, expenses) do que `list` mostraria com os mesmos filtros.
    summary: (params) => api.get("/transactions/summary", { params }),
    create: (data) => api.post("/transactions/", data),
    update: (id, data) => api.put(`/transactions/${id}`, data),
    delete: (id) => api.delete(`/transactions/${id}`),
};
