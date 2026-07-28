import {
  LayoutDashboard,
  Wallet,
  FileText,
  BrainCircuit,
  Settings,
  Repeat,
  Target,
} from "lucide-react";

// Lista única de rotas do shell, consumida pela Sidebar (desktop) e pelo
// MobileNav (gaveta). Fica fora dos componentes porque exportar constantes de
// um arquivo de componente quebra o fast refresh (react-refresh/only-export-components).
export const mainItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/wallets", icon: Wallet, label: "Carteiras" },
  { to: "/transactions", icon: FileText, label: "Relatórios" },
  { to: "/recurring", icon: Repeat, label: "Recorrências" },
  { to: "/goals", icon: Target, label: "Metas" },
  { to: "/ai", icon: BrainCircuit, label: "IA Analista" },
];

export const prefItems = [
  { to: "/settings", icon: Settings, label: "Configurações" },
];
