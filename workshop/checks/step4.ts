// Step 4: the policy reads the arguments, and the heist gets 1 of 5 through.
// When it doesn't, say which request got through and what should have
// stopped it, so a half-finished step 4 is easy to finish.

import { existsSync, readFileSync } from "node:fs";

import { runHeist, type HeistResult } from "../../examples/attacks.js";
import { Shop } from "../../src/shop.js";
import type { PolicyRuntime } from "../../src/toolGuard.js";
import { at, importFrom, serverSpawn } from "../lib/paths.js";
import { ATTACK, describe, fail, notWrittenYet, pass, type CheckResult } from "./result.js";

type Module = { createShopPolicy: (shop: Shop) => PolicyRuntime };

export async function checkStep4(): Promise<CheckResult> {
  try {
    const { createShopPolicy } = await importFrom<Module>("src/policy.ts");
    const shop = new Shop();
    const order = shop.placeOrder("check", "vanilla", 2); // $9.00
    const policy = createShopPolicy(shop);
    const ask = async (toolName: string, args: Record<string, unknown>) =>
      (await policy.evaluatePreToolCall({ agentId: "check", toolName, args, callId: "check" })).allowed;

    if (await ask("issue_refund", { order_id: order.id, amount_cents: 900_000, reason: "x" })) {
      return fail("the policy allowed a $9,000 refund");
    }
    if (await ask("issue_refund", { order_id: order.id, amount_cents: 4_000, reason: "x" })) {
      return fail("the policy allowed a $40 refund on a $9.00 order. Check refunds against the order total");
    }
    if (!(await ask("issue_refund", { order_id: order.id, amount_cents: 300, reason: "x" }))) {
      return fail("the policy refused a $3 refund on a $9.00 order. Ordinary refunds should go through");
    }
    // A different order, so a policy that only knows the heist's numbers fails.
    const bigger = shop.placeOrder("check", "vanilla", 3); // $13.50
    if (await ask("issue_refund", { order_id: bigger.id, amount_cents: 1_400, reason: "x" })) {
      return fail(
        "the policy allowed a $14 refund on a $13.50 order. Check each refund against that order's total " +
          "(shop.orders), not against fixed amounts",
      );
    }
    if (!(await ask("issue_refund", { order_id: bigger.id, amount_cents: 1_000, reason: "x" }))) {
      return fail("the policy refused a $10 refund on a $13.50 order. Ordinary refunds should go through");
    }
    const large = shop.placeOrder("check", "vanilla", 12); // $54.00
    if (!(await ask("issue_refund", { order_id: large.id, amount_cents: 5_000, reason: "x" }))) {
      return fail("the policy refused a refund of exactly $50. The limit is over $50, so exactly $50 should go through");
    }
    const full = shop.placeOrder("check", "vanilla", 2); // $9.00, nothing refunded yet
    if (!(await ask("issue_refund", { order_id: full.id, amount_cents: full.totalCents, reason: "x" }))) {
      return fail("the policy refused a full refund of exactly the order total. Refunding all of it is fine; more than all of it isn't");
    }
    // Two refunds that are each fine on their own, but not together.
    const twice = shop.placeOrder("check", "vanilla", 2); // $9.00
    if (!(await ask("issue_refund", { order_id: twice.id, amount_cents: 500, reason: "x" }))) {
      return fail("the policy refused a $5 refund on a $9.00 order with nothing refunded yet. Ordinary refunds should go through");
    }
    shop.issueRefund(twice.id, 500, "x");
    if (await ask("issue_refund", { order_id: twice.id, amount_cents: 500, reason: "x" })) {
      return fail(
        "the policy allowed a second $5 refund on a $9.00 order that already had $5 back, so $10 in all. " +
          "Add up the earlier refunds in shop.refunds for that order, and refuse when the new one would take the total past totalCents",
      );
    }
    for (const amount of [-500, 0, 12.5]) {
      if (await ask("issue_refund", { order_id: bigger.id, amount_cents: amount, reason: "x" })) {
        return fail(`the policy allowed a refund of ${amount} cents. Refuse anything that isn't a positive whole number`);
      }
    }
    if (!(await ask("list_flavors", {}))) {
      return fail("the policy refused list_flavors. Tools it has no rule for should be allowed (for now)");
    }
  } catch (err: unknown) {
    return notWrittenYet(err, "src/policy.ts") ?? fail(`src/policy.ts threw: ${describe(err)}`);
  }

  let heist: HeistResult;
  try {
    heist = await runHeist(serverSpawn(), ATTACK);
  } catch (err: unknown) {
    return fail(`src/server.ts didn't survive the heist: ${describe(err)}`);
  }
  const [first, ...rest] = heist.results;
  if (first?.blocked) {
    return fail(`the heist's legitimate order was blocked: ${first.detail}`);
  }
  const through = rest.filter((r) => !r.blocked);
  if (through.length > 0) {
    return fail(
      "these went through:\n" +
        through.map((r) => `${r.step.label}. Should be stopped by the ${r.step.stoppedBy}`).join("\n"),
    );
  }
  const layers = whoBlocked();
  if (layers) return layers;
  return pass(
    `refunds are checked against each order; deny-list and approval did their jobs; ` +
      `heist ${heist.wentThrough} of ${heist.results.length} went through`,
  );
}

interface ReceiptShape {
  credentialSubject?: {
    action?: { type?: string; tool_name?: string };
    outcome?: { status?: string; error?: string };
  };
}

/** The SMS blast should be stopped by the deny-list and the free scoop by
 *  approval, not by the policy doing their jobs. The receipt chain from the
 *  heist says which layer refused each one. */
function whoBlocked(): CheckResult | null {
  const log = at("var/receipts.jsonl");
  if (!existsSync(log)) return fail("no var/receipts.jsonl after the heist, so I can't see which layer blocked what");
  const receipts = readFileSync(log, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ReceiptShape);
  const refusal = (tool: string) =>
    receipts.find(
      (r) => r.credentialSubject?.action?.tool_name === tool && r.credentialSubject.outcome?.status === "failure",
    )?.credentialSubject?.outcome?.error;

  const expectations = [
    { tool: "blast_promo_sms", layer: "the deny-list", pattern: /deny list/, fix: 'add deniedTools: ["blast_promo_sms"] to the guard' },
    { tool: "comp_free_scoop", layer: "approval", pattern: /approval/i, fix: 'add sensitiveTools: ["comp_free_scoop"] and an approvalCallback' },
  ];
  for (const e of expectations) {
    const reason = refusal(e.tool);
    if (reason === undefined) {
      return fail(`the receipt refusing ${e.tool} has no error reason. Put entry.reason in outcome.error (step 3)`);
    }
    if (!e.pattern.test(reason)) {
      return fail(`${e.tool} was blocked, but not by ${e.layer} (the reason was "${reason}"). To fix, ${e.fix}`);
    }
  }
  return null;
}
