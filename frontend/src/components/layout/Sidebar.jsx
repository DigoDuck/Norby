import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { authApi } from "../../api/auth";
import { LogOut } from "lucide-react";
import NorbyMark from "../shared/Logo";
import NorthStar from "../shared/NorthStar";
import AiOrb from "../shared/AiOrb";
import { mainItems, prefItems } from "./navItems";

// Item de navegação: ativo = estrela-norte no acento sobre fundo sutil (o
// acento chapado fica reservado ao CTA primário — ver DESIGN.md).
function NavItem({ to, icon, label }) {
  const Icon = icon;
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-focus-offset ${
          isActive
            ? "bg-accent/[0.10] text-content"
            : "text-content-2 hover:text-content hover:bg-state/[0.04]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className={isActive ? "text-accent" : ""} />
          {label}
          {isActive && <NorthStar size={12} className="ml-auto text-accent" />}
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
    <aside className="hidden lg:flex w-64 h-full glass flex-col px-4 py-6 shrink-0 mr-[18px]">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-9 h-9 rounded-xl bg-accent-fill flex items-center justify-center text-accent-contrast">
          <NorbyMark size={20} />
        </div>
        <div>
          <p className="font-bold text-content leading-none">Norby</p>
          <p className="text-xs text-content-2 mt-0.5">seu norte financeiro</p>
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
        className="group flex items-center gap-3 p-3.5 mb-4 bg-accent/[0.08] border border-accent/20 rounded-2xl transition-colors hover:bg-accent/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-focus-offset"
      >
        <AiOrb size={34} pulse={false} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-accent">IA do Mês</p>
          <p className="text-[11px] text-content-2 leading-snug mt-0.5">
            Análises personalizadas do seu perfil financeiro
          </p>
        </div>
      </NavLink>

      {/* User */}
      <div className="flex items-center gap-3 pt-4 border-t border-line/[0.08] px-1">
        <div className="w-8 h-8 rounded-full bg-accent-fill flex items-center justify-center text-xs font-bold text-accent-contrast">
          {user?.name?.[0]?.toUpperCase() || "U"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-content truncate">
            {user?.name || "Usuário"}
          </p>
          <p className="text-xs text-content-2 truncate">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          title="Sair"
          className="p-1.5 rounded-lg text-content-2 hover:text-content hover:bg-state/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-focus-offset"
        >
          <LogOut size={16} />
          <span className="sr-only">Sair da conta</span>
        </button>
      </div>
    </aside>
  );
}
