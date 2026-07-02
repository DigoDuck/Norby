import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { authApi } from "../../api/auth";
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
import NorthStar from "../shared/NorthStar";
import AiOrb from "../shared/AiOrb";

const mainItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/wallets", icon: Wallet, label: "Carteiras" },
  { to: "/transactions", icon: FileText, label: "Relatórios" },
  { to: "/recurring", icon: Repeat, label: "Recorrências" },
  { to: "/goals", icon: Target, label: "Metas" },
  { to: "/ai", icon: BrainCircuit, label: "IA Analista" },
];

const prefItems = [
  { to: "/settings", icon: Settings, label: "Configurações" },
];

// Item de navegação: ativo = estrela-norte teal + texto ivory sobre fundo
// sutil (o teal chapado fica reservado ao CTA primário — ver DESIGN.md).
function NavItem({ to, icon, label }) {
  const Icon = icon;
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ${
          isActive
            ? "bg-white/[0.06] text-norby-ivory"
            : "text-norby-ivory/50 hover:text-norby-ivory hover:bg-white/[0.03]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className={isActive ? "text-norby-teal" : ""} />
          {label}
          {isActive && (
            <NorthStar size={12} className="ml-auto text-norby-teal" />
          )}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await authApi.logout();
    navigate("/");
  }

  return (
    <aside className="w-64 h-screen bg-norby-surface/60 backdrop-blur-xl border-r border-white/[0.06] flex flex-col px-4 py-6 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-9 h-9 rounded-xl bg-norby-teal flex items-center justify-center shadow-md shadow-norby-teal/20">
          <NorbyMark size={20} color="#07100F" />
        </div>
        <div>
          <p className="font-bold text-norby-ivory leading-none">Norby</p>
          <p className="text-xs text-norby-ivory/40 mt-0.5">seu norte financeiro</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1 overflow-y-auto">
        <p className="microlabel px-3 mb-1.5">Menu principal</p>
        {mainItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <p className="microlabel px-3 mt-6 mb-1.5">Preferências</p>
        {prefItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* IA do Mês — atalho para o analista */}
      <NavLink
        to="/ai"
        className="group flex items-center gap-3 p-3.5 mb-4 bg-norby-teal/[0.08] border border-norby-teal/20 rounded-2xl transition-colors hover:bg-norby-teal/[0.14]"
      >
        <AiOrb size={34} pulse={false} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-norby-teal">IA do Mês</p>
          <p className="text-[11px] text-norby-ivory/55 leading-snug mt-0.5">
            Análises personalizadas do seu perfil financeiro
          </p>
        </div>
      </NavLink>

      {/* User */}
      <div className="flex items-center gap-3 pt-4 border-t border-white/[0.06] px-1">
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
          title="Sair"
          className="p-1.5 rounded-lg text-norby-ivory/40 hover:text-norby-ivory hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-norby-teal/50"
        >
          <LogOut size={16} />
          <span className="sr-only">Sair da conta</span>
        </button>
      </div>
    </aside>
  );
}
