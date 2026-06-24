import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import {
  LayoutDashboard,
  Wallet,
  FileText,
  BrainCircuit,
  Settings,
  LogOut,
  Repeat,
  Target,
} from "lucide-react";
import NorbyMark from "../shared/Logo";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/wallets", icon: Wallet, label: "Carteiras" },
  { to: "/transactions", icon: FileText, label: "Relatórios" },
  { to: "/recurring", icon: Repeat, label: "Recurring" },
  { to: "/goals", icon: Target, label: "Goals" },
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
    <aside className="w-64 h-screen bg-norby-surface/60 backdrop-blur-xl border-r border-white/10 flex flex-col px-4 py-6 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-9 h-9 rounded-xl bg-norby-teal flex items-center justify-center shadow-md shadow-norby-teal/20">
          <NorbyMark size={20} color="#07100F" />
        </div>
        <div>
          <p className="font-bold text-norby-ivory leading-none">Norby</p>
          <p className="text-xs text-norby-ivory/40 mt-0.5">seu norte financeiro</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-norby-teal text-norby-night shadow-lg shadow-norby-teal/20"
                  : "text-norby-ivory/50 hover:text-norby-ivory hover:bg-white/5"
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* IA do Mês — destaque */}
      <div className="p-4 mb-4 bg-norby-teal/10 backdrop-blur-sm border border-norby-teal/20 rounded-2xl">
        <div className="flex items-center gap-2 mb-1">
          <BrainCircuit size={14} className="text-norby-teal" />
          <span className="text-xs font-semibold text-norby-teal">IA do Mês</span>
        </div>
        <p className="text-xs text-norby-ivory/60">
          Acesse análises personalizadas do seu perfil financeiro.
        </p>
      </div>

      {/* User */}
      <div className="flex items-center gap-3 pt-4 border-t border-white/10 px-1">
        <div className="w-8 h-8 rounded-full bg-norby-teal flex items-center justify-center text-xs font-bold text-norby-night shadow-sm">
          {user?.name?.[0]?.toUpperCase() || "U"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-norby-ivory truncate">
            {user?.name || "Usuário"}
          </p>
          <p className="text-xs text-norby-ivory/40 truncate">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-norby-ivory/40 hover:text-norby-ivory transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
