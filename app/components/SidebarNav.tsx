import { Link, useParams, useLocation } from "react-router";

interface NavItem {
  label: string;
  href: string;
}

interface GameSection {
  slug: string;
  name: string;
}

export function SidebarNav({ games }: { games: GameSection[] }) {
  const location = useLocation();
  const params = useParams();
  const gameSlug = params.game;

  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + "/");

  return (
    <aside className="w-64 min-h-screen bg-gray-50 border-r border-gray-200 dark:bg-gray-900 dark:border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <Link to="/dashboard" className="text-lg font-bold text-gray-900 dark:text-white">
          Athena Admin
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">General</p>
          <NavLink href="/dashboard" label="Dashboard" isActive={isActive("/dashboard")} />
          <NavLink href="/activity" label="Activity" isActive={isActive("/activity")} />
          <NavLink href="/games" label="Games" isActive={isActive("/games")} />
        </div>
        {games.map((game) => (
          <div key={game.slug} className="space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{game.name}</p>
            <NavLink href={`/${game.slug}/heroes`} label="Heroes" isActive={isActive(`/${game.slug}/heroes`)} />
            <NavLink href={`/${game.slug}/maps`} label="Maps" isActive={isActive(`/${game.slug}/maps`)} />
            <NavLink href={`/${game.slug}/modes`} label="Modes" isActive={isActive(`/${game.slug}/modes`)} />
            <NavLink href={`/${game.slug}/patches`} label="Patches" isActive={isActive(`/${game.slug}/patches`)} />
            <NavLink href={`/${game.slug}/items`} label="Items" isActive={isActive(`/${game.slug}/items`)} />
            <NavLink href={`/${game.slug}/schema`} label="Schema" isActive={isActive(`/${game.slug}/schema`)} />
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <form action="/logout" method="post">
          <button type="submit" className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavLink({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  return (
    <Link
      to={href}
      className={`block px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-blue-100 text-blue-700 font-medium dark:bg-blue-900 dark:text-blue-200"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      }`}
    >
      {label}
    </Link>
  );
}
