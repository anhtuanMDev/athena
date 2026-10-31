// GitHub's contents API carries file bodies as base64. btoa/atob only handle
// Latin-1, so text has to go through UTF-8 bytes explicitly.

export function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Files saved before this fix were written with plain btoa, so any non-ASCII
// character in them is a single Latin-1 byte and not valid UTF-8. Those still
// decode the way they always did, until they are saved again.
export function decodeUtf8Base64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return binary;
  }
}
