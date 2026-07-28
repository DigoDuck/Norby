import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import Aurora from "../Aurora";

export default function AppLayout() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg-base app-mesh">
      {/* Atmosfera de fundo. O Aurora (WebGL) fica até a Task 21 comparar o
          build com e sem ele; o mesh CSS já é a camada de base. */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={["#637AFA", "#A78BFA", "#22D3EE"]}
          amplitude={1}
          blend={0.75}
        />
        <div className="absolute inset-0 bg-bg-base/70" />
      </div>

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
