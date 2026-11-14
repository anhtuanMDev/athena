import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyAdminPassword } from "../app/lib/password";
import { run } from "../tools/admin-password";

// tools/admin-password.ts: what the user runs to make ADMIN_PASSWORD_HASH.
// Test passphrases only; the prompts are answered in-process.

function io(answers: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  return {
    out,
    err,
    asked,
    io: {
      ask: async (question: string) => {
        asked.push(question);
        return answers.shift() ?? "";
      },
      out: (line: string) => void out.push(line),
      err: (line: string) => void err.push(line),
    },
  };
}

const PASS = "a-test-passphrase-typed-twice";

describe("making the admin password's verifier", () => {
  it("prints only the verifier, which accepts the passphrase typed twice", async () => {
    const t = io([PASS, PASS]);
    assert.equal(await run([], t.io), 0);
    assert.equal(t.asked.length, 2);
    assert.equal(t.out.length, 1);
    assert.match(t.out[0], /^pbkdf2-sha256:20000:/);
    assert.equal(await verifyAdminPassword(PASS, t.out[0]), true);
    assert.ok(![...t.out, ...t.err].some((line) => line.includes(PASS)), "never shows a typed passphrase");
  });

  it("refuses a passphrase under 16 characters, or one typed differently the second time", async () => {
    for (const answers of [["short-15-chars!", "short-15-chars!"], [PASS, `${PASS}x`], ["", ""]]) {
      const t = io(answers);
      assert.equal(await run([], t.io), 1, answers[0]);
      assert.deepEqual(t.out, []);
      assert.ok(t.err.length > 0);
    }
  });

  it("with --generate, makes a 24-character passphrase, shows it on stderr only, and prints its verifier", async () => {
    const t = io([]);
    assert.equal(await run(["--generate"], t.io), 0);
    assert.deepEqual(t.asked, []);
    assert.equal(t.out.length, 1);
    const shown = t.err.map((line) => /^\s+([A-Za-z0-9_-]{24})$/.exec(line)?.[1]).find(Boolean);
    assert.ok(shown, t.err.join("\n"));
    assert.equal(await verifyAdminPassword(shown!, t.out[0]), true);
  });

  it("takes --iterations from 10,000 to 100,000, and refuses anything else it doesn't know", async () => {
    const t = io([PASS, PASS]);
    assert.equal(await run(["--iterations", "50000"], t.io), 0);
    assert.match(t.out[0], /^pbkdf2-sha256:50000:/);
    for (const args of [["--iterations", "5000"], ["--iterations", "lots"], ["--iterations"], [PASS], ["--generate", "--generate"]]) {
      const bad = io([PASS, PASS]);
      assert.equal(await run(args, bad.io), 2, args.join(" "));
      assert.deepEqual(bad.out, []);
      assert.deepEqual(bad.asked, []);
      assert.ok(!bad.err.some((line) => line.includes(PASS)), "never echoes an argument that may be a passphrase");
    }
  });

  it("explains itself with --help, asking nothing", async () => {
    const t = io([]);
    assert.equal(await run(["--help"], t.io), 0);
    assert.deepEqual(t.asked, []);
    assert.deepEqual(t.out, []);
    assert.match(t.err.join("\n"), /ADMIN_PASSWORD_HASH/);
  });
});
