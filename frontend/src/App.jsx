import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuthStore } from "./store/authStore";
import { authApi } from "./api/auth";
import AppLayout from "./components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Wallets from "./pages/Wallets";
import Transactions from "./pages/Transactions";
import AIAnalyst from "./pages/AIAnalyst";
import Settings from "./pages/Settings";
import Recurring from "./pages/Recurring";
import Goals from "./pages/Goals";
import Privacidade from "./pages/Privacidade";
import Termos from "./pages/Termos";
import EsqueciSenha from "./pages/EsqueciSenha";
import RedefinirSenha from "./pages/RedefinirSenha";

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

// A raiz é a porta de entrada: com sessão válida ela leva ao dashboard em vez
// de mostrar login de novo. O boot em App já validou o token no /auth/me, então
// aqui isAuthenticated só é true se o backend confirmou.
function RootRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Auth />;
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [booting, setBooting] = useState(isAuthenticated);

  // No boot: se a sessão sobreviveu à recarga, pede um access token novo com o
  // cookie de refresh e revalida o usuário antes de liberar as rotas (#110,
  // #100). Cookie expirado ou revogado -> logout, sem "flash" de tela protegida.
  useEffect(() => {
    if (!isAuthenticated) return;
    authApi
      // authApi.refresh() já guarda o token novo no store (single-flight em
      // ./axios); aqui só encadeamos o /auth/me depois que ele resolve.
      .refresh()
      .then(() => authApi.me())
      .then((res) => useAuthStore.getState().updateUser(res.data))
      .catch(() => useAuthStore.getState().logout())
      .finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base text-content-2">
        Carregando...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/termos" element={<Termos />} />
        {/* Públicas de propósito: quem esqueceu a senha não tem como estar
            autenticado, e o link de redefinição chega por e-mail. */}
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/wallets" element={<Wallets />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/ai" element={<AIAnalyst />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
