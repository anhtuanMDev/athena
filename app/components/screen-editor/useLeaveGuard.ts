import { useCallback, useEffect } from "react";
import { useBlocker, type Blocker } from "react-router";

interface Locations {
  currentLocation: { pathname: string };
  nextLocation: { pathname: string };
}

/** While there are unsaved changes, asks before leaving the page or closing the tab. */
export function useLeaveGuard(isDirty: boolean): Blocker {
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }: Locations) => isDirty && currentLocation.pathname !== nextLocation.pathname, [isDirty]));

  useEffect(() => {
    if (!isDirty) {
      return undefined;
    }
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return blocker;
}
