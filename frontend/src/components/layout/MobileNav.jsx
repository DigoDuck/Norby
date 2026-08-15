import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X, LogOut } from "lucide-react";
import { authApi } from "../../api/auth";
import NorbyMark from "../shared/Logo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { mainItems, prefItems } from "./navItems";

// Abaixo de lg a sidebar vira gaveta. Todas as rotas e o logout continuam
// acessíveis — nada é escondido, só recolhido.
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = [...mainItems, ...prefItems];

  async function handleLogout() {
    await authApi.logout();
    navigate("/");
  }

  return (
    <>
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 glass rounded-none flex items-center gap-3 px-4 h-14">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="p-2 -ml-2 rounded-lg text-content-2 hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Menu size={20} />
        </button>
        <div className="brand-tile w-8 h-8">
          <NorbyMark size={18} />
        </div>
        <p className="font-bold text-content">Norby</p>
      </header>

      {/* Dialog em vez de `{open && <div>}`: traz trap de foco, fechar no Esc e
          devolução do foco ao gatilho sem código próprio. Como div solto, a
          página de trás continuava navegável por Tab e o foco se perdia no
          fechamento. O backdrop clicável também vem do primitivo. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          aria-label="Menu de navegação"
          className="lg:hidden inset-y-0 left-0 top-0 w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none bg-transparent p-0 ring-0"
        >
          <nav className="relative h-full w-full glass rounded-none flex flex-col px-4 py-6 gap-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="self-end p-2 rounded-lg text-content-2 hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X size={18} />
            </button>

            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                      isActive
                        ? "nav-active text-accent dark:text-content"
                        : "text-content-2"
                    }`
                  }
                >
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              );
            })}

            <button
              type="button"
              onClick={handleLogout}
              className="mt-auto flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <LogOut size={18} /> Sair
            </button>
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}
