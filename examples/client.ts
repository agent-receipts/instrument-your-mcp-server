// "What would a careful client let run without asking?"
//
// No model involved: this lists the truck's tools and applies the rules a
// cautious MCP client uses, going by each tool's annotations. Annotations are
// the server's own hints about its tools. A client can't verify them, so with
// none it has to assume the worst (the MCP spec's defaults: not read-only,
// possibly destructive) and ask about everything.
//
//   npm run client                          # your server
//   npm run client -- solution/server.ts    # the finished one

import { withClient } from "./attacks.js";
import { spawnFromArgv } from "./spawn.js";

export interface Hints {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
}

/** What a careful client does with a tool, from its hints alone. */
export function decide(hints: Hints | undefined): { action: "run" | "ask"; why: string } {
  if (!hints) return { action: "ask", why: "no hints, so it could do anything" };
  if (hints.readOnlyHint) return { action: "run", why: "says it only reads" };
  const outside = hints.openWorldHint ? ", and reaches outside the system" : "";
  // The spec's default for destructiveHint is true: unless a tool says it
  // isn't destructive, assume it is.
  if (hints.destructiveHint !== false) return { action: "ask", why: `says it can destroy or give away${outside}` };
  return { action: "run", why: `changes data, but says nothing destructive${outside}` };
}

async function main(): Promise<void> {
  const spawn = spawnFromArgv(process.argv.slice(2));
  console.log(`\nwhat a careful client does with ${spawn.label}'s tools\n`);
  const tools = await withClient(spawn, "client", { quiet: true }, async (client) => (await client.listTools()).tools);
  for (const tool of tools) {
    const { action, why } = decide(tool.annotations);
    console.log(`  ${action === "run" ? "run" : "ASK"}  ${tool.name.padEnd(22)} ${why}`);
  }
  const asks = tools.filter((t) => decide(t.annotations).action === "ask").length;
  console.log(`\n${tools.length - asks} of ${tools.length} tools run without asking.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
