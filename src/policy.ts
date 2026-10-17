// Step 4 — the pluggable policy check.
//
// This is deliberately NOT a policy language. `PolicyRuntime` is a one-method
// interface; satisfying it takes a function. Cedar and OPA are real, and if
// you ever need non-engineers authoring rules across multiple teams you'll
// want one of them — but "cap refunds, deny the SMS blast" does not need a
// policy language, and reaching for one here would teach the wrong lesson.
//
// What this check does that the guard's own deny-list CAN'T: look at the
// *arguments*. A deny-list is per tool name — it can stop blast_promo_sms
// entirely, but it can't tell a $9 refund from a $9,000 one. That difference
// is the whole reason there's a pluggable check at all.

import type { PolicyResult, PolicyRuntime } from "../src/toolGuard.js";
import type { Shop } from "../src/shop.js";

/** Nobody on the truck refunds more than this without a human. $50. */
const MAX_UNATTENDED_REFUND_CENTS = 5_000;

export function createShopPolicy(shop: Shop): PolicyRuntime {
  return {
    evaluatePreToolCall({ toolName, args }): PolicyResult {
      switch (toolName) {
        case "issue_refund": {
          const amount = args["amount_cents"];
          const orderId = args["order_id"];

          if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) {
            return { allowed: false, reason: "Refund amount must be a positive whole number of cents" };
          }
          if (amount > MAX_UNATTENDED_REFUND_CENTS) {
            return {
              allowed: false,
              reason: `Refund of $${(amount / 100).toFixed(2)} exceeds the $${(MAX_UNATTENDED_REFUND_CENTS / 100).toFixed(2)} unattended limit`,
            };
          }

          // Refunding more than the order was worth, or refunding it twice,
          // is the thing the uninstrumented shop happily allows. The check
          // belongs here rather than in shop.ts on purpose: policy is the
          // layer that gets to say "technically possible, not permitted."
          if (typeof orderId === "string") {
            const order = shop.orders.get(orderId);
            if (!order) {
              return { allowed: false, reason: `No such order: ${orderId}` };
            }
            const alreadyRefunded = shop.refunds
              .filter((r) => r.orderId === orderId)
              .reduce((sum, r) => sum + r.amountCents, 0);
            if (alreadyRefunded + amount > order.totalCents) {
              return {
                allowed: false,
                reason: `Order ${orderId} was $${(order.totalCents / 100).toFixed(2)} and $${(alreadyRefunded / 100).toFixed(2)} is already refunded — this would over-refund it`,
              };
            }
          }
          return { allowed: true, reason: "Refund within unattended limit" };
        }

        case "place_order": {
          const scoops = args["scoops"];
          if (typeof scoops === "number" && scoops > 20) {
            return { allowed: false, reason: `${scoops} scoops in one order looks like a mistake` };
          }
          return { allowed: true };
        }

        default:
          // Default-allow for the read-only and ordinary-write tools.
          //
          // Worth saying out loud in the workshop: default-allow is a real
          // choice with a real cost. It means a tool added next sprint is
          // reachable by every agent the moment it ships, with nobody having
          // decided that. Default-DENY with an explicit allow-list is the
          // safer shape, and it's the first thing to change if this server
          // grows past a handful of tools. It's default-allow here so the
          // deny paths are the ones you can see.
          return { allowed: true };
      }
    },
  };
}
