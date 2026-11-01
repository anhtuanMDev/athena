import { Outlet, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import Drawer from "@mui/material/Drawer";
import { checkSession } from "~/lib/auth";
import { getFile, listGames } from "~/lib/github";
import { CATEGORIES_PATH, DEFAULT_CATEGORIES, normalizeCategories } from "~/lib/categories";
import { CategoriesProvider } from "~/lib/categories-context";
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

  const [categoriesVersion, setCategoriesVersion] = useState(0);
  const { data: categories } = useData(
    async () => {
      const file = await getFile(CATEGORIES_PATH).catch(() => null);
      return file ? normalizeCategories(file.content).categories : [...DEFAULT_CATEGORIES];
    },
    [categoriesVersion],
    `_admin-categories-${categoriesVersion}`,
  );
  const categoriesValue = { categories: categories ?? DEFAULT_CATEGORIES, reload: () => setCategoriesVersion((v) => v + 1) };

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
    <CategoriesProvider value={categoriesValue}>
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

      {/* Mobile Sidebar (drawer) */}
      <Drawer
        open={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        sx={{ display: { lg: "none" } }}
        slotProps={{ paper: { role: "dialog", "aria-modal": true, "aria-label": "Navigation" } }}
      >
        <SidebarNav games={games ?? []} onClose={() => setIsMobileMenuOpen(false)} />
      </Drawer>
      
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10 pt-16 lg:pt-0">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:px-12 xl:px-16 pb-24 scrollbar-hide">
          <div className="w-full max-w-[100vw]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
    </CategoriesProvider>
  );
}
