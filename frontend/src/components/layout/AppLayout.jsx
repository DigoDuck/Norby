import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { recurringApi } from "@/api/recurring";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function AppLayout() {
  // Materializa recorrências vencidas ao entrar na área autenticada.
  //
  // Aqui e não no App: o App roda o efeito de boot uma vez só, com deps vazias,
  // e quando o login acontece DENTRO da SPA ele não remonta — as recorrências
  // ficariam pendentes até um reload. O AppLayout, por estar atrás do
  // ProtectedRoute, monta nos dois caminhos: boot com token persistido e login
  // na sessão. Um ponto de chamada, as duas entradas cobertas.
  useEffect(() => {
    recurringApi.run().catch(() => {});
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg-base app-mesh">
      <div className="relative z-10 flex h-screen p-0 lg:p-[18px]">
        <Sidebar />
        <MobileNav />

        <main className="flex-1 overflow-y-auto px-4 pt-16 pb-4 lg:px-6 lg:pt-5 lg:pb-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
