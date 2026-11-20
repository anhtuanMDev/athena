import { useState } from "react";

import type { IconPicks } from "../types";
import type { PickedIcon } from "~/lib/enum-icons";

/** Icons picked for options, by each option's key in the form, which follows it when options move. */
export function useIconPicks() {
  const [picks, setPicks] = useState<IconPicks>({});
  const pick = (key: string, file: PickedIcon | null) => {
    if (file) {
      setPicks((current) => ({ ...current, [key]: file }));
    } else {
      setPicks((current) => Object.fromEntries(Object.entries(current).filter(([picked]) => picked !== key)));
    }
  };
  return { picks, pick };
}
