// The AI data bar's words (components/record-form/AiDataBar.tsx), shared by
// the record editors: each names its own entity ("hero", "mode").

/** The file "Download .md" saves the AI prompt as. */
export function promptFileName(entity: string): string {
  return `athena_${entity}_data_prompt.md`;
}

/** What the toast says once an AI's answer is imported. */
export function importedMessage(entity: string, source: "file" | "pasted text"): string {
  return `Imported ${entity} data from ${source}!`;
}
