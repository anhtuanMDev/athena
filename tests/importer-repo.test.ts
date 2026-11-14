import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { RepoError, githubRepo } from "../app/lib/importer/repo";
import { dismissDraft } from "../app/lib/importer/run";

// The importer's writes (app/lib/importer/repo.ts githubRepo) against a GitHub
// of in-memory commits: the git data API, whose ref only moves by
// fast-forward (a PATCH that isn't one is a 422, as on GitHub), the contents
// API read at a branch or a commit, and GraphQL object reads. `before` runs
// another writer just before a request, to land a commit between a write's
// reads and its ref update. Nothing leaves this process.

const STATE = "data/overwatch/syncs/news.json";
const DRAFT = "data/overwatch/imports/news/alpha.json";
const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

function fakeGit(initial: Record<string, unknown>, options: { graphql?: boolean; failTrees?: boolean } = {}) {
  const trees = new Map<string, Map<string, string>>();
  const parents = new Map<string, { tree: string; parent?: string }>();
  let n = 0;
  const tree = (files: Map<string, string>) => (trees.set(`t${++n}`, files), `t${n}`);
  const commit = (treeId: string, parent?: string) => (parents.set(`c${++n}`, { tree: treeId, parent }), `c${n}`);
  let head = commit(tree(new Map(Object.entries(initial).map(([p, v]) => [p, JSON.stringify(v)]))));
  const filesAt = (ref: string) => trees.get(parents.get(ref === "main" ? head : ref)?.tree ?? "");
  const calls: string[] = [];
  const queries: Record<string, string>[] = [];
  const hooks: { when: string; run: () => void }[] = [];

  /** Another writer's commit on the head: `edit` changes the files in place. */
  const otherWriter = (edit: (files: Map<string, string>) => void) => {
    const files = new Map(filesAt(head)!);
    edit(files);
    head = commit(tree(files), head);
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const route = url.pathname.replace(/^\/repos\/o\/r/, "");
    const call = `${method} ${route}${url.search}`;
    calls.push(call);
    const hook = hooks.findIndex((h) => call.startsWith(h.when));
    if (hook >= 0) hooks.splice(hook, 1)[0].run();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (route === "/graphql") {
      if (!options.graphql) return Response.json({ message: "Bad credentials" }, { status: 401 });
      queries.push(body.variables);
      const repository: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(body.variables as Record<string, string>)) {
        if (name === "commit") repository.commit = parents.has(value) ? { tree: { oid: parents.get(value)!.tree } } : null;
        if (!/^p\d+$/.test(name)) continue;
        const [ref, path] = value.split(":");
        const text = filesAt(ref)?.get(path);
        repository[name] = text === undefined ? null : { oid: sha1(text), byteSize: Buffer.byteLength(text), isBinary: false, isTruncated: false, text };
      }
      return Response.json({ data: { repository } });
    }
    if (method === "GET" && route.startsWith("/contents/")) {
      const text = filesAt(url.searchParams.get("ref") ?? "main")?.get(decodeURIComponent(route.slice("/contents/".length)));
      return text === undefined ? Response.json({ message: "Not Found" }, { status: 404 }) : Response.json({ type: "file", content: Buffer.from(text).toString("base64") });
    }
    if (method === "GET" && route === "/git/ref/heads/main") return Response.json({ object: { sha: head } });
    if (method === "GET" && route.startsWith("/git/commits/")) return Response.json({ tree: { sha: parents.get(route.slice(13))!.tree } });
    if (method === "POST" && route === "/git/trees") {
      if (options.failTrees) return Response.json({ message: "tree.path contains a malformed path component" }, { status: 422 });
      const files = new Map(trees.get(body.base_tree)!);
      for (const t of body.tree as { path: string; sha?: null; content?: string }[]) t.sha === null ? files.delete(t.path) : files.set(t.path, t.content!);
      return Response.json({ sha: tree(files) });
    }
    if (method === "POST" && route === "/git/commits") return Response.json({ sha: commit(body.tree, body.parents[0]) });
    if (method === "PATCH" && route === "/git/refs/heads/main") {
      if (parents.get(body.sha)!.parent !== head) return Response.json({ message: "Update is not a fast forward" }, { status: 422 });
      head = body.sha;
      return Response.json({ object: { sha: head } });
    }
    throw new Error(`unexpected ${call}`);
  }) as typeof fetch;

  return {
    calls,
    queries,
    head: () => head,
    treeOf: (sha: string) => parents.get(sha)!.tree,
    json: (path: string) => {
      const text = filesAt(head)!.get(path);
      return text === undefined ? undefined : JSON.parse(text);
    },
    otherWriter,
    /** Runs `run` just before the next request that starts with `when` ("PATCH /git/refs"). */
    before: (when: string, run: () => void) => void hooks.push({ when, run }),
  };
}

const env = { GITHUB_TOKEN: "test-token-not-real", GITHUB_OWNER: "o", GITHUB_REPO: "r", GITHUB_BRANCH: "main" };
const dismissInState = (id: string) => (files: Map<string, string>) => {
  const state = JSON.parse(files.get(STATE) ?? '{"id":"news"}');
  files.set(STATE, JSON.stringify({ ...state, dismissed: [...(state.dismissed ?? []), id] }));
};

