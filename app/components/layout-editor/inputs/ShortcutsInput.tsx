import { listOf } from "../utils/prop-values";

import { AddRowButton } from "./AddRowButton";
import { ShortcutTile } from "./ShortcutTile";

import type { ActionTargets, Shortcut } from "../types";

interface ShortcutsInputProps {
  id: string;
  value: unknown;
  onChange: (value: unknown) => void;
  targets: ActionTargets;
  icons: string[];
  /** The app shows this many tiles at most. */
  max: number;
}

/** Quick-access tiles: label, icon, and what each opens (a screen, the app's settings, or a link). */
export function ShortcutsInput({ id, value, onChange, targets, icons, max }: ShortcutsInputProps) {
  const items = listOf<Shortcut>(value);
  const set = (next: Shortcut[]) => {
    onChange(next.length > 0 ? next : undefined);
  };
  return (
    <div id={id} className="space-y-2">
      {items.map((_, i) => (
        <ShortcutTile key={i} id={id} index={i} items={items} icons={icons} targets={targets} onItems={set} />
      ))}
      <AddRowButton noun="tile" count={items.length} max={max} onAdd={() => set([...items, { label: "", icon: icons[0], screen: targets.screenIds[0] }])} />
    </div>
  );
}
