import api from "./axios";

export const accountApi = {
  // Baixa o JSON de dados como blob (LGPD: portabilidade).
  exportData: () => api.get("/auth/me/export", { responseType: "blob" }),
  // Exclui a conta de forma definitiva (LGPD). Exige confirmação + senha atual.
  deleteAccount: (password) =>
    api.delete("/auth/me", { data: { confirm: true, password } }),
};
