// The ice cream truck at the end of step 1: rate limiting, nothing else.
//
// `npm run catchup 1` copies this over src/server.ts. The finished server,
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
import { ToolGuard } from "../src/toolGuard.js";
import { allowAll } from "../src/allowAll.js";

import { FixedWindowRateLimitStore } from "./rateLimit.js";

const shop = new Shop();

const guard = new ToolGuard({
  // The real policy is step 4.
  runtime: allowAll,

  // Step 1 — 30 calls per caller per minute.
  rateLimit: 30,
  rateLimitStore: new FixedWindowRateLimitStore(60_000),

  responseScanner: null,
});

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

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

function callerId(extra: { authInfo?: AuthInfo }): string {
  return extra.authInfo?.clientId ?? "anonymous";
}

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args = {} } = request.params;
  const agentId = callerId(extra);
  logCall(name, args as Record<string, unknown>);
  const params = args as Record<string, unknown>;

  const decision = await guard.guardToolCall(agentId, name, params);
  if (!decision.allowed) {
    return {
      content: [{ type: "text", text: `Denied (${decision.stage}): ${decision.reason}` }],
      isError: true,
    };
  }

  try {
    const text = dispatch(shop, name, params);
    return { content: [{ type: "text", text }] };
  } catch (err: unknown) {
    if (err instanceof ShopError) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    throw err;
  }
});

async function main(): Promise<void> {
  await serveHttp(server, "scoop-truck (step 1: rate limit)");
}

main().catch((err: unknown) => {
  console.error("scoop-truck failed to start:", err);
  process.exit(1);
});
