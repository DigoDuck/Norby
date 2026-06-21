import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import {
  LayoutDashboard,
  Wallet,
  FileText,
  BrainCircuit,
  MoonStar,
  Settings,
  LogOut,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/wallets", icon: Wallet, label: "Carteiras" },
  { to: "/transactions", icon: FileText, label: "Relatórios" },
  { to: "/ai", icon: BrainCircuit, label: "IA Analista" },
  { to: "/settings", icon: Settings, label: "Configurações" },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <aside className="w-64 h-screen bg-white/60 backdrop-blur-xl border-r border-white/50 flex flex-col px-4 py-6 shrink-0 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-900 flex items-center justify-center shadow-md shadow-violet-900/20">
          <MoonStar size={18} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-zinc-900 leading-none">Norby</p>
          <p className="text-xs text-zinc-500 mt-0.5">AI Finance</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30"
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-white/60"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* IA do Mês — destaque */}
      <div className="p-4 mb-4 bg-violet-50/80 backdrop-blur-sm border border-violet-100 rounded-2xl">
        <div className="flex items-center gap-2 mb-1">
          <BrainCircuit size={14} className="text-violet-700" />
          <span className="text-xs font-semibold text-violet-700">
            IA do Mês
          </span>
        </div>
        <p className="text-xs text-violet-900/70">
          Acesse análises personalizadas do seu perfil financeiro.
        </p>
      </div>

      {/* User */}
      <div className="flex items-center gap-3 pt-4 border-t border-zinc-200/60 px-1">
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
          {user?.name?.[0]?.toUpperCase() || "U"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 truncate">
            {user?.name || "Usuário"}
          </p>
          <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}