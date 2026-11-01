import { Link, useParams, useLocation } from "react-router";
import {
  LayoutDashboard,
  Activity,
  Gamepad2,
  Users,
  Map,
  Swords,
  FileClock,
  Newspaper,
  Box,
  Database,
  Clock,
  LogOut,
  ChevronRight,
  ChevronDown,
  List,
  LayoutTemplate,
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

export function SidebarNav({
  games,
  onClose,
}: {
  games: GameSection[];
  onClose?: () => void;
}) {
  const location = useLocation();
  const params = useParams();
  const gameSlug = params.game;

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  return (
    <aside className="w-64 h-full bg-surface border-r border-border flex flex-col relative z-10">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border border-border shrink-0">
          <img
            src="/favicon.svg"
            alt=""
            className="w-6 h-6 object-contain"
          />
        </div>
        <Link
          to="/dashboard"
          className="text-xl font-bold tracking-tight text-ink rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Athena
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
        <div className="space-y-1.5">
          <p className="px-3 text-xs font-bold text-ink-muted uppercase tracking-widest mb-3">
            General
          </p>
          <NavLink
            href="/dashboard"
            label="Dashboard"
            icon={LayoutDashboard}
            isActive={isActive("/dashboard")}
            onClick={onClose}
          />
          <NavLink
            href="/activity"
            label="Activity"
            icon={Activity}
            isActive={isActive("/activity")}
            onClick={onClose}
          />
          <NavLink
            href="/games"
            label="Games"
            icon={Gamepad2}
            isActive={isActive("/games")}
            onClick={onClose}
          />
        </div>
        {games.map((game) => (
          <CollapsibleGameSection
            key={game.slug}
            game={game}
            isActive={isActive}
            onClose={onClose}
          />
        ))}
      </nav>
      <div className="p-4 border-t border-border">
        <form action="/logout" method="post">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-muted hover:text-danger-ink hover:bg-danger/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onClick,
}: NavItem & {
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
        isActive
          ? "bg-primary-tint text-primary-ink shadow-sm"
          : "text-ink-muted hover:bg-surface-raised hover:text-ink"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="w-4 h-4" />
        {label}
      </div>
      {isActive && <ChevronRight aria-hidden="true" className="w-4 h-4" />}
    </Link>
  );
}

function CollapsibleGameSection({
  game,
  isActive,
  onClose,
}: {
  game: GameSection;
  isActive: (href: string) => boolean;
  onClose?: () => void;
}) {
  const isAnyActive =
    isActive(`/${game.slug}/heroes`) ||
    isActive(`/${game.slug}/maps`) ||
    isActive(`/${game.slug}/modes`) ||
    isActive(`/${game.slug}/patches`) ||
    isActive(`/${game.slug}/news`) ||
    isActive(`/${game.slug}/items`) ||
    isActive(`/${game.slug}/schemas`) ||
    isActive(`/${game.slug}/screens`) ||
    isActive(`/${game.slug}/enums`) ||
    isActive(`/${game.slug}/cron`);

  const [isOpen, setIsOpen] = useState(isAnyActive);

  return (
    <div className="space-y-1.5 mt-6">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-3 py-1 mb-2 rounded-md group cursor-pointer text-ink-muted hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div className="flex items-center gap-2">
          {game.icon ? (
            <div className="h-5 min-w-[20px] px-1 bg-white rounded flex items-center justify-center shadow-xs ring-1 ring-black/5 shrink-0">
              <img
                src={game.icon}
                alt=""
                className="h-3.5 w-auto object-contain"
              />
            </div>
          ) : (
            <Gamepad2 aria-hidden="true" className="w-4 h-4" />
          )}
          <span className="text-xs font-bold uppercase tracking-widest">
            {game.name}
          </span>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={`w-3 h-3 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <div className={isOpen ? "space-y-1.5" : "hidden"}>
        <NavLink
          href={`/${game.slug}/heroes`}
          label="Heroes"
          icon={Users}
          isActive={isActive(`/${game.slug}/heroes`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/maps`}
          label="Maps"
          icon={Map}
          isActive={isActive(`/${game.slug}/maps`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/modes`}
          label="Modes"
          icon={Swords}
          isActive={isActive(`/${game.slug}/modes`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/patches`}
          label="Patches"
          icon={FileClock}
          isActive={isActive(`/${game.slug}/patches`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/news`}
          label="News"
          icon={Newspaper}
          isActive={isActive(`/${game.slug}/news`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/items`}
          label="Items"
          icon={Box}
          isActive={isActive(`/${game.slug}/items`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/schemas`}
          label="Schemas"
          icon={Database}
          isActive={isActive(`/${game.slug}/schemas`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/screens`}
          label="App Screens"
          icon={LayoutTemplate}
          isActive={isActive(`/${game.slug}/screens`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/enums`}
          label="Enums"
          icon={List}
          isActive={isActive(`/${game.slug}/enums`)}
          onClick={onClose}
        />
        <NavLink
          href={`/${game.slug}/cron`}
          label="Cron Jobs"
          icon={Clock}
          isActive={isActive(`/${game.slug}/cron`)}
          onClick={onClose}
        />
      </div>
    </div>
  );
}
