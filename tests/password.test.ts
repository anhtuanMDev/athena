import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { PasswordConfigError, hashAdminPassword, verifyAdminPassword } from "../app/lib/password";

// The admin password check (app/lib/password.ts). Test passphrases only.

const PASS = "test-passphrase-for-unit-tests-only";
const VERIFIER = /^pbkdf2-sha256:(\d+):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$/;

let warnings: string[];
beforeEach(() => {
  warnings = [];
  mock.method(console, "warn", (...args: unknown[]) => warnings.push(args.map(String).join(" ")));
});
afterEach(() => mock.restoreAll());

describe("the admin password check", () => {
  it("makes a pbkdf2-sha256 verifier of 20,000 iterations with its own salt, and no $ in it", async () => {
    const one = await hashAdminPassword(PASS);
    const two = await hashAdminPassword(PASS);
    assert.match(one, VERIFIER);
    assert.equal(VERIFIER.exec(one)![1], "20000");
    assert.ok(!one.includes("$"));
    assert.notEqual(one, two, "a new salt each time");
  });

  it("accepts the passphrase it was made from, and nothing else", async () => {
    const stored = await hashAdminPassword(PASS);
    assert.equal(await verifyAdminPassword(PASS, stored), true);
    for (const wrong of ["", "test-passphrase-for-unit-tests-onl", `${PASS} `, PASS.toUpperCase()]) {
      assert.equal(await verifyAdminPassword(wrong, stored), false, JSON.stringify(wrong));
    }
    assert.deepEqual(warnings, []);
  });

  it("reads the iterations from the verifier, from 10,000 to 100,000", async () => {
    for (const iterations of [10_000, 100_000]) {
      const stored = await hashAdminPassword(PASS, { iterations });
      assert.equal(VERIFIER.exec(stored)![1], String(iterations));
      assert.equal(await verifyAdminPassword(PASS, stored), true);
    }
    for (const iterations of [9_999, 100_001, 1.5]) await assert.rejects(hashAdminPassword(PASS, { iterations }), RangeError);
  });

  it("refuses a bcrypt hash as a setup error, saying how to replace it without showing it", async () => {
    // Shaped like a bcrypt hash at cost 10; not the hash of anything.
    const body = "a".repeat(22) + "b".repeat(31);
    for (const prefix of ["$2a$", "$2b$", "$2y$"]) {
      for (const input of [PASS, "wrong"]) {
        await assert.rejects(verifyAdminPassword(input, `${prefix}10$${body}`), (err: unknown) => {
          assert.ok(err instanceof PasswordConfigError);
          assert.match(err.message, /ADMIN_PASSWORD_HASH is a bcrypt hash/);
          assert.match(err.message, /`npm run admin-password`/);
          assert.ok(!err.message.includes("$2") && !err.message.includes(body.slice(0, 22)), "never shows the hash");
          return true;
        });
      }
    }
    // A damaged one gets the same message.
    await assert.rejects(verifyAdminPassword(PASS, "$2b$10$short"), /ADMIN_PASSWORD_HASH is a bcrypt hash/);
    assert.deepEqual(warnings, []);
  });

  it("treats a stored value it can't use as a setup error, never as a wrong password", async () => {
    const good = await hashAdminPassword(PASS);
    const [, , salt, hash] = good.split(":");
    for (const stored of [
      "",
      "hunter2",
      "$1$md5$whatever",
      `pbkdf2-sha256:5000:${salt}:${hash}`,
      `pbkdf2-sha256:200000:${salt}:${hash}`,
      `pbkdf2-sha256:20000.5:${salt}:${hash}`,
      `pbkdf2-sha256:20000:${salt}`,
      `pbkdf2-sha256:20000:not+base64url:${hash}`,
      `pbkdf2-sha256:20000:${salt}:${hash.slice(1)}`,
      `pbkdf2-sha512:20000:${salt}:${hash}`,
      ` ${good}`,
    ]) {
      await assert.rejects(verifyAdminPassword(PASS, stored), PasswordConfigError, JSON.stringify(stored));
    }
  });
});
