// The ice cream truck at the end of step 0: still uninstrumented, but its
// tools now say what they do (MCP annotations, in solution/tools.ts).
//
// `npm run catchup 0` copies this over src/server.ts. The finished server,
// with all of steps 0 to 5, is solution/server.ts.

import { appendFileSync, mkdirSync } from "node:fs";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { Shop, ShopError } from "../src/shop.js";
import { serveHttp } from "../src/http.js";
import { TOOLS, dispatch } from "./tools.js";

const shop = new Shop();

// Logging, the way it usually gets added: one line per call, to a file, so
// there's something to look at when things go wrong. It isn't an audit trail.
// It records what was asked, never what was decided or what happened; it keeps
// every argument as given, discount codes included; and anyone with access to
// the machine can edit it. Redacting the audit trail (step 2) doesn't touch it.
mkdirSync("var", { recursive: true });

function logCall(name: string, args: Record<string, unknown>): void {
  appendFileSync("var/server.log", `${new Date().toISOString()} ${name} ${JSON.stringify(args)}\n`);
}

const server = new Server(
  { name: "scoop-truck", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

/**
 * Who is calling?
 *
 * The truck sits behind OAuth (src/http.ts, src/auth.ts). Every client
 * registers, gets its own client_id, and sends a bearer token issued to that
 * id; by the time a call reaches this handler, `extra.authInfo` says which
 * client it is. That is what makes per-caller rate limits and per-caller
 * audit entries mean something. Return a constant here instead and one noisy
 * caller spends everyone's budget, and your audit log can't tell you who did
 * what. Return something that changes every call and there is no budget at
 * all.
 *
 * Getting this wrong is one of the red-team exercises, which is why it's a
 * named function rather than a string literal inlined below.
 */
function callerId(extra: { authInfo?: AuthInfo }): string {
  return extra.authInfo?.clientId ?? "anonymous";
}

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args = {} } = request.params;
  const agentId = callerId(extra);
  logCall(name, args as Record<string, unknown>);

  // ─────────────────────────────────────────────────────────────────────
  // PART ONE goes here. In order, cheapest to most expensive:
  //
  //   1. rate limiting   — a budget per caller, before anything executes
  //   2. audit trail     — record what was asked, allowed, and returned
  //   3. signed receipts — Ed25519 over the record, so it can't be edited
  //                        after the fact without detection
  //   4. policy check    — a pluggable allow/deny before dispatch
  //
  // `src/toolGuard.ts` already implements all four as injectable pieces.
  // The finished version of this handler is in `solution/server.ts` — try
  // it yourself first.
  // ─────────────────────────────────────────────────────────────────────

  try {
    const text = dispatch(shop, name, args as Record<string, unknown>);
    return { content: [{ type: "text", text }] };
  } catch (err: unknown) {
    if (err instanceof ShopError) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    throw err;
  }
});

async function main(): Promise<void> {
  await serveHttp(server, "scoop-truck MCP server");
}

main().catch((err: unknown) => {
  console.error("scoop-truck failed to start:", err);
  process.exit(1);
});
