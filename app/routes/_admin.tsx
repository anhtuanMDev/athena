import { Outlet, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { checkSession } from "~/lib/auth";
import { listGames } from "~/lib/github";
import { SidebarNav } from "~/components/SidebarNav";
import { useData } from "~/lib/use-data";

import { ReauthModal } from "~/components/ReauthModal";

export default function AdminLayout() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: games, loading, error } = useData(async () => {
    const ok = await checkSession();
    if (!ok) throw new Error("unauthorized");
    const allGames = await listGames();
    return allGames.filter((g) => g.active).map((g) => ({ slug: g.slug, name: g.name, icon: g.icon }));
  }, [], "_admin-13");

  useEffect(() => {
    if (error instanceof Error && (error.message === "unauthorized" || error.message.includes("Unauthorized"))) {
      if (typeof window !== "undefined" && localStorage.getItem("has_session") === "true") {
        window.dispatchEvent(new CustomEvent("AUTH_EXPIRED"));
      } else {
        navigate("/login");
      }
    }
  }, [error, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-page items-center justify-center">
        <div role="status" className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-tint flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary-ink border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
          </div>
          <p className="text-sm font-medium text-ink-muted">Initializing Command Center…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <ReauthModal />

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-surface border-b border-border z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-border shrink-0">
            <img src="/favicon.svg" alt="" className="w-6 h-6 object-contain" />
          </div>
          <span className="text-xl font-bold tracking-tight text-ink">
            Athena
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
          className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {isMobileMenuOpen ? <X aria-hidden="true" className="w-6 h-6" /> : <Menu aria-hidden="true" className="w-6 h-6" />}
        </button>
      </div>

      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden lg:block z-20">
        <SidebarNav games={games ?? []} />
      </div>

      {/* Mobile Sidebar (overlay) */}
      <div className={`lg:hidden fixed inset-0 z-50 transition-[opacity,visibility] duration-300 motion-reduce:transition-none ${isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none invisible"}`}>
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/50" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
        {/* Sidebar panel */}
        <div className={`absolute inset-y-0 left-0 transform transition-transform duration-300 ease-out motion-reduce:transition-none ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
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
