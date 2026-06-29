import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      login: (token, refreshToken, user) =>
        set({ token, refreshToken, user, isAuthenticated: true }),
      // Atualiza só o par de tokens (usado na rotação do refresh), mantém o user.
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      logout: () =>
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false }),
      updateUser: (userData) =>
        set((state) => ({
          // Atualiza apenas os campos fornecidos, mantendo os outros intactos
          user: { ...state.user, ...userData },
        })),
    }),
    {
      name: "norby-auth", // Salva no localStorage automaticamente
    },
  ),
);
