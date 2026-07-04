import { Outlet, useNavigate } from "react-router";
import { useEffect } from "react";
import { checkSession } from "~/lib/auth";
import { listGames } from "~/lib/github";
import { SidebarNav } from "~/components/SidebarNav";
import { useData } from "~/lib/use-data";

export default function AdminLayout() {
  const navigate = useNavigate();

  const { data: games, loading, error } = useData(async () => {
    const ok = await checkSession();
    if (!ok) throw new Error("unauthorized");
    const allGames = await listGames();
    return allGames.filter((g) => g.active).map((g) => ({ slug: g.slug, name: g.name }));
  }, []);

  useEffect(() => {
    if (error?.message === "unauthorized") {
      navigate("/login");
    }
  }, [error, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-[#030712] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center animate-pulse">
            <div className="w-6 h-6 border-2 border-violet-600 dark:border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">Initializing Command Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-[#030712] selection:bg-violet-500/30">
      {/* Background ambient glow */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-500/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px]" />
      </div>

      <SidebarNav games={games ?? []} />
      
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative z-10">
        <div className="flex-1 overflow-y-auto p-8 lg:px-12 xl:px-16 pb-24 scrollbar-hide">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
