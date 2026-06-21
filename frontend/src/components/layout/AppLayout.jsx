import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Aurora from "../Aurora";

export default function AppLayout() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-norby-night">

      {/* 1. Camada de Fundo (Aurora teal) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={["#2DB5A3", "#6FD4C6", "#156358"]}
          amplitude={1}
          blend={0.75}
        />
        {/* Overlay escuro: dark-first, deixa só o glow teal vazar */}
        <div className="absolute inset-0 bg-norby-night/60 backdrop-blur-[20px]" />
      </div>
      
      <div className="relative z-10 flex h-screen">
        <Sidebar />
        
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}