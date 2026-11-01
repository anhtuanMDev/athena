import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { contrastRatio, readableOn } from "../app/lib/contrast";

// Produced by zms's src/theme/contrast.ts; zms tests its copy against the same file.
const cases: {
  contrastRatio: [string, string, number | null][];
  readableOn: [string, string[], string][];
} = JSON.parse(readFileSync(new URL("./fixtures/contrast-cases.json", import.meta.url), "utf8"));

describe("contrast helpers, as the app has them", () => {
  it("give the app's contrast ratio for every pair", () => {
    for (const [a, b, ratio] of cases.contrastRatio) {
      const got = contrastRatio(a, b);
      if (ratio === null) assert.equal(got, undefined, `${a} on ${b}`);
      else assert.ok(Math.abs(got! - ratio) < 1e-6, `${a} on ${b}: ${got} vs ${ratio}`);
    }
  });

  it("make the same color readable the way the app does", () => {
    for (const [color, backgrounds, readable] of cases.readableOn) {
      assert.equal(readableOn(color, backgrounds), readable, `${color} on ${backgrounds.join(", ")}`);
    }
  });

  it("match the WCAG formula", () => {
    assert.ok(Math.abs(contrastRatio("#000000", "#FFFFFF")! - 21) < 1e-9);
    assert.equal(contrastRatio("cyan", "#FFFFFF"), undefined);
  });
});
