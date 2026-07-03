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

  if (loading) return <div>Loading...</div>;

  return (
    <div className="flex min-h-screen">
      <SidebarNav games={games ?? []} />
      <main className="flex-1 p-8 bg-white dark:bg-gray-950 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
