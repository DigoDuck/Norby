import api from "./axios";
import { useAuthStore } from "../store/authStore";

export const authApi = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
  updateProfile: (data) => api.put("/auth/me", data),
  refresh: (refreshToken) => api.post("/auth/refresh", { refresh_token: refreshToken }),
  // Logout best-effort: revoga o refresh no backend e limpa o estado local.
  // Falha de rede não impede o logout local.
  logout: async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      try {
        await api.post("/auth/logout", { refresh_token: refreshToken });
      } catch {
        /* ignora: o importante é limpar o estado local abaixo */
      }
    }
    useAuthStore.getState().logout();
  },
};
