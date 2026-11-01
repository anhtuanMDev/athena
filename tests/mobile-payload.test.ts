import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gitBlobSha } from "../app/lib/asset-headers";
import { buildDataPayload, buildInitPayload, readJsonFile, readJsonFolder, versionAssets, type RepoReader } from "../app/lib/mobile-payload";

const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

/** A repo of in-memory files; a value that is an Error makes reading that file fail with it. */
function memoryReader(files: Record<string, string | Error>, failList: Record<string, Error> = {}, assets: Map<string, string> | Error = new Map()) {
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
    async assets() {
      if (assets instanceof Error) throw assets;
      return assets;
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

describe("picture versions", () => {
  const sha = "1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c";
  const v = "?v=1f2e3d4c5b6a";
  const hashes = new Map([
    ["overwatch/heroes/ana/portrait_2d.webp", sha],
    ["overwatch/heroes/lúcio/portrait 2d.webp", sha],
  ]);

  it("version strings that are exactly the path of a picture in the repo", () => {
    assert.equal(versionAssets("/api/assets/overwatch/heroes/ana/portrait_2d.webp", hashes), `/api/assets/overwatch/heroes/ana/portrait_2d.webp${v}`);
    assert.equal(versionAssets("assets/overwatch/heroes/ana/portrait_2d.webp", hashes), `assets/overwatch/heroes/ana/portrait_2d.webp${v}`);
  });

  it("match file names written raw or URL-encoded, keeping them as written", () => {
    assert.equal(versionAssets("/api/assets/overwatch/heroes/lúcio/portrait 2d.webp", hashes), `/api/assets/overwatch/heroes/lúcio/portrait 2d.webp${v}`);
    assert.equal(
      versionAssets("/api/assets/overwatch/heroes/l%C3%BAcio/portrait%202d.webp", hashes),
      `/api/assets/overwatch/heroes/l%C3%BAcio/portrait%202d.webp${v}`,
    );
    assert.equal(versionAssets("/api/assets/overwatch/heroes/%E0%A4%A/x.webp", hashes), "/api/assets/overwatch/heroes/%E0%A4%A/x.webp");
  });

  it("leave everything else alone", () => {
    for (const value of [
      "/api/assets/overwatch/heroes/unknown.webp",
      "/api/assets/overwatch/heroes/ana/portrait_2d.webp?v=000000000000",
      "/api/assets/overwatch/heroes/ana/portrait_2d.webp#x",
      "See /api/assets/overwatch/heroes/ana/portrait_2d.webp for her portrait",
      " /api/assets/overwatch/heroes/ana/portrait_2d.webp",
      "https://bnetcmsus-a.akamaihd.net/cms/x.png",
      "https://athena.example/api/assets/overwatch/heroes/ana/portrait_2d.webp",
      "/api/assets/",
    ]) {
      assert.equal(versionAssets(value, hashes), value, value);
    }
    assert.equal(versionAssets(42, hashes), 42);
    assert.equal(versionAssets(null, hashes), null);
  });

  it("walk records and lists without changing the input", () => {
    const record = { id: "ana", portrait: { "2d": "/api/assets/overwatch/heroes/ana/portrait_2d.webp" }, kit: [{ icon: "assets/overwatch/heroes/ana/portrait_2d.webp", n: 1 }] };
    const copy = structuredClone(record);
    assert.deepEqual(versionAssets(record, hashes), {
      id: "ana",
      portrait: { "2d": `/api/assets/overwatch/heroes/ana/portrait_2d.webp${v}` },
      kit: [{ icon: `assets/overwatch/heroes/ana/portrait_2d.webp${v}`, n: 1 }],
    });
    assert.deepEqual(record, copy);
  });

  it("are added to both payloads, which go out unversioned and partial when the hashes can't be read", async () => {
    const files = {
      "data/_meta/games.json": JSON.stringify({ games: [{ slug: "ow", icon: "/api/assets/overwatch/heroes/ana/portrait_2d.webp" }, { slug: "mr", active: false }] }),
      "data/ow/heroes/ana.json": JSON.stringify({ id: "ana", portrait: "/api/assets/overwatch/heroes/ana/portrait_2d.webp" }),
    };
    const init = await buildInitPayload(memoryReader(files, {}, hashes).reader);
    assert.equal(init.partial, false);
    assert.deepEqual((init.payload.games as { slug: string; icon: string }[]).map((g) => [g.slug, g.icon]), [["ow", `/api/assets/overwatch/heroes/ana/portrait_2d.webp${v}`]]);
    const data = await buildDataPayload(memoryReader(files, {}, hashes).reader, "data/ow/heroes");
    assert.deepEqual(data, { payload: [{ id: "ana", portrait: `/api/assets/overwatch/heroes/ana/portrait_2d.webp${v}` }], partial: false });

    const offline = await buildDataPayload(memoryReader(files, {}, new Error("tree unavailable")).reader, "data/ow/heroes");
    assert.deepEqual(offline, { payload: [{ id: "ana", portrait: "/api/assets/overwatch/heroes/ana/portrait_2d.webp" }], partial: true });
    assert.equal((await buildInitPayload(memoryReader(files, {}, new Error("tree unavailable")).reader)).partial, true);
  });

  it("use git's blob hash, as the repo tree lists it", async () => {
    // `printf 'hello\n' | git hash-object --stdin`
    assert.equal(await gitBlobSha(new TextEncoder().encode("hello\n")), "ce013625030ba8dba906f756967f9e9ca394464a");
  });
});
