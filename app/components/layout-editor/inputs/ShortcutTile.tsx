import { inputBaseClass } from "~/components/ui/input-classes";

import { patchedShortcut, tileAction, tilePatch } from "../utils/prop-values";

import { ActionInput } from "./ActionInput";
import { IconSelect } from "./IconSelect";
import { RowButtons } from "./RowButtons";

import type { ActionTargets, Shortcut } from "../types";

interface ShortcutTileProps {
  /** The tiles input's id. */
  id: string;
  index: number;
  items: Shortcut[];
  icons: string[];
  targets: ActionTargets;
  onItems: (next: Shortcut[]) => void;
}

/** One quick-access tile: its label, its icon, and what it opens. */
export function ShortcutTile({ id, index, items, icons, targets, onItems }: ShortcutTileProps) {
  const item = items[index];
  const position = String(index + 1);
  const patch = (change: Partial<Shortcut>) => {
    onItems(items.map((entry, j) => (j === index ? patchedShortcut(entry, change) : entry)));
  };
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-2">
      <input aria-label={`Tile ${position} label`} value={item.label ?? ""} placeholder="Label" onChange={(e) => patch({ label: e.target.value })} className={`${inputBaseClass} min-w-32 flex-1`} />
      <IconSelect label={`Tile ${position} icon`} value={item.icon} icons={icons} className={`${inputBaseClass} w-36`} onChange={(icon) => patch({ icon })} />
      <div className="w-full sm:w-64">
        {/* The app opens a tile's screen if it has one, else its link (zms sanitize.ts), so a tile keeps one of them. */}
        <ActionInput
          id={`${id}-tile-${String(index)}-action`}
          label={`Tile ${position} opens`}
          value={tileAction(item)}
          onChange={(action) => patch(tilePatch(action))}
          targets={targets}
        />
      </div>
      <RowButtons noun="tile" index={index} items={items} onItems={onItems} />
    </div>
  );
}
