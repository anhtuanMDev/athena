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
  ChevronRight,
  ChevronDown
} from "lucide-react";
import React, { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface GameSection {
  slug: string;
  name: string;
  icon?: string;
}

export function SidebarNav({ games }: { games: GameSection[] }) {
  const location = useLocation();
  const params = useParams();
  const gameSlug = params.game;

  const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + "/");

  return (
    <aside className="w-64 h-full bg-white/50 dark:bg-gray-950/50 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-800/50 flex flex-col relative z-10 transition-all duration-300">
      <div className="p-6 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-linear-to-tr from-blue-600 to-orange-500 flex items-center justify-center shadow-lg shadow-blue-500/30 overflow-hidden p-1.5">
          <img src="/favicon.ico" alt="Athena Logo" className="w-full h-full object-contain filter brightness-0 invert" />
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
          <CollapsibleGameSection key={game.slug} game={game} isActive={isActive} />
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
          ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 shadow-sm shadow-orange-500/5"
          : "text-gray-600 hover:bg-gray-100/50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/50 dark:hover:text-gray-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 transition-colors ${isActive ? "text-orange-600 dark:text-orange-400" : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`} />
        {label}
      </div>
      {isActive && <ChevronRight className="w-4 h-4 text-orange-600/50 dark:text-orange-400/50" />}
    </Link>
  );
}

function CollapsibleGameSection({ game, isActive }: { game: GameSection; isActive: (href: string) => boolean }) {
  const isAnyActive = 
    isActive(`/${game.slug}/heroes`) || 
    isActive(`/${game.slug}/maps`) || 
    isActive(`/${game.slug}/modes`) || 
    isActive(`/${game.slug}/patches`) || 
    isActive(`/${game.slug}/items`) || 
    isActive(`/${game.slug}/schema`);
  
  const [isOpen, setIsOpen] = useState(isAnyActive);

  return (
    <div className="space-y-1.5 mt-6">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 mb-2 group cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {game.icon ? (
            <img src={game.icon} alt={game.name} className="w-4 h-4 rounded-md object-cover" />
          ) : (
            <Gamepad2 className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          )}
          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
            {game.name}
          </span>
        </div>
        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      
      <div className={`space-y-1.5 overflow-hidden transition-all duration-300 ${isOpen ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
        <NavLink href={`/${game.slug}/heroes`} label="Heroes" icon={Users} isActive={isActive(`/${game.slug}/heroes`)} />
        <NavLink href={`/${game.slug}/maps`} label="Maps" icon={Map} isActive={isActive(`/${game.slug}/maps`)} />
        <NavLink href={`/${game.slug}/modes`} label="Modes" icon={Swords} isActive={isActive(`/${game.slug}/modes`)} />
        <NavLink href={`/${game.slug}/patches`} label="Patches" icon={FileClock} isActive={isActive(`/${game.slug}/patches`)} />
        <NavLink href={`/${game.slug}/items`} label="Items" icon={Box} isActive={isActive(`/${game.slug}/items`)} />
        <NavLink href={`/${game.slug}/schema`} label="Schema" icon={Database} isActive={isActive(`/${game.slug}/schema`)} />
      </div>
    </div>
  );
}
