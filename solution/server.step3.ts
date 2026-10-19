// The ice cream truck at the end of step 3: rate limiting and a signed receipt
// chain.
//
// `npm run catchup 3` copies this over src/server.ts. The finished server,
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
import { redactShopParams } from "./auditLog.js";
import { ReceiptAuditSink } from "./receipts.js";

const RECEIPT_LOG = "var/receipts.jsonl";

const shop = new Shop();

// Step 3 — the audit sink signs. Same interface as step 2's JsonlAuditSink,
// so this is the only line that changed.
const audit = new ReceiptAuditSink(RECEIPT_LOG);

const guard = new ToolGuard({
  // The real policy is step 4.
  runtime: allowAll,

  // Step 1 — 30 calls per caller per minute.
  rateLimit: 30,
  rateLimitStore: new FixedWindowRateLimitStore(60_000),

  // Steps 2 and 3 — every decision written down, now as signed receipts,
  // with secrets stripped first.
  auditSink: audit,
  redact: redactShopParams,

  responseScanner: null,
});

// Logging, the way it usually gets added: one line per call, to a file, so
// there's something to look at when things go wrong. It isn't an audit trail.
// It records what was asked, never what was decided or what happened; it keeps
// every argument as given, discount codes included; and anyone with access to
// the machine can edit it. Redacting the audit trail (step 2) doesn't touch it.
mkdirSync("var", { recursive: true });

// The app log, left as it was on purpose: it still writes every argument,
// discount codes included (step 2's first attack). A real server would
// pass it through the same redact function, or log less.
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
    await guard.guardToolResponse(agentId, name, text);
    return { content: [{ type: "text", text }] };
  } catch (err: unknown) {
    if (err instanceof ShopError) {
      await guard.guardToolResponse(agentId, name, `error: ${err.message}`);
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    throw err;
  }
});

async function main(): Promise<void> {
  await serveHttp(server, "scoop-truck (step 3: rate limit, signed receipts)");
  console.error(`  signing as ${audit.did}`);
  console.error(`  receipts   ${RECEIPT_LOG}`);
}

main().catch((err: unknown) => {
  console.error("scoop-truck failed to start:", err);
  process.exit(1);
});
