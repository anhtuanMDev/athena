// Makes the value of ADMIN_PASSWORD_HASH from a new admin passphrase, on your
// own computer: the passphrase never leaves it, and only the verifier
// (app/lib/password.ts) goes to Cloudflare.
//
//   npm run admin-password                  asks for the passphrase twice, without showing it
//   npm run admin-password -- --generate    makes a random one and shows it once
//   npm run admin-password -- --iterations 50000
//
// Only the verifier is written to stdout, so it can be piped (to pbcopy, say);
// everything else goes to stderr. A passphrase is never taken as an argument,
// where it would stay in the shell's history.

import { fileURLToPath } from "node:url";

import { MAX_ITERATIONS, MIN_ITERATIONS, PBKDF2_ITERATIONS, hashAdminPassword } from "../app/lib/password";

export interface Io {
  /** Asks for a line without showing what is typed. */
  ask(question: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

const MIN_LENGTH = 16;
/** 18 random bytes: 24 base64url characters, 144 bits. */
const GENERATED_BYTES = 18;

const USAGE = [
  "Makes the value of ADMIN_PASSWORD_HASH (the admin's sign-in) from a new passphrase.",
  "",
  "  npm run admin-password                  type a passphrase of 16 characters or more, twice",
  "  npm run admin-password -- --generate    make a random 24-character passphrase instead",
  `  --iterations N                          PBKDF2 iterations, ${MIN_ITERATIONS} to ${MAX_ITERATIONS} (default ${PBKDF2_ITERATIONS})`,
  "",
  "Only the verifier goes to stdout. Set it in Cloudflare as the secret ADMIN_PASSWORD_HASH, then redeploy.",
];

const NEXT_STEPS = [
  "",
  "That line is the new ADMIN_PASSWORD_HASH. Set it in Cloudflare: Workers & Pages > athena > Settings >",
  "Variables and Secrets > ADMIN_PASSWORD_HASH (a secret), for Production and Preview, then redeploy.",
];

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Runs the tool with `args`; the exit code (0 made, 1 refused the passphrase, 2 bad arguments). */
export async function run(args: string[], io: Io): Promise<number> {
  let iterations = PBKDF2_ITERATIONS;
  let generate = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      USAGE.forEach(io.err);
      return 0;
    }
    if (arg === "--generate" && !generate) {
      generate = true;
      continue;
    }
    if (arg === "--iterations" && /^[0-9]+$/.test(args[i + 1] ?? "")) {
      iterations = Number(args[++i]);
      if (iterations >= MIN_ITERATIONS && iterations <= MAX_ITERATIONS) continue;
      io.err(`--iterations must be from ${MIN_ITERATIONS} to ${MAX_ITERATIONS}.`);
      return 2;
    }
    // Never echoed: it may be a passphrase typed in the wrong place.
    io.err(arg === "--iterations" ? `--iterations needs a number from ${MIN_ITERATIONS} to ${MAX_ITERATIONS}.` : "Unknown or repeated argument; see --help.");
    return 2;
  }

  let passphrase: string;
  if (generate) {
    passphrase = toBase64Url(crypto.getRandomValues(new Uint8Array(GENERATED_BYTES)));
    io.err("Your new admin passphrase. Save it in your password manager now; it isn't shown again:");
    io.err("");
    io.err(`  ${passphrase}`);
    io.err("");
  } else {
    passphrase = await io.ask(`New admin passphrase (${MIN_LENGTH} characters or more, not shown): `);
    if (passphrase.length < MIN_LENGTH) {
      io.err(`That's shorter than ${MIN_LENGTH} characters. Use a long random one (a password manager's), or --generate.`);
      return 1;
    }
    if ((await io.ask("The same again: ")) !== passphrase) {
      io.err("The two didn't match. Nothing was made.");
      return 1;
    }
  }
  io.out(await hashAdminPassword(passphrase, { iterations }));
  NEXT_STEPS.forEach(io.err);
  return 0;
}

/** What stdin sent past the last line read: piped input can bring both answers at once. */
let leftover = "";

/** Reads a line from the terminal without echoing it; from stdin as it comes when that isn't a terminal. */
function hiddenPrompt(question: string): Promise<string> {
  const input = process.stdin;
  process.stderr.write(question);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      input.off("data", onData);
      input.off("end", onEnd);
      if (input.isTTY) input.setRawMode(false);
      input.pause();
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    /** Takes `text` a character at a time; true once the line is complete. */
    const take = (text: string): boolean => {
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === "\r" || char === "\n") {
          leftover = text.slice(i + (char === "\r" && text[i + 1] === "\n" ? 2 : 1));
          finish();
          return true;
        }
        if (char === "\u0003" || char === "\u0004") {
          finish(new Error("Cancelled; nothing was made."));
          return true;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
      return false;
    };
    const onData = (chunk: string) => void take(chunk);
    // Piped input that ends without a newline still ends the line.
    const onEnd = () => finish();
    const pending = leftover;
    leftover = "";
    if (input.isTTY) input.setRawMode(true);
    input.setEncoding("utf8");
    input.on("data", onData);
    input.on("end", onEnd);
    if (!take(pending)) input.resume();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2), { ask: hiddenPrompt, out: (line) => console.log(line), err: (line) => console.error(line) }).then(
    (code) => {
      process.exitCode = code;
    },
    (err: Error) => {
      console.error(err.message);
      process.exitCode = 1;
    },
  );
}