const realFetch = globalThis.fetch;
beforeEach(() => {
  mock.method(console, "warn", () => {});
});
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restoreAll();
});

describe("an import's write to GitHub (githubRepo)", () => {
  it("writes in 5 requests through GraphQL, from the files at the commit it goes on", async () => {
    const git = fakeGit({ [STATE]: { id: "news", last_sync: "t" }, [DRAFT]: { record: {} } }, { graphql: true });
    const start = git.head();
    await dismissDraft(githubRepo(env), "overwatch", "news", "alpha");
    assert.deepEqual(git.json(STATE), { id: "news", last_sync: "t", dismissed: ["alpha"] });
    assert.equal(git.json(DRAFT), undefined);
    assert.deepEqual(git.calls, ["GET /git/ref/heads/main", "POST /graphql", "POST /git/trees", "POST /git/commits", "PATCH /git/refs/heads/main"]);
    assert.deepEqual(git.queries[0], { owner: "o", name: "r", commit: start, p0: `${start}:${STATE}`, p1: `${start}:${DRAFT}` });
  });

  it("through REST, reads each file at the commit it goes on", async () => {
    const git = fakeGit({ [STATE]: { id: "news" }, [DRAFT]: { record: {} } });
    const start = git.head();
    await dismissDraft(githubRepo(env), "overwatch", "news", "alpha");
    assert.deepEqual(git.json(STATE), { id: "news", dismissed: ["alpha"] });
    const at = `?ref=${start}`;
    assert.deepEqual(git.calls, [
      "GET /git/ref/heads/main",
      "POST /graphql",
      `GET /git/commits/${start}`,
      `GET /contents/${STATE}${at}`,
      `GET /contents/${DRAFT}${at}`,
      "POST /git/trees",
      "POST /git/commits",
      "PATCH /git/refs/heads/main",
    ]);
  });

  it("works its change out again on the new head when the branch moves first, keeping the other writer's", async () => {
    const git = fakeGit({ [STATE]: { id: "news" }, [DRAFT]: { record: {} } }, { graphql: true });
    // A second tab dismisses beta between this dismissal's reads and its ref update.
    git.before("PATCH /git/refs", () => git.otherWriter(dismissInState("beta")));
    await dismissDraft(githubRepo(env), "overwatch", "news", "alpha");
    assert.deepEqual(git.json(STATE), { id: "news", dismissed: ["beta", "alpha"] });
    assert.equal(git.calls.filter((c) => c.startsWith("PATCH")).length, 2);
    assert.equal(git.calls.length, 10);
  });

  it("gives up after 3 tries when the branch keeps moving, with a 409 the admin can show", async () => {
    const git = fakeGit({ [STATE]: { id: "news" } }, { graphql: true });
    for (let i = 0; i < 5; i++) git.before("PATCH /git/refs", () => git.otherWriter(dismissInState(`other-${i}`)));
    await assert.rejects(dismissDraft(githubRepo(env), "overwatch", "news", "alpha"), (err: Error & { status?: number }) => {
      assert.equal(err.name, "ImportError");
      assert.equal(err.status, 409);
      assert.match(err.message, /changed while saving/);
      return true;
    });
    assert.equal(git.calls.length, 3 * 5);
    assert.deepEqual(git.json(STATE).dismissed, ["other-0", "other-1", "other-2"]);
  });

  it("fails at once on a 422 that isn't a moved branch, keeping its status", async () => {
    const git = fakeGit({ [STATE]: { id: "news" } }, { graphql: true, failTrees: true });
    await assert.rejects(dismissDraft(githubRepo(env), "overwatch", "news", "alpha"), (err: RepoError) => {
      assert.ok(err instanceof RepoError);
      assert.equal(err.status, 422);
      assert.equal(err.moved, false);
      return true;
    });
    assert.equal(git.calls.filter((c) => c.startsWith("POST /git/trees")).length, 1);
  });

  it("stops after the tries it's given (the cron worker's 2)", async () => {
    const git = fakeGit({ [STATE]: { id: "news" } }, { graphql: true });
    for (let i = 0; i < 2; i++) git.before("PATCH /git/refs", () => git.otherWriter(dismissInState(`other-${i}`)));
    const repo = githubRepo(env, fetch, { editAttempts: 2 });
    await assert.rejects(
      repo.edit({ reads: [], changes: () => [{ path: "data/x.json", content: {} }], message: "x" }),
      (err: RepoError) => err instanceof RepoError && err.status === 409,
    );
    assert.equal(git.calls.length, 2 * 5);
  });

  it("writes what reads nothing in 5 requests, without GraphQL", async () => {
    const git = fakeGit({}, { graphql: true });
    const start = git.head();
    await githubRepo(env).edit({ reads: [], changes: () => [{ path: "data/x.json", content: { a: 1 } }], message: "x" });
    assert.deepEqual(git.json("data/x.json"), { a: 1 });
    assert.deepEqual(git.calls, ["GET /git/ref/heads/main", `GET /git/commits/${start}`, "POST /git/trees", "POST /git/commits", "PATCH /git/refs/heads/main"]);
    // Nothing to write: no request at all.
    const made = git.calls.length;
    await githubRepo(env).edit({ reads: [], changes: () => [], message: "nothing" });
    assert.equal(git.calls.length, made);
  });
});
