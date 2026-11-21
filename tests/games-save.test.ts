import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import { saveGame } from "../app/lib/games-save";
import { conflictResponse } from "../app/lib/github";

import type { PaletteKey } from "../app/lib/game-palette";
import type { GameDraft } from "../app/lib/games-save";

// The games form's save from the admin (app/lib/games-save.ts), with fetch
// stubbed: everything is checked before anything is sent, the picked icon goes
// up as a blob, and games.json and the icon are one save, never data/file.

const dark = (JSON.parse(readFileSync(new URL("./fixtures/palette-cases.json", import.meta.url), "utf8")) as { dark: Record<PaletteKey, string> }).dark;
const stored = (slug: string, name: string) => ({ slug, name, developer: "", active: true, ...dark });
const FILE = { games: [stored("overwatch", "Overwatch"), stored("marvel-rivals", "Marvel Rivals")] };
const SHA = "a".repeat(40);
const UPLOADED = { path: "public/assets/games/overwatch-icon.png", sha: "b".repeat(40), token: "server-token" };
const PICKED = { name: "logo.png", base64: "iVBORw0KGgo=" };
const draft = (change: Partial<GameDraft> = {}): GameDraft => ({ slug: "overwatch", name: "Overwatch 2", developer: "", icon: "", palette: { ...dark }, light: {}, active: true, ...change });

interface Sent {
  method: string;
  path: string;
  body: Record<string, unknown>;
}
let sent: Sent[];
/** What save-games answers: the status and body. */
let saveAnswer: { status: number; body: Record<string, unknown> };
/** The admin's API, by method and path. */
const ANSWERS: Record<string, () => Response> = {
  "GET /api/data/file": () => Response.json({ sha: SHA, content: FILE }),
  "POST /api/data/game-icon": () => Response.json(UPLOADED),
  "POST /api/data/save-games": () => Response.json(saveAnswer.body, { status: saveAnswer.status }),
};
const realFetch = globalThis.fetch;
beforeEach(() => {
  sent = [];
  saveAnswer = { status: 200, body: { ok: true, sha: SHA, commit: "c1" } };
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "https://athena.example");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    sent.push({ method, path: url.pathname, body });
    const answer = ANSWERS[`${method} ${url.pathname}`] as (() => Response) | undefined;
    return answer ? answer() : Response.json({ error: "Not found" }, { status: 404 });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
const routes = () => sent.map((request) => `${request.method} ${request.path}`);
const gamesSent = (index: number) => (sent[index].body.content as { games: Record<string, unknown>[] }).games;

void describe("saving a game from the games page", () => {
  void it("uploads a picked icon as a blob, then saves games.json with it in one request", async () => {
    const outcome = await saveGame({ draft: draft(), editing: "overwatch", iconFile: PICKED });
    assert.deepEqual(outcome, { saved: true });
    assert.deepEqual(routes(), ["GET /api/data/file", "POST /api/data/game-icon", "POST /api/data/save-games"]);
    assert.deepEqual(sent[1].body, { slug: "overwatch", path: "public/assets/games/overwatch-icon.png", base64: PICKED.base64 });
    assert.deepEqual(gamesSent(2).map((saved) => [saved.slug, saved.name, saved.icon]), [["overwatch", "Overwatch 2", "/api/assets/games/overwatch-icon.png"], ["marvel-rivals", "Marvel Rivals", undefined]]);
    assert.deepEqual({ ...sent[2].body, content: undefined }, { sha: SHA, content: undefined, message: "Edit game: Overwatch 2", icon: UPLOADED });
  });

  void it("saves games.json alone when no icon was picked, and a new game last", async () => {
    assert.deepEqual(await saveGame({ draft: draft({ slug: "valorant", name: "Valorant" }), editing: null }), { saved: true });
    assert.deepEqual(routes(), ["GET /api/data/file", "POST /api/data/save-games"]);
    assert.equal(sent[1].body.message, "Add game: Valorant");
    assert.equal("icon" in sent[1].body, false);
    assert.deepEqual(gamesSent(1).map((saved) => saved.slug), ["overwatch", "marvel-rivals", "valorant"]);
  });

  void it("sends nothing for a form the checks refuse, and shows the tab with the wrong color", async () => {
    const outcome = await saveGame({ draft: draft({ palette: { ...dark, primary: "blue" } }), editing: "overwatch", iconFile: PICKED });
    assert.ok("errors" in outcome);
    assert.equal(outcome.tab, "dark");
    assert.deepEqual(sent, []);
  });

  void it("uploads no icon when the slug is taken", async () => {
    const outcome = await saveGame({ draft: draft({ slug: "marvel-rivals" }), editing: null, iconFile: PICKED });
    assert.deepEqual(outcome, { errors: { slug: ["A game with this slug already exists"] } });
    assert.deepEqual(routes(), ["GET /api/data/file"]);
  });

  void it("says to reload on a conflict, and the server's reason otherwise", async () => {
    saveAnswer = { status: 409, body: { error: "Conflict on data/_meta/games.json: games.json was modified since it was loaded.", conflict: true } };
    assert.deepEqual(await saveGame({ draft: draft(), editing: "overwatch" }), { errors: { _form: conflictResponse().errors._form } });
    saveAnswer = { status: 400, body: { error: "This file can't be saved: no." } };
    assert.deepEqual(await saveGame({ draft: draft(), editing: "overwatch" }), { errors: { _form: ["This file can't be saved: no."] } });
    assert.equal(routes().includes("POST /api/data/file"), false);
  });
});
