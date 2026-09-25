import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useAuthStore = create(
  persist(
    (set) => ({
      // Access token só em memória (#110): o refresh vive num cookie HttpOnly
      // que o JavaScript não lê. Recarregou a página, o App pede um access
      // token novo em /auth/refresh antes de liberar as rotas.
      token: null,
      user: null,
      isAuthenticated: false,
      // Foto de perfil como data URI (#35). Fica no store, e não numa <img>
      // apontando para a rota, porque a rota exige token. `photoFor` guarda o
      // `photo_updated_at` que originou este data URI: é o que evita baixar de
      // novo a cada montagem e o que faz a foto trocar depois de um upload.
      // Só em memória: uma recarga baixa de novo (poucos KB, 128px WebP).
      photo: null,
      photoFor: null,

      login: (token, user) =>
        // A foto do dono anterior não pode sobreviver a um login: sem zerar
        // aqui, quem entrasse em seguida veria o rosto de quem saiu.
        set({ token, user, isAuthenticated: true, photo: null, photoFor: null }),
      setPhoto: (photo, photoFor) => set({ photo, photoFor }),
      setToken: (token) => set({ token }),
      logout: () =>
        set({ token: null, user: null, isAuthenticated: false, photo: null, photoFor: null }),
      updateUser: (userData) =>
        set((state) => ({ user: { ...state.user, ...userData } })),
    }),
    {
      name: "norby-auth",
      // Só a flag sobrevive à recarga: é ela que manda o App tentar o
      // /auth/refresh no boot. O token nunca (#110). Usuário e foto também
      // não: o boot já busca /auth/me antes de liberar qualquer tela, então
      // guardá-los não poupava requisição — só deixava nome, e-mail e o rosto
      // de alguém num computador compartilhado sem prazo para sair.
      partialize: (s) => ({ isAuthenticated: s.isAuthenticated }),
      // Versão 0 guardava usuário e foto. A migração lê só a flag, então o
      // que estava gravado não volta à memória, e a próxima escrita o apaga.
      version: 1,
      migrate: (persistido) => ({ isAuthenticated: Boolean(persistido?.isAuthenticated) }),
    },
  ),
);
