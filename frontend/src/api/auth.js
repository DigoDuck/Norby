import api from "./axios";
import { useAuthStore } from "../store/authStore";

export const authApi = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
  updateProfile: (data) => api.put("/auth/me", data),
  refresh: () => api.post("/auth/refresh"),
  // Anônimas: a resposta é sempre a mesma exista o e-mail ou não, então não há
  // nada a interpretar aqui além de "deu certo" ou "deu erro de rede".
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token, newPassword) =>
    api.post("/auth/reset-password", { token, new_password: newPassword }),
  // Logout best-effort: revoga o refresh (que vai no cookie) e limpa o estado
  // local. Falha de rede não impede o logout local.
  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignora: o importante é limpar o estado local abaixo */
    }
    useAuthStore.getState().logout();
  },
};
