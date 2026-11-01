// A copy of zms's src/theme/contrast.ts: keep the two in sync. Both repos
// test their copy against the same cases (tests/fixtures/contrast-cases.json
// here, __tests__/fixtures/contrast-cases.json there), so the admin warns
// about exactly what the app will have to fix.

/**
 * WCAG contrast helpers for colors that come from the admin's game themes,
 * which are chosen for brand, not for legibility on every background.
 */

type Rgb = [number, number, number];

function parseHex(color: string): Rgb | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return undefined;
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (rgb: Rgb) =>
  `#${rgb
    .map((c) => Math.round(c).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio of two hex colors, or undefined if either isn't hex. */
export function contrastRatio(a: string, b: string): number | undefined {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return undefined;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `color`, darkened on light backgrounds or lightened on dark ones until it
 * reaches `min` contrast against every background, keeping its hue. Colors
 * that already pass, or that aren't hex, come back unchanged.
 */
export function readableOn(color: string, backgrounds: string[], min = 4.5): string {
  const base = parseHex(color);
  const bgs = backgrounds.map(parseHex).filter((c): c is Rgb => !!c);
  if (!base || bgs.length === 0) return color;
  const passes = (c: Rgb) => bgs.every((bg) => (contrastRatio(toHex(c), toHex(bg)) ?? 0) >= min);
  if (passes(base)) return color;
  // Mix toward black on light backgrounds and toward white on dark ones;
  // mixing keeps the hue, and 2% steps keep as much brand color as possible.
  const target = luminance(bgs[0]) > 0.18 ? 0 : 255;
  for (let t = 0.02; t <= 1; t += 0.02) {
    const mixed = base.map((c) => c + (target - c) * t) as Rgb;
    if (passes(mixed)) return toHex(mixed);
  }
  return target === 0 ? "#000000" : "#FFFFFF";
}
