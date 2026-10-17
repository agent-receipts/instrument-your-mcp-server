// Tool definitions and dispatch for the ice cream truck, with each tool's
// MCP annotations filled in (step 0).
//
// Separated from server.ts on purpose: server.ts is the file the workshop
// edits (it holds the one handler where instrumentation goes), so the tool
// list stays out of the way. Nothing in here knows about ToolGuard.

import { Shop, ShopError } from "../src/shop.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** MCP tool annotations: hints for the client (a harness can ask before a
   *  destructive call, or run read-only ones without asking). They're not
   *  enforced and the model usually doesn't see them; the server's own
   *  checks are what actually decide. */
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const CHANGES_STATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

export const TOOLS: ToolDefinition[] = [
  {
    name: "list_flavors",
    annotations: READ_ONLY,
    description:
      "List every flavor on the truck with its description, price per scoop and how many scoops are left.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "check_inventory",
    annotations: READ_ONLY,
    description: "Check how many scoops of one flavor are left.",
    inputSchema: {
      type: "object",
      properties: {
        flavor: { type: "string", description: "Flavor name, e.g. 'hokey-pokey'." },
      },
      required: ["flavor"],
    },
  },
  {
    name: "place_order",
    annotations: CHANGES_STATE,
    description: "Place an order for one or more scoops of a single flavor.",
    inputSchema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Who the order is for." },
        flavor: { type: "string", description: "Flavor name." },
        scoops: { type: "integer", minimum: 1, description: "How many scoops." },
      },
      required: ["customer", "flavor", "scoops"],
    },
  },
  {
    name: "apply_discount_code",
    annotations: CHANGES_STATE,
    description:
      "Apply a promotional discount code to an existing order. Codes look like SCOOP-1234.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order to discount, e.g. 'order-0001'." },
        code: { type: "string", description: "The discount code to try." },
      },
      required: ["order_id", "code"],
    },
  },
  {
    name: "issue_refund",
    annotations: DESTRUCTIVE,
    description: "Refund money against an existing order.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order to refund against." },
        amount_cents: { type: "integer", minimum: 1, description: "Refund amount in cents." },
        reason: { type: "string", description: "Why the refund is being issued." },
      },
      required: ["order_id", "amount_cents", "reason"],
    },
  },
  {
    name: "comp_free_scoop",
    annotations: DESTRUCTIVE,
    description:
      "Give a customer a free scoop on the house, e.g. to make up for a bad experience.",
    inputSchema: {
      type: "object",
      properties: {
        customer: { type: "string", description: "Who gets the free scoop." },
        flavor: { type: "string", description: "Flavor name." },
        reason: { type: "string", description: "Why it's being comped." },
      },
      required: ["customer", "flavor", "reason"],
    },
  },
  {
    name: "blast_promo_sms",
    annotations: { ...DESTRUCTIVE, openWorldHint: true },
    description:
      "Text a promotional message to the marketing list. Sends immediately and cannot be recalled.",
    inputSchema: {
      type: "object",
      properties: {
        segment: {
          type: "string",
          enum: ["all", "regulars"],
          description: "Which slice of the marketing list to text.",
        },
        message: { type: "string", description: "The SMS body." },
      },
      required: ["segment", "message"],
    },
  },
];

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new ShopError(`'${key}' is required and must be a non-empty string`);
  }
  return v;
}

function int(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new ShopError(`'${key}' is required and must be a whole number`);
  }
  return v;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Runs a tool and returns the text the model sees. Throws ShopError for
 *  ordinary bad requests; server.ts turns those into MCP tool errors. */
export function dispatch(
  shop: Shop,
  name: string,
  args: Record<string, unknown>,
): string {
  switch (name) {
    case "list_flavors": {
      const lines = shop.listFlavors().map((f) => {
        const stock = f.scoopsLeft === 0 ? "SOLD OUT" : `${f.scoopsLeft} scoops left`;
        return `- ${f.name}: ${dollars(f.pricePerScoopCents)}/scoop (${stock})\n  ${f.description}`;
      });
      return `Today on the truck:\n${lines.join("\n")}`;
    }

    case "check_inventory": {
      const f = shop.checkInventory(str(args, "flavor"));
      return `${f.name}: ${f.scoopsLeft} scoop(s) left at ${dollars(f.pricePerScoopCents)} each.`;
    }

    case "place_order": {
      const order = shop.placeOrder(
        str(args, "customer"),
        str(args, "flavor"),
        int(args, "scoops"),
      );
      return `Order ${order.id} placed: ${order.scoops} scoop(s) of ${order.flavor} for ${order.customer}. Total ${dollars(order.totalCents)}.`;
    }

    case "apply_discount_code": {
      const { order, applied, discountCents } = shop.applyDiscountCode(
        str(args, "order_id"),
        str(args, "code"),
      );
      return applied
        ? `Code accepted. ${dollars(discountCents)} off — ${order.id} is now ${dollars(order.totalCents)}.`
        : `That code isn't valid. ${order.id} is still ${dollars(order.totalCents)}.`;
    }

    case "issue_refund": {
      const refund = shop.issueRefund(
        str(args, "order_id"),
        int(args, "amount_cents"),
        str(args, "reason"),
      );
      return `Refund ${refund.id} issued: ${dollars(refund.amountCents)} against ${refund.orderId} (${refund.reason}).`;
    }

    case "comp_free_scoop": {
      const comp = shop.compFreeScoop(
        str(args, "customer"),
        str(args, "flavor"),
        str(args, "reason"),
      );
      return `Comped ${comp.id}: a free scoop of ${comp.flavor} for ${comp.customer} (${comp.reason}).`;
    }

    case "blast_promo_sms": {
      const blast = shop.blastPromoSms(str(args, "segment"), str(args, "message"));
      return `Sent ${blast.id} to ${blast.recipients} phone(s) in segment '${blast.segment}'.`;
    }

    default:
      throw new ShopError(`Unknown tool: ${name}`);
  }
}
