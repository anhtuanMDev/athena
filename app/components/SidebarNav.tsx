import { Link, useParams, useLocation } from "react-router";
import { 
  LayoutDashboard, 
  Activity, 
  Gamepad2, 
  Users, 
  Map, 
  Swords, 
  FileClock, 
  Box, 
  Database,
  LogOut,
  ChevronRight
} from "lucide-react";
import React from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
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
    <aside className="w-64 min-h-screen bg-white/50 dark:bg-gray-950/50 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-800/50 flex flex-col relative z-10 transition-all duration-300">
      <div className="p-6 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-linear-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
          <Database className="w-4 h-4 text-white" />
        </div>
        <Link to="/dashboard" className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 tracking-tight">
          Athena
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
        <div className="space-y-1.5">
          <p className="px-3 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">General</p>
          <NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} isActive={isActive("/dashboard")} />
          <NavLink href="/activity" label="Activity" icon={Activity} isActive={isActive("/activity")} />
          <NavLink href="/games" label="Games" icon={Gamepad2} isActive={isActive("/games")} />
        </div>
        {games.map((game) => (
          <div key={game.slug} className="space-y-1.5">
            <p className="px-3 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 mt-6">{game.name}</p>
            <NavLink href={`/${game.slug}/heroes`} label="Heroes" icon={Users} isActive={isActive(`/${game.slug}/heroes`)} />
            <NavLink href={`/${game.slug}/maps`} label="Maps" icon={Map} isActive={isActive(`/${game.slug}/maps`)} />
            <NavLink href={`/${game.slug}/modes`} label="Modes" icon={Swords} isActive={isActive(`/${game.slug}/modes`)} />
            <NavLink href={`/${game.slug}/patches`} label="Patches" icon={FileClock} isActive={isActive(`/${game.slug}/patches`)} />
            <NavLink href={`/${game.slug}/items`} label="Items" icon={Box} isActive={isActive(`/${game.slug}/items`)} />
            <NavLink href={`/${game.slug}/schema`} label="Schema" icon={Database} isActive={isActive(`/${game.slug}/schema`)} />
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-200/50 dark:border-gray-800/50">
        <form action="/logout" method="post">
          <button type="submit" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition-all duration-200 group">
            <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavLink({ href, label, icon: Icon, isActive }: NavItem & { isActive: boolean }) {
  return (
    <Link
      to={href}
      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300 shadow-sm shadow-violet-500/5"
          : "text-gray-600 hover:bg-gray-100/50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 transition-colors ${isActive ? "text-violet-600 dark:text-violet-400" : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`} />
        {label}
      </div>
      {isActive && <ChevronRight className="w-4 h-4 text-violet-600/50 dark:text-violet-400/50" />}
    </Link>
  );
}
