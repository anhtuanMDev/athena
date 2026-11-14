import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_PICTURE_BYTES, decodedSize, pictureExtension, pictureFileProblem, pictureProblem, pictureType } from "../app/lib/picture-rules";

// What the admin may upload as a picture: PNG, JPEG or WebP (nothing in the
// data repo is a GIF, and an SVG can carry script), at most 2 MiB. The server
// checks it from the base64 alone, without decoding the file: its size from
// the text's length, its type from its first bytes.

const b64 = (bytes: number[], size = bytes.length) => {
  const all = new Uint8Array(size);
  all.set(bytes);
  return Buffer.from(all).toString("base64");
};
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const WEBP_HEAD = [...Buffer.from("RIFF"), 0x24, 0, 0, 0, ...Buffer.from("WEBPVP8 ")];
const text = (s: string) => Buffer.from(s).toString("base64");

describe("a picture's size, from its base64 alone", () => {
  it("is exact whatever the padding", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 1000, 1001, 1002]) assert.equal(decodedSize(b64([], n)), n, String(n));
  });

  it("isn't known for text that can't be base64", () => {
    for (const s of ["A", "AB", "ABC", "AB=C", "A===", "AAAAA"]) assert.equal(decodedSize(s), null, s);
  });
});

describe("a picture's type, from its first bytes", () => {
  it("is PNG, JPEG or WebP, whatever the rest of the file", () => {
    assert.equal(pictureType(b64(PNG_HEAD, 5000)), "png");
    assert.equal(pictureType(b64(JPEG_HEAD, 5000)), "jpeg");
    assert.equal(pictureType(b64(WEBP_HEAD, 5000)), "webp");
  });

  it("is none of them for an SVG, a GIF, HTML, another RIFF file, a cut-off header or text that isn't base64", () => {
    for (const s of [
      text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      text("GIF89a\x01\x00\x01\x00\x00\x00\x00"),
      text("<!doctype html><html></html>"),
      b64([...Buffer.from("RIFF"), 0x24, 0, 0, 0, ...Buffer.from("WAVEfmt ")]),
      b64(PNG_HEAD.slice(0, 6)),
      b64([0xff, 0xd8]),
      "",
      "!!!!not base64!!!!",
    ]) {
      assert.equal(pictureType(s), null, s.slice(0, 24));
    }
  });

  it("names a new picture's file: png, jpg or webp", () => {
    assert.equal(pictureExtension(b64(PNG_HEAD)), "png");
    assert.equal(pictureExtension(b64(JPEG_HEAD)), "jpg");
    assert.equal(pictureExtension(b64(WEBP_HEAD)), "webp");
    assert.equal(pictureExtension(text("<svg/>")), null);
  });
});

describe("what the server refuses of an upload", () => {
  const P = "public/assets/overwatch/heroes/ana/portrait.png";

  it("takes a PNG, JPEG or WebP of at most 2 MiB under a name of its type", () => {
    assert.equal(pictureProblem(P, b64(PNG_HEAD, MAX_PICTURE_BYTES)), null);
    assert.equal(pictureProblem("public/assets/g/x/y/a.jpg", b64(JPEG_HEAD, 900)), null);
    assert.equal(pictureProblem("public/assets/g/x/y/a.JPEG", b64(JPEG_HEAD, 900)), null);
    assert.equal(pictureProblem("public/assets/g/x/y/a.webp", b64(WEBP_HEAD, 900)), null);
  });

  it("refuses one byte over 2 MiB as too large (413)", () => {
    const problem = pictureProblem(P, b64(PNG_HEAD, MAX_PICTURE_BYTES + 1));
    assert.equal(problem?.status, 413);
    // Rounded up, so a file just over the limit never reads as "2.0 MB".
    assert.match(problem!.error, /portrait\.png is 2\.1 MB; a picture can be at most 2 MB\./);
  });

  it("refuses an SVG, a GIF or anything else as the wrong type (415), whatever it's called", () => {
    for (const [path, data] of [
      ["public/assets/g/x/y/a.svg", text("<svg/>")],
      ["public/assets/g/x/y/a.png", text("<svg/>")],
      ["public/assets/g/x/y/a.gif", text("GIF89a\x01\x00\x01\x00\x00\x00\x00")],
      ["public/assets/g/x/y/a.png", text("GIF89a\x01\x00\x01\x00\x00\x00\x00")],
      ["public/assets/g/x/y/a.ico", b64(PNG_HEAD)],
    ]) {
      assert.equal(pictureProblem(path, data)?.status, 415, path);
    }
  });

  it("refuses a picture under another type's name (415): it would be served as that type", () => {
    const problem = pictureProblem(P, b64(WEBP_HEAD, 900));
    assert.equal(problem?.status, 415);
    assert.match(problem!.error, /is a WebP picture; name it \.webp/);
    assert.equal(pictureProblem("public/assets/g/x/y/a.webp", b64(JPEG_HEAD))?.status, 415);
  });

  it("refuses what isn't base64 or is empty (400)", () => {
    assert.equal(pictureProblem(P, "AAAAA")?.status, 400);
    assert.equal(pictureProblem(P, "")?.status, 400);
    assert.equal(pictureProblem(P, 42)?.status, 400);
    assert.equal(pictureProblem(P, { content: "x" })?.status, 400);
  });
});

describe("what an upload field refuses at once", () => {
  it("is a file over 2 MiB, before reading it", () => {
    assert.equal(pictureFileProblem({ name: "big.png", size: MAX_PICTURE_BYTES }), null);
    assert.equal(pictureFileProblem({ name: "big.png", size: 3 * 1024 * 1024 }), "big.png is 3.0 MB; a picture can be at most 2 MB.");
  });

  it("is a file that isn't a PNG, JPEG or WebP picture, once read", () => {
    assert.equal(pictureFileProblem({ name: "a.png", size: 100 }, b64(PNG_HEAD)), null);
    assert.equal(pictureFileProblem({ name: "logo.svg", size: 100 }, text("<svg/>")), "logo.svg isn't a PNG, JPEG or WebP picture.");
  });
});
