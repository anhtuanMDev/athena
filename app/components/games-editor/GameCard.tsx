import { Pencil } from "lucide-react";

import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { NEW_GAME_PALETTE } from "~/lib/game-palette";
import { isGameActive } from "~/lib/games";

import type { Game } from "~/schemas/game";

interface GameCardProps {
  game: Game;
  onEdit: () => void;
}

/** A game on the games page: its icon (or primary color), name, status, slug and developer. */
export function GameCard({ game, onEdit }: GameCardProps) {
  const isActive = isGameActive(game);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {game.icon ? (
              <div className="h-8 min-w-[32px] px-1.5 bg-white rounded-md flex items-center justify-center shadow-sm ring-1 ring-black/5 shrink-0 overflow-hidden">
                <img src={game.icon} alt={game.name} className="h-5 w-auto object-contain" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-md border border-border" style={{ backgroundColor: game.primary || NEW_GAME_PALETTE.primary }} />
            )}
            <h2 className="text-lg font-semibold text-ink">{game.name}</h2>
          </div>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-ink-muted mb-2">
          Slug: <code className="text-ink">{game.slug}</code>
        </p>
        {game.developer && <p className="text-sm text-ink-muted">{game.developer}</p>}
        <div className="mt-3 flex gap-3">
          <button onClick={onEdit} className="text-sm flex items-center gap-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
