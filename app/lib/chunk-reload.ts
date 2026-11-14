// A game's views load their code when they're opened (_admin.$game.tsx). A
// Pages deployment serves only its own build's files, so a tab opened before
// a deploy asks for chunks that are gone, and the view would fail to open.
// Vite reports that as a "vite:preloadError" event on the window: the page
// then reloads once, onto the new build. Once only: if the chunk fails again
// within a minute it is really missing, and the error page says so rather
// than the page reloading forever.

/** Where the time of the last such reload is kept, for this tab. */
export const CHUNK_RELOAD_KEY = "athena:chunk-reload";

/** How long after a reload another failure is taken as a missing chunk, not an old build. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

type SessionStore = Pick<Storage, "getItem" | "setItem">;

/**
 * Whether a failed chunk should reload the page, noting the reload when it
 * should. Never without a store to note it in (storage blocked or full):
 * nothing would then stop a reload loop.
 */
export function shouldReloadForChunk(store: SessionStore | null, now: number): boolean {
  if (!store) return false;
  try {
    const last = Number(store.getItem(CHUNK_RELOAD_KEY));
    if (last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    store.setItem(CHUNK_RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** Listens for chunks that fail to load, in the browser. */
export function installChunkReload(win: Window): void {
  win.addEventListener("vite:preloadError", (event) => {
    let store: SessionStore | null = null;
    try {
      store = win.sessionStorage;
    } catch {
      // Storage blocked: no reload (shouldReloadForChunk).
    }
    if (!shouldReloadForChunk(store, Date.now())) return;
    // Handled: Vite doesn't throw, and the view's error isn't shown before the reload.
    event.preventDefault();
    win.location.reload();
  });
}
