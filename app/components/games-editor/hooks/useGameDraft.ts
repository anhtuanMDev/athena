import { useState } from "react";

import type { PaletteTab } from "../types";
import type { PaletteKey } from "~/lib/game-palette";
import type { GameDraft } from "~/lib/games-save";

/**
 * The games form's values, the picked icon file, and the palette tab shown.
 * A typed icon URL drops the picked file; a picked file shows as the icon.
 */
export function useGameDraft(initial: () => GameDraft) {
  const [draft, setDraft] = useState<GameDraft>(initial);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [tab, setTab] = useState<PaletteTab>("dark");

  const update = (patch: Partial<GameDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setColor = (key: PaletteKey, value: string) => {
    setDraft((current) => ({ ...current, palette: { ...current.palette, [key]: value } }));
  };
  const setLightColor = (key: PaletteKey, value: string) => {
    setDraft((current) => ({ ...current, light: { ...current.light, [key]: value } }));
  };
  const typeIcon = (url: string) => {
    update({ icon: url });
    setIconFile(null);
  };
  const pickIcon = (file: File) => {
    setIconFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string" && reader.result !== "") {
        update({ icon: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };
  /** Starts the form again with `next`: no picked file, the dark tab. */
  const reset = (next: GameDraft) => {
    setDraft(next);
    setIconFile(null);
    setTab("dark");
  };

  return { draft, iconFile, tab, setTab, update, setColor, setLightColor, typeIcon, pickIcon, reset };
}
