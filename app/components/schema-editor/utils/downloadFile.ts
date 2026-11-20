/** Offers `text` as a file named `fileName` from `page`, as a click on a download link would. */
export function downloadFile(page: Document, text: string, { fileName, type }: { fileName: string; type: string }): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = page.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
