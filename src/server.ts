// The ice cream truck at the end of step 4: rate limiting, a signed receipt
// chain, and a policy that reads the arguments.
//
// `npm run catchup 4` copies this over src/server.ts. The finished server,
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

import { FixedWindowRateLimitStore } from "./rateLimit.js";
import { redactShopParams } from "./auditLog.js";
import { ReceiptAuditSink } from "./receipts.js";
import { createShopPolicy } from "./policy.js";

const RECEIPT_LOG = "var/receipts.jsonl";

const shop = new Shop();

// Step 3 — the audit sink signs. Step 2's JsonlAuditSink is the same
// interface, so this is the only line that changes between them:
//   const audit = new JsonlAuditSink("var/audit.jsonl");
const audit = new ReceiptAuditSink(RECEIPT_LOG);

const guard = new ToolGuard({
  // Step 4 — the pluggable check. Sees arguments, so it can tell a $9
  // refund from a $9,000 one.
  runtime: createShopPolicy(shop),

  // Deny-list: per tool NAME, evaluated before anything else and before any
  // argument is looked at. blast_promo_sms doesn't need nuance — nothing an
  // agent can put in the message field makes texting 12,403 people
  // unattended a good idea.
  deniedTools: ["blast_promo_sms"],

  // Sensitive: allowed, but a human says yes first.
  sensitiveTools: ["comp_free_scoop"],
  approvalCallback: async (agentId, toolName, params): Promise<"approved" | "denied"> => {
    // A real one pages someone, or writes a row a UI polls, and the tool
    // call waits for an answer.
    //
    // This one denies by default. A stub that always approves is worse than
    // no approval step at all: the tool call goes through exactly as it
    // would have, and now the audit trail records a human decision that
    // never happened. You've added a lie to your evidence. Default to
    // "denied" and make approving the thing that takes deliberate action —
    // here, an env var you have to set on purpose:
    //
    //   SCOOP_AUTO_APPROVE=1 npm run heist -- solution/server.ts
    console.error(`[approval] ${agentId} wants ${toolName}: ${JSON.stringify(params)}`);
    return process.env["SCOOP_AUTO_APPROVE"] === "1" ? "approved" : "denied";
  },

  // Step 1 — rate limiting. 30 calls per caller per minute: generous for a
  // human ordering ice cream, hopeless for a 10,000-guess brute force.
  rateLimit: 30,
  rateLimitStore: new FixedWindowRateLimitStore(60_000),

  // Step 2 — the audit trail, and what gets stripped before it's written.
  auditSink: audit,
  redact: redactShopParams,

  // Response-side scanning is left off here (`null` disables it). The truck
  // returns its own text and there's no untrusted content flowing back
  // through it, so a scanner would be theatre. Turn it on when a tool
  // returns something you didn't author — a web fetch, a database row
  // someone else wrote, a support ticket body.
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

/**
 * Pull the upstream mediator's correlation ID out of the request, if there is
 * one.
 *
 * When a proxy like Pipelock fronts this server it writes a mediation
 * envelope into MCP `_meta`, and its `rid` is the id of ITS receipt for this
 * same call. Recording that in our receipt is what makes the two independent
 * evidence chains joinable after the fact — otherwise you are matching them
 * by timestamp and tool name, by hand.
 *
 * Treat it as a label and nothing more. The envelope is NOT signed on either
 * MCP transport — stdio or HTTP — and setting Pipelock's `sign: true` does
 * not change that on an MCP link; it is accepted without warning and still
 * sends no signature. So any client can put whatever it likes in `_meta` —
 * including a `rid` that points at someone else's receipt, or no `_meta` at
 * all. The envelope also
 * carries `vd: "allow"` and an `actor`; those are the mediator's claims about
 * its own decision, not facts about the caller, and a server that trusted
 * them would be taking an untrusted caller's word for its own authorization.
 * This reads exactly one field, uses it only as a join key, and lets every
 * check below run as if it weren't there.
 */
function mediationCorrelationId(params: Record<string, unknown>): string | undefined {
  const meta = params["_meta"];
  if (!meta || typeof meta !== "object") return undefined;
  const envelope = (meta as Record<string, unknown>)["com.pipelock/mediation"];
  if (!envelope || typeof envelope !== "object") return undefined;
  const rid = (envelope as Record<string, unknown>)["rid"];
  return typeof rid === "string" && rid.length > 0 ? rid : undefined;
}

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args = {} } = request.params;
  const agentId = callerId(extra);
  logCall(name, args as Record<string, unknown>);
  const params = args as Record<string, unknown>;
  const correlationId = mediationCorrelationId(
    request.params as unknown as Record<string, unknown>,
  );

  // One gate, before anything executes. Rate limit, deny-list, dangerous
  // parameter patterns, the policy check, and the approval callback all
  // happen inside this call, and every one of them writes an audit entry
  // whether it allowed or denied — including the denials, which is the half
  // people forget. A log that only records what succeeded can't show you an
  // attack that failed.
  const decision = await guard.guardToolCall(agentId, name, params, correlationId);
  if (!decision.allowed) {
    return {
      content: [{ type: "text", text: `Denied (${decision.stage}): ${decision.reason}` }],
      isError: true,
    };
  }

  try {
    const text = dispatch(shop, name, params);

    // Record the outcome too, not just the permission. Without this the
    // receipt chain says what was allowed to run, never what it did — and
    // "allowed" is not the same claim as "succeeded".
    await guard.guardToolResponse(agentId, name, text, correlationId);

    return { content: [{ type: "text", text }] };
  } catch (err: unknown) {
    if (err instanceof ShopError) {
      await guard.guardToolResponse(agentId, name, `error: ${err.message}`, correlationId);
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    throw err;
  }
});

async function main(): Promise<void> {
  await serveHttp(server, "scoop-truck (instrumented)");
  console.error(`  signing as ${audit.did}`);
  console.error(`  receipts   ${RECEIPT_LOG}`);
}

main().catch((err: unknown) => {
  console.error("scoop-truck failed to start:", err);
  process.exit(1);
});
