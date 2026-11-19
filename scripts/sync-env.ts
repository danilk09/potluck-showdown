// Copies the server-side API keys from .env onto the Convex deployment.
// Convex functions read process.env on the deployment, never this project's
// .env file, so the keys have to be set there.
//
//   npm run env:sync     (also runs at the start of npm run eval:seed)
//
// Needs the backend running (npx convex dev). Values are never printed.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";

const KEYS = ["PRIVATE_MODE_API_KEY", "USDA_API_KEY"];

if (!existsSync(".env")) {
  console.error("✖ No .env file found in the project folder.");
  process.exit(1);
}
const env = parse(readFileSync(".env"));
const found = KEYS.filter((k) => env[k]?.trim());
const missing = KEYS.filter((k) => !found.includes(k));
if (missing.length) console.warn(`! Not in .env, skipped: ${missing.join(", ")}`);
if (!found.length) process.exit(0);

// Only these keys go to the server, through a temporary file so they never
// appear on a command line.
// Single quotes keep a value literal for dotenv, which the Convex CLI uses to read the file.
const quote = (value: string) => (value.includes("'") ? `"${value}"` : `'${value}'`);
const content = found.map((k) => `${k}=${quote(env[k].trim())}`).join("\n") + "\n";
const roundTrip = parse(content);
if (found.some((k) => roundTrip[k] !== env[k].trim())) {
  console.error("✖ A key in .env has characters that can't be copied safely. Set it by hand: npx convex env set NAME");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "convex-env-"));
const file = join(dir, "keys.env");
try {
  writeFileSync(file, content, { mode: 0o600 });
  execFileSync(process.execPath, [join("node_modules", "convex", "bin", "main.js"), "env", "set", "--from-file", file, "--force"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  console.log(`✔ Set on the Convex deployment: ${found.join(", ")}`);
} catch {
  console.error("✖ Couldn't set the keys. Is the backend running? Start it with npx convex dev and try again.");
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
