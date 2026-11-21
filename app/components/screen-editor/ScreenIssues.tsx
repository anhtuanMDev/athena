import { IssueLink } from "./IssueLink";
import { problemCount } from "./utils/screen-text";

import type { RefObject } from "react";
import type { ScreenIssue } from "~/lib/screen-model";

interface ScreenIssuesProps {
  count: number;
  /** The editor's errors, the write API's own, and JSON boxes that don't parse ("<block id>:<prop>"). */
  problems: { issues: ScreenIssue[]; fileErrors: string[]; jsonErrors: [string, string][] };
  /** A block's name by its id; none for a block that's gone. */
  blockName: (blockId: string) => string | undefined;
  onReveal: (blockId: string) => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

/** What stops the save, each opening where it is. */
export function ScreenIssues({ count, problems, blockName, onReveal, headingRef }: ScreenIssuesProps) {
  return (
    <section aria-labelledby="screen-issues-heading" className="mt-6 rounded-xl border border-danger/40 bg-danger/5 p-4">
      <h2 id="screen-issues-heading" ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-ink focus:outline-none">
        Fix {problemCount(count)} before saving
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {problems.issues.map((issue, i) => (
          <IssueLink key={`${issue.sectionId}-${issue.prop ?? String(i)}`} onReveal={() => onReveal(issue.sectionId)}>
            {blockName(issue.sectionId) ?? "Screen settings"}: {issue.message}
          </IssueLink>
        ))}
        {problems.fileErrors.map((message) => (
          <li key={message} className="text-danger-ink">
            {message}
          </li>
        ))}
        {problems.jsonErrors.map(([key, message]) => {
          const [blockId, prop] = key.split(":");
          return (
            <IssueLink key={key} onReveal={() => onReveal(blockId)}>
              {blockName(blockId) ?? blockId}, {prop}: {message}
            </IssueLink>
          );
        })}
      </ul>
    </section>
  );
}
