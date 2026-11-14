/**
 * Copies text that is still being fetched when the user clicks. Safari lets a
 * page write to the clipboard only during the click itself, so the text goes
 * in as a ClipboardItem holding a promise, written at once and filled when it
 * settles. Where that isn't supported, the text is written once it's there.
 * Rejects when the text can't be had or written.
 */
export async function copyText(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function") {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((value) => new Blob([value], { type: "text/plain" })) })]);
      return;
    } catch {
      // A browser that won't take a promise: written below, or the text's own error thrown there.
    }
  }
  await navigator.clipboard.writeText(await text);
}
