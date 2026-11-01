// Headers for files served from the data repo's public/assets (/api/assets/…).
// Their type comes from the file name, not from raw.githubusercontent.com, and
// they're sandboxed: an uploaded SVG opened directly can't run script or load
// anything on the admin's origin. Neither changes how an <img> shows them.

const TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export function assetHeaders(path: string): Headers {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return new Headers({
    "Content-Type": TYPES[extension] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Cache-Control": "public, max-age=3600",
  });
}
