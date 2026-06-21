import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
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
