import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock, LogOut, Save } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Settings() {
  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  function handleLogout() {
    logout();
    navigate("/");
  }

  async function handleSave() {
    setError(null);
    try {
      const res = await authApi.updateProfile(form);
      updateUser(res.data); // só atualiza o store após sucesso no backend
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Não foi possível salvar.");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-black">Configurações</h1>
        <p className="text-black/80 text-sm mt-1">Gerencie seu perfil</p>
      </div>

      {/* Perfil */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <User size={20} className="text-violet-400" />
          <h2 className="font-semibold text-black/80">Perfil</h2>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-3xl bg-violet-600 flex items-center justify-center text-2xl font-bold text-white">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-black">{user?.name}</p>
            <p className="text-sm text-black/80">{user?.email}</p>
          </div>
        </div>
        <Input
          placeholder="Nome"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="bg-white/10 text-black placeholder:text-black/60"
        />
        <Input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="bg-white/10 text-black placeholder:text-black/60"
        />
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <Button
          onClick={handleSave}
          className="bg-violet-600 hover:bg-violet-500 text-white"
        >
          <Save size={15} className="mr-1.5" />
          {saved ? "Salvo!" : "Salvar alterações"}
        </Button>
      </div>
      {/* Segurança */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Lock size={18} className="text-violet-400" />
          <h2 className="font-semibold text-black/80">Segurança</h2>
        </div>
        <p className="text-sm text-black/80">
          Sua senha é armazenada com hash bcrypt. Para alterar, entre em contato
          com o suporte.
        </p>
      </div>
      {/* Logout */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-black/80">Sair da Conta</h2>
          <p className="text-sm text-black/60 mt-1">
            Você será redirecionado para o login
          </p>
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="border-red-500 text-red-400 hover:bg-red-500 hover:text-white"
        >
          <LogOut size={15} className="mr-1.5" /> Sair
        </Button>
      </div>
    </div>
  );
}
