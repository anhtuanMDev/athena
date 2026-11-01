import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readJsonFile, readJsonFolder, type RepoReader } from "../app/lib/mobile-payload";

const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

/** A repo of in-memory files; a value that is an Error makes reading that file fail with it. */
function memoryReader(files: Record<string, string | Error>, failList: Record<string, Error> = {}) {
  const reads: string[] = [];
  const concurrency = { now: 0, max: 0 };
  const reader: RepoReader = {
    async list(dir) {
      if (failList[dir]) throw failList[dir];
      const paths = Object.keys(files).filter((p) => p.startsWith(`${dir}/`) && p.endsWith(".json"));
      if (paths.length === 0) throw notFound();
      return paths;
    },
    async read(path) {
      reads.push(path);
      concurrency.max = Math.max(concurrency.max, ++concurrency.now);
      await new Promise((resolve) => setTimeout(resolve, 1));
      concurrency.now--;
      const file = files[path];
      if (file === undefined) throw notFound();
      if (file instanceof Error) throw file;
      return file;
    },
  };
  return { reader, reads, concurrency };
}

describe("mobile payload folders", () => {
  it("reads every file, named by its file name", async () => {
    const { reader } = memoryReader({
      "data/ow/screens/home.json": '{"type":"home"}',
      "data/ow/screens/hero-detail.json": '{"type":"detail"}',
    });
    assert.deepEqual(await readJsonFolder(reader, "data/ow/screens"), {
      files: [
        { name: "home", content: { type: "home" } },
        { name: "hero-detail", content: { type: "detail" } },
      ],
      partial: false,
    });
  });

  it("leaves out a file it can't parse or fetch, and says the folder is partial", async () => {
    const { reader } = memoryReader({
      "data/ow/schemas/a.json": '{"id":"a"}',
      "data/ow/schemas/broken.json": "{ not json",
      "data/ow/schemas/flaky.json": Object.assign(new Error("Bad Gateway"), { status: 502 }),
      "data/ow/schemas/b.json": '{"id":"b"}',
    });
    const result = await readJsonFolder(reader, "data/ow/schemas");
    assert.deepEqual(
      result.files.map((f) => f.name),
      ["a", "b"],
    );
    assert.equal(result.partial, true);
  });

  it("treats a missing folder as empty and complete", async () => {
    const { reader } = memoryReader({});
    assert.deepEqual(await readJsonFolder(reader, "data/ow/enums"), { files: [], partial: false });
  });

  it("fails when a folder can't be listed, rather than calling it empty", async () => {
    const { reader } = memoryReader({ "data/ow/heroes/ana.json": "{}" }, { "data/ow/heroes": Object.assign(new Error("rate limited"), { status: 403 }) });
    await assert.rejects(readJsonFolder(reader, "data/ow/heroes"), /rate limited/);
  });

  it("fetches a large folder in chunks, keeping its order", async () => {
    const files = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`data/ow/news/n${String(i).padStart(2, "0")}.json`, `{"i":${i}}`]));
    const { reader, reads, concurrency } = memoryReader(files);
    const result = await readJsonFolder(reader, "data/ow/news");
    assert.equal(concurrency.max, 10);
    assert.deepEqual(
      result.files.map((f) => (f.content as { i: number }).i),
      Array.from({ length: 25 }, (_, i) => i),
    );
    assert.equal(reads.length, 25);
  });
});

describe("mobile payload files", () => {
  it("reads a file, or null when it doesn't exist", async () => {
    const { reader } = memoryReader({ "data/ow/navigation.json": '{"tabs":[]}' });
    assert.deepEqual(await readJsonFile(reader, "data/ow/navigation.json"), { content: { tabs: [] }, partial: false });
    assert.deepEqual(await readJsonFile(reader, "data/mr/navigation.json"), { content: null, partial: false });
  });

  it("leaves out an unparsable file as partial, and fails on other errors", async () => {
    const { reader } = memoryReader({
      "data/ow/navigation.json": "{",
      "data/mr/navigation.json": Object.assign(new Error("Bad Gateway"), { status: 502 }),
    });
    assert.deepEqual(await readJsonFile(reader, "data/ow/navigation.json"), { content: null, partial: true });
    await assert.rejects(readJsonFile(reader, "data/mr/navigation.json"), /Bad Gateway/);
  });
});
