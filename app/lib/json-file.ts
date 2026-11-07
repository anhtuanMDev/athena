/**
 * A JSON file of the data repo as every writer stores it: 2-space indent and a
 * final newline. The admin's saves (functions/api), imports and publishes
 * (importer/repo.ts) all go through this, so a file written by one and saved
 * by another never shows "\ No newline at end of file" in its diff. A newline
 * is also what editors and GitHub's web editor leave when a file is edited by hand.
 */
export function jsonFileText(content: unknown): string {
  return `${JSON.stringify(content, null, 2)}\n`;
}
