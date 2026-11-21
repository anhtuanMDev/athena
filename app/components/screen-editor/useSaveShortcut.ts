import { useEffect, useEffectEvent } from "react";

/** ⌘S (Ctrl+S) saves, wherever the focus is. */
export function useSaveShortcut(save: () => Promise<void>): void {
  const onSave = useEffectEvent(() => {
    void save();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
