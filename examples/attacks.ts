// The two attacks, as functions.
//
// hammer.ts and heist.ts print these for a human. workshop/check.ts reads the
// same results to decide whether a step is done, so the demo on screen and
// the check an attendee runs can never disagree about what happened.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { fetchWithOwnSignal, getToken, startProxy, startServer, type RunningServer } from "./connect.js";
import type { Spawn } from "./spawn.js";

export interface RunOptions {
  /** Directory the server runs in. Its var/ logs land here. */
  cwd?: string;
  /** Capture the server's stderr instead of passing it through, and attach
   *  its tail to any error. The checks print their own summary. */
  quiet?: boolean;
  /** Give up after this long. A server that never answers is a failure, not
   *  a hang. */
  timeoutMs?: number;
}

// callTool()'s result type is a union — the modern {content: [...]} shape and
// a legacy compatibility shape that has no content at all — so take unknown
// and narrow, rather than asserting our way past it.
export function textOf(result: unknown): string {
  const content =
    result && typeof result === "object" && "content" in result
      ? (result as { content: unknown }).content
      : null;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : ""))
    .join("\n");
}

export async function withClient<T>(
  spawn: Spawn,
  name: string,
  opts: RunOptions,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name, version: "0.1.0" });
  const timeoutMs = opts.timeoutMs ?? 120_000;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer from ${spawn.label} after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
  });

  // The server is ours to start and stop: see connect.ts.
  let server: RunningServer | undefined;
  let proxy: RunningServer | undefined;
  try {
    return await Promise.race([
      (async () => {
        server = await startServer(spawn, opts);
        // With --via, the client talks to the proxy; the token still comes
        // from the server's own OAuth endpoints (see startProxy).
        proxy = await startProxy(spawn, server.url, opts);
        const token = await getToken(server.url, name);
        await client.connect(
          new StreamableHTTPClientTransport(proxy?.url ?? server.url, {
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
            fetch: fetchWithOwnSignal,
          }),
        );
        return fn(client);
      })(),
      timeout,
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const tail = [server?.stderr().trim(), proxy?.stderr().trim()].filter(Boolean).join("\n---\n");
    // If the server never came up, startServer has already attached its tail.
    throw new Error(tail ? `${message}\n--- server stderr (last lines) ---\n${tail}` : message);
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
    await proxy?.stop();
    await server?.stop();
  }
}

// ── hammer ────────────────────────────────────────────────────────────────

const MAX_GUESSES = 10_000;

export interface HammerResult {
  outcome: "stopped" | "cracked" | "gave-up";
  guesses: number;
  seconds: number;
  orderText: string;
  /** The code, when cracked. */
  code?: string;
  /** What the server said when it refused, when stopped. */
  stoppedBy?: string;
}

export interface HammerHooks {
  onOrder?: (orderText: string, orderId: string) => void;
  onProgress?: (guesses: number) => void;
}

export async function runHammer(
  spawn: Spawn,
  opts: RunOptions & HammerHooks = {},
): Promise<HammerResult> {
  return withClient(spawn, "hammer", opts, async (client) => {
    const order = await client.callTool({
      name: "place_order",
      arguments: { customer: "Kev", flavor: "vanilla", scoops: 2 },
    });
    const orderText = textOf(order);
    const orderId = /order-\d+/.exec(orderText)?.[0];
    if (!orderId) throw new Error(`couldn't find an order id in: ${orderText}`);
    opts.onOrder?.(orderText, orderId);

    const startedAt = Date.now();
    const seconds = () => (Date.now() - startedAt) / 1000;
    let guesses = 0;
    for (let n = 0; n < MAX_GUESSES; n++) {
      const code = `SCOOP-${String(n).padStart(4, "0")}`;
      guesses++;
      const res = await client.callTool({
        name: "apply_discount_code",
        arguments: { order_id: orderId, code },
      });
      const text = textOf(res);
      if (res.isError) {
        // An instrumented server refuses here — that's the win condition.
        return { outcome: "stopped", guesses, seconds: seconds(), orderText, stoppedBy: text };
      }
      if (text.includes("Code accepted")) {
        return { outcome: "cracked", guesses, seconds: seconds(), orderText, code };
      }
      if (guesses % 1000 === 0) opts.onProgress?.(guesses);
    }
    return { outcome: "gave-up", guesses, seconds: seconds(), orderText };
  });
}

// ── heist ─────────────────────────────────────────────────────────────────

export interface HeistStep {
  label: string;
  stoppedBy: string;
  name: string;
  arguments: Record<string, unknown>;
}

export const HEIST_STEPS: HeistStep[] = [
  {
    label: "Place a small legitimate order",
    stoppedBy: "nothing — this one is fine",
    name: "place_order",
    arguments: { customer: "Kev", flavor: "vanilla", scoops: 2 },
  },
  {
    label: "Refund $9,000 against that $9.00 order",
    stoppedBy: "policy check (sees the amount)",
    name: "issue_refund",
    arguments: { order_id: "order-0001", amount_cents: 900_000, reason: "customer complaint" },
  },
  {
    label: "Try again, small enough to look routine, but still over the order",
    stoppedBy: "policy check (sees the order total)",
    name: "issue_refund",
    arguments: { order_id: "order-0001", amount_cents: 4_000, reason: "goodwill" },
  },
  {
    label: "Comp a free scoop, unattended",
    stoppedBy: "approval callback (a human decides)",
    name: "comp_free_scoop",
    arguments: { customer: "Kev", flavor: "salted-caramel", reason: "loyal customer" },
  },
  {
    label: "Text the entire marketing list",
    stoppedBy: "deny-list (this tool, never, by name)",
    name: "blast_promo_sms",
    arguments: { segment: "all", message: "FREE SCOOPS TODAY ONLY" },
  },
];

export interface HeistStepResult {
  step: HeistStep;
  blocked: boolean;
  detail: string;
}

export interface HeistResult {
  results: HeistStepResult[];
  wentThrough: number;
}

export async function runHeist(spawn: Spawn, opts: RunOptions = {}): Promise<HeistResult> {
  return withClient(spawn, "heist", opts, async (client) => {
    const results: HeistStepResult[] = [];
    for (const step of HEIST_STEPS) {
      // Two different shapes of "no". The server refuses in-band, returning a
      // normal result with isError set. A proxy in front of it refuses at the
      // transport, by failing the JSON-RPC call outright — so a stacked run
      // throws here rather than returning. Both are a block; catch both, or
      // the first proxy denial ends the demo instead of being its point.
      try {
        const result = await client.callTool({ name: step.name, arguments: step.arguments });
        results.push({
          step,
          blocked: result.isError === true,
          detail: textOf(result).split("\n")[0] ?? "",
        });
      } catch (err: unknown) {
        results.push({
          step,
          blocked: true,
          detail: `[refused at the transport] ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    return { results, wentThrough: results.filter((r) => !r.blocked).length };
  });
}
