import { useState } from "react";

import { Button } from "~/components/ui/button";
import { LoadErrorState } from "~/components/ui/LoadErrorState";
import { listGames } from "~/lib/github";
import { useData } from "~/lib/use-data";

import { GameCard } from "./GameCard";
import { GameDrawer } from "./GameDrawer";
import { GamesSkeleton } from "./GamesSkeleton";
import { useGameDraft } from "./hooks/useGameDraft";
import { useGameSave } from "./hooks/useGameSave";
import { draftOf, newDraft } from "./utils/gameDraft";

import type { GameFormMode } from "./types";
import type { Game } from "~/schemas/game";

const goBack = () => {
  window.history.back();
};

/** The games page: every game, and the drawer that adds or edits one. */
export function GamesPage() {
  const { data, loading: isLoading, error } = useData(async () => ({ games: await listGames() }), [], "games-list");
  const [mode, setMode] = useState<GameFormMode | null>(null);
  /** The game the drawer edits, as it was opened. */
  const [original, setOriginal] = useState<Game | null>(null);
  const form = useGameDraft(newDraft);
  const saver = useGameSave({ form, editing: mode === "edit" ? (original?.slug ?? null) : null, onSaved: () => { setMode(null); } });

  const open = (game: Game | null) => {
    form.reset(game ? draftOf(game) : newDraft());
    saver.setErrors(null);
    setOriginal(game);
    setMode(game ? "edit" : "create");
  };

  if (isLoading) {
    return <GamesSkeleton />;
  }
  if (error) {
    return <LoadErrorState title="Failed to Load Games" error={error} onBack={goBack} />;
  }
  return (
    data && (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">Games</h1>
          <Button onClick={() => { open(null); }}>Add Game</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.games.map((game) => (
            <GameCard key={game.slug} game={game} onEdit={() => { open(game); }} />
          ))}
        </div>
        <GameDrawer mode={mode} original={original} form={form} saver={saver} onClose={() => { setMode(null); }} />
      </div>
    )
  );
}
