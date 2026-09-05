import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      // Foto de perfil como data URI (#35). Fica no store, e não numa <img>
      // apontando para a rota, porque a rota exige token. `photoFor` guarda o
      // `photo_updated_at` que originou este data URI: é o que evita baixar de
      // novo a cada montagem e o que faz a foto trocar depois de um upload.
      photo: null,
      photoFor: null,

      login: (token, refreshToken, user) =>
        // A foto do dono anterior não pode sobreviver a um login: sem zerar
        // aqui, quem entrasse em seguida veria o rosto de quem saiu.
        set({ token, refreshToken, user, isAuthenticated: true, photo: null, photoFor: null }),
      setPhoto: (photo, photoFor) => set({ photo, photoFor }),
      // Atualiza só o par de tokens (usado na rotação do refresh), mantém o user.
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      logout: () =>
        set({
          token: null, refreshToken: null, user: null, isAuthenticated: false,
          photo: null, photoFor: null,
        }),
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
