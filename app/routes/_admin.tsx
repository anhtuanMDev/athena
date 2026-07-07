import { Outlet, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { checkSession } from "~/lib/auth";
import { listGames } from "~/lib/github";
import { SidebarNav } from "~/components/SidebarNav";
import { useData } from "~/lib/use-data";

export default function AdminLayout() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: games, loading, error } = useData(async () => {
    const ok = await checkSession();
    if (!ok) throw new Error("unauthorized");
    const allGames = await listGames();
    return allGames.filter((g) => g.active).map((g) => ({ slug: g.slug, name: g.name, icon: g.icon, primaryColor: g.primaryColor }));
  }, [], "_admin-13");

  useEffect(() => {
    if (error instanceof Error && error.message === "unauthorized") {
      navigate("/login");
    }
  }, [error, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-[#030712] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-600/20 flex items-center justify-center animate-pulse">
            <div className="w-6 h-6 border-2 border-orange-600 dark:border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">Initializing Command Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#030712] selection:bg-orange-500/30">
      {/* Background ambient glow */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-orange-500/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px]" />
      </div>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-[#030712]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3 rounded-xl bg-linear-to-tr from-blue-600 to-orange-500 p-2">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
            <img src="/favicon.svg" alt="Athena Logo" className="w-6 h-6 object-contain" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight pr-2">
            Athena
          </span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-600 dark:text-gray-300">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden lg:block z-20">
        <SidebarNav games={games ?? []} />
      </div>

      {/* Mobile Sidebar (overlay) */}
      <div className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/50" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
        {/* Sidebar panel */}
        <div className={`absolute inset-y-0 left-0 transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <SidebarNav games={games ?? []} onClose={() => setIsMobileMenuOpen(false)} />
        </div>
      </div>
      
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10 pt-16 lg:pt-0">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:px-12 xl:px-16 pb-24 scrollbar-hide">
          <div className="w-full max-w-[100vw]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
