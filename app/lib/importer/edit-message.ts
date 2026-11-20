import type { Edit } from "./repo";

/** An edit's commit message, asked once its changes are worked out (see Edit.message). */
export function messageOf(message: Edit["message"]): string {
  return typeof message === "function" ? message() : message;
}

/** A run's one commit message (runRepo's flush): a lone job's (or the log's) own, else a headline over each one's line. */
export function runMessage(lines: string[], jobs: number): string {
  if (lines.length === 1) {
    return lines[0];
  }
  return `Import run: ${String(jobs)} job${jobs === 1 ? "" : "s"}\n\n${lines.join("\n")}`;
}
