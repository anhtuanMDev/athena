import { data, Outlet, redirect, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/_admin";
import { requireAdmin } from "~/lib/session.server";
import { listGames } from "~/lib/github.server";
import { SidebarNav } from "~/components/SidebarNav";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const games = await listGames();
  if (params.game && !games.some((g) => g.slug === params.game)) {
    throw data(`Game "${params.game}" not found`, { status: 404 });
  }
  return { games: games.filter((g) => g.active).map((g) => ({ slug: g.slug, name: g.name })) };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen">
      <SidebarNav games={loaderData.games} />
      <main className="flex-1 p-8 bg-white dark:bg-gray-950 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
