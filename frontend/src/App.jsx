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

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/" replace />;
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const [booting, setBooting] = useState(true);

  // No boot: se há token persistido, valida no backend antes de liberar as rotas.
  // Token expirado/inválido -> logout, evitando o "flash" de tela protegida.
  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    authApi
      .me()
      .then((res) => {
        useAuthStore.getState().updateUser(res.data);
        return import("./api/recurring").then((m) => m.recurringApi.run().catch(() => {}));
      })
      .catch(() => useAuthStore.getState().logout())
      .finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-white/60">
        Carregando...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/termos" element={<Termos />} />
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
