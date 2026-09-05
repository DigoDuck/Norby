import api from "./axios";

export const accountApi = {
  // Baixa o JSON de dados como blob (LGPD: portabilidade).
  exportData: () => api.get("/auth/me/export", { responseType: "blob" }),
  // Exclui a conta de forma definitiva (LGPD). Exige confirmação + senha atual.
  deleteAccount: (password) =>
    api.delete("/auth/me", { data: { confirm: true, password } }),

  // Foto de perfil (#35). O arquivo vai no corpo CRU, sem FormData: a rota
  // recebe bytes justamente para poder cortar pelo tamanho antes de gravar
  // qualquer coisa. O content-type declarado aqui é ignorado pelo servidor,
  // que sniffa o conteúdo.
  uploadPhoto: (file) =>
    api.put("/auth/me/photo", file, {
      headers: { "Content-Type": file.type || "application/octet-stream" },
    }),
  deletePhoto: () => api.delete("/auth/me/photo"),
  // Blob porque a rota é FECHADA: `<img src>` não manda o token, então o
  // download passa pelo axios e vira data URI no store.
  photo: () => api.get("/auth/me/photo", { responseType: "blob" }),
};
