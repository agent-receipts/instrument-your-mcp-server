// npm run preflight
//
// Run this before the workshop. It checks your Node version, that
// npm install worked, and that the ice cream truck starts and answers.
// Then it notes whether the tools for steps 6 and 7 are there. Those are
// optional: a missing one is a note, never a FAIL.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { paint } from "./lib/colour.js";
import { MIN_NODE, nodeSupported } from "./lib/node.js";
import { ROOT, serverSpawn } from "./lib/paths.js";

/** The promptfoo version step 7 pins, and the Node it asks for. */
const PROMPTFOO = "0.124.1";
const PROMPTFOO_NODE = "22.22.0";

function nodeAtLeast(have: string, need: string): boolean {
  const h = have.replace(/^v/, "").split(".").map(Number);
  const n = need.split(".").map(Number);
  for (let i = 0; i < n.length; i++) {
    if ((h[i] ?? 0) !== (n[i] ?? 0)) return (h[i] ?? 0) > (n[i] ?? 0);
  }
  return true;
}

let failed = false;

function report(ok: boolean, what: string, fix?: string): void {
  console.log(`${ok ? paint("green", "ok  ") : paint(["red", "bold"], "FAIL")}  ${what}`);
  if (!ok) {
    failed = true;
    if (fix) console.log(`      ${fix.split("\n").join("\n      ")}`);
  }
}

/** A line for something only one optional step needs. Never a FAIL. */
function note(ok: boolean, what: string): void {
  console.log(`${ok ? paint("green", "ok  ") : paint("yellow", "note")}  ${what}`);
}

/** The first line a command prints, or undefined if it isn't there or fails. */
function versionOf(command: string, args: string[], env: Record<string, string> = {}): string | undefined {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (r.error || r.status !== 0) return undefined;
  return `${r.stdout ?? ""}`.trim().split("\n")[0];
}

/** Steps 6 and 7 use tools the rest of the workshop doesn't. Pairing with
 *  someone, or watching, is fine, so these are notes, not failures. */
function optionalTools(): void {
  const pipelock = versionOf(process.env["SCOOP_PIPELOCK"] ?? "pipelock", ["version"]);
  note(
    pipelock !== undefined,
    pipelock
      ? `${pipelock.replace(/^pipelock version/, "Pipelock")} (for step 6)`
      : "Pipelock not installed: needed only for step 6. SETUP.md says how, or pair with someone",
  );

  // npm run promptfoo:install puts it in examples/promptfoo/; look, don't install.
  const promptfoo = existsSync(join(ROOT, "examples/promptfoo/node_modules/promptfoo/package.json"));
  const ollama = versionOf(process.env["SCOOP_OLLAMA"] ?? "ollama", ["--version"]);
  const missing = [
    ...(promptfoo ? [] : ["promptfoo not installed yet (npm run promptfoo:install)"]),
    ...(nodeAtLeast(process.versions.node, PROMPTFOO_NODE) ? [] : [`promptfoo needs Node ${PROMPTFOO_NODE} or newer`]),
    ...(ollama ? [] : ["Ollama not installed"]),
  ];
  note(
    missing.length === 0,
    missing.length === 0
      ? `promptfoo ${PROMPTFOO} and Ollama (for step 7)`
      : `${missing.join(", ")}: needed only for step 7. SETUP.md says how, or pair with someone`,
  );
}

async function main(): Promise<void> {
  const nodeOk = nodeSupported(process.versions.node);
  report(
    nodeOk,
    `Node ${process.versions.node}`,
    `The workshop needs Node ${MIN_NODE} or newer. Download it from https://nodejs.org`,
  );

  let depsError: string | null = null;
  try {
    await import("@modelcontextprotocol/sdk/client/index.js");
    await import("@obsigna/sdk-ts");
  } catch (err: unknown) {
    depsError = (err instanceof Error ? err.message : String(err)).split("\n")[0] ?? "";
  }
  const depsOk = depsError === null;
  report(
    depsOk,
    "dependencies installed",
    nodeOk
      ? `${depsError}\nRun npm install in this folder (the one with package.json), then try again.`
      : `${depsError}\nThis is probably the Node version above. Upgrade Node first.`,
  );

  if (depsOk) {
    // Imported here rather than at the top, so a missing dependency is
    // reported above instead of crashing this script before it starts.
    const { withClient, textOf } = await import("../examples/attacks.js");
    try {
      const text = await withClient(
        serverSpawn(),
        "preflight",
        { cwd: ROOT, quiet: true, timeoutMs: 30_000 },
        async (client) => textOf(await client.callTool({ name: "list_flavors", arguments: {} })),
      );
      report(text.includes("vanilla"), "the truck starts and lists its flavours", `Unexpected answer: ${text}`);
    } catch (err: unknown) {
      report(false, "the truck starts and lists its flavours", err instanceof Error ? err.message : String(err));
    }
  }

  optionalTools();

  console.log(failed ? "\nFix the FAIL lines above, then run npm run preflight again." : `\n${paint("green", "You're ready.")}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
