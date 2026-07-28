import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function AppLayout() {
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
