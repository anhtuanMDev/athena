import { issueButtonClass } from "./constants";

import type { ReactNode } from "react";

interface IssueLinkProps {
  onReveal: () => void;
  children: ReactNode;
}

/** A problem in the list, which opens where it is. */
export function IssueLink({ onReveal, children }: IssueLinkProps) {
  return (
    <li>
      <button type="button" onClick={onReveal} className={issueButtonClass}>
        {children}
      </button>
    </li>
  );
}
