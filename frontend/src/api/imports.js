import api from "./axios";

export const importsApi = {
  // Corpo cru, como o upload de foto: com FormData, o Content-Type JSON da
  // instância faria o axios converter o arquivo em JSON. A leitura pela IA
  // leva de 30 a 90 s (teste com 126 lançamentos), daí o timeout próprio.
  preview: (arquivo) =>
    api.post("/imports/statement", arquivo, {
      headers: { "Content-Type": arquivo.type || "application/octet-stream" },
      timeout: 180_000,
    }),
  confirm: (dados) => api.post("/imports/statement/confirm", dados),
};
