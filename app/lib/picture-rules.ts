// What may be uploaded as a picture (public/assets): a PNG, JPEG or WebP of at
// most 2 MiB, named after its type. Nothing in the data repo is a GIF, and an
// SVG can carry script. The size also bounds the CPU an asset costs: a cold
// /api/assets fetch hashes the whole file (asset-headers.ts gitBlobSha), and a
// Function has 10 ms on Workers Free.
//
// The server checks an upload from its base64 as sent, without decoding the
// file: the size from the text's length, the type from its first bytes. The
// upload fields check the same before a picture is accepted, so it's said at
// once rather than at the save.

export const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
/** The longest base64 a picture at the limit takes. */
export const MAX_PICTURE_BASE64 = Math.ceil(MAX_PICTURE_BYTES / 3) * 4;

export type PictureType = "png" | "jpeg" | "webp";

/** What an upload field's file picker offers: these types alone. */
export const PICTURE_ACCEPT = "image/png,image/jpeg,image/webp";

const LABELS: Record<PictureType, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP" };
/** The file extensions of each type, the first being the one a new picture gets. */
const EXTENSIONS: Record<PictureType, string[]> = { png: ["png"], jpeg: ["jpg", "jpeg"], webp: ["webp"] };
const ALLOWED = "PNG, JPEG or WebP";

/** The size in bytes of the file `base64` encodes, from its length alone; null when no base64 is that long. */
export function decodedSize(base64: string): number | null {
  if (base64.length % 4 !== 0) return null;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  if (base64.slice(0, base64.length - padding).includes("=")) return null;
  return (base64.length / 4) * 3 - padding;
}

/** The picture type `base64` starts with, from its first 12 bytes (16 characters): the only part decoded. */
export function pictureType(base64: string): PictureType | null {
  let head: string;
  try {
    head = atob(base64.slice(0, 16));
  } catch {
    return null;
  }
  const bytes = Array.from(head, (c) => c.charCodeAt(0));
  const starts = (expected: number[], at = 0) => expected.every((b, i) => bytes[at + i] === b);
  const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts(ascii("RIFF")) && starts(ascii("WEBP"), 8)) return "webp";
  return null;
}

/** The extension a new picture's file gets: its type's (png, jpg or webp); null when it isn't one. */
export function pictureExtension(base64: string): string | null {
  const type = pictureType(base64);
  return type && EXTENSIONS[type][0];
}

/**
 * A new picture's file extension: its type's, which the server requires
 * (pictureProblem); for data whose type can't be told (the upload fields
 * refuse those), its name's, else png.
 */
export function newPictureExtension(name: string | undefined, base64: string | undefined): string {
  return (base64 && pictureExtension(base64)) || (/\.([A-Za-z0-9]{1,8})$/.exec(name ?? "")?.[1] ?? "png").toLowerCase();
}

const megabytes = (bytes: number) => `${(Math.ceil((bytes / 1024 / 1024) * 10) / 10).toFixed(1)} MB`;
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Why an upload to `path` can't be taken, with its HTTP status, or null. */
export interface PictureProblem {
  status: 400 | 413 | 415;
  error: string;
}

/** Why `base64` can't be saved as a picture at `path` (a 400, 413 or 415), or null when it can. */
export function pictureProblem(path: string, base64: unknown): PictureProblem | null {
  const name = fileName(path);
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const type = (Object.keys(EXTENSIONS) as PictureType[]).find((t) => EXTENSIONS[t].includes(extension));
  if (!type) return { status: 415, error: `${name}: only ${ALLOWED} pictures can be uploaded.` };
  const size = typeof base64 === "string" ? decodedSize(base64) : null;
  if (size === null) return { status: 400, error: `${name} isn't sent as base64.` };
  if (size === 0) return { status: 400, error: `${name} is empty.` };
  if (size > MAX_PICTURE_BYTES) return { status: 413, error: `${name} is ${megabytes(size)}; a picture can be at most 2 MB.` };
  const actual = pictureType(base64 as string);
  if (!actual) return { status: 415, error: `${name} isn't a ${ALLOWED} picture.` };
  if (actual !== type) return { status: 415, error: `${name} is a ${LABELS[actual]} picture; name it .${EXTENSIONS[actual][0]}.` };
  return null;
}

/**
 * Why an upload field can't take `file`, said as soon as it's picked: too
 * large before it's even read, and once read (`base64`), not a PNG, JPEG or
 * WebP picture. Null when it can.
 */
export function pictureFileProblem(file: { name: string; size: number }, base64?: string): string | null {
  if (file.size > MAX_PICTURE_BYTES) return `${file.name} is ${megabytes(file.size)}; a picture can be at most 2 MB.`;
  if (base64 !== undefined && !pictureType(base64)) return `${file.name} isn't a ${ALLOWED} picture.`;
  return null;
}
