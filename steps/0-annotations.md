# Step 0: Say what your tools do (warm-up)

## The gap

Run `npm run client`. It shows what a careful MCP client would let run without asking. Right now that's nothing: the truck's tools say nothing about themselves, so a client can't tell `list_flavors` from `issue_refund` and has to ask about every call. Ask about everything for long enough and people click "always allow", which is worse.

## Why it matters

A client decides what it lets an agent run without asking from what your tools say about themselves. Say nothing, and a careful client asks about every call until people learn to click "always allow". Say it well, and the harmless calls run while the risky ones, the refunds and the messages to customers, still get a person's attention. In a real business those are the tools that move money or send documents out.

## What to build

In `src/tools.ts`, give each tool in `TOOLS` an `annotations` object. These are MCP's hints about what a tool does:

- `readOnlyHint: true` for tools that only read.
- `destructiveHint: true` for tools that can destroy or give away something that can't be taken back (money, stock, messages to customers). `destructiveHint: false` for tools that change data but nothing worse.
- `openWorldHint: true` for tools whose effects reach people or systems outside the truck: customers' phones, a payment provider, the web. `false` for tools that only change the truck's own records.

Decide for each of the seven tools from what it does, not its name. The `ToolDefinition` type already has the field.

MCP also has `idempotentHint` (calling it twice does no more than once). It's optional here: the check doesn't look at it, and the client in this step ignores it.

## Done when

`npm run check 0` prints `PASS  step 0`. It checks each tool's hints against what the tool does, then that they reach a client.

The check only fails choices that are clearly wrong. Some hints are judgement calls, and it accepts either answer: note what you picked for the debrief.

To see it yourself: `npm run client` again. Four of the seven should now run without asking: the two that only read, and `place_order` and `apply_discount_code`, which change data but nothing worse. The refund, the free scoop and the SMS blast still ask.

## Before you move on

These hints are your server's own claims. What would a client do if a server marked `issue_refund` as `readOnlyHint: true`? Who could stop that?

- Mark `issue_refund` as read-only and run `npm run client`. Then put it back.
- `blast_promo_sms` might look arguable on `destructiveHint`: nothing on the truck is destroyed. The check still insists on `true`. Mark it `false` and run `npm run client`: what would a careful client now do with a text to 12,403 phones? Then put it back.
- `issue_refund` only writes to the truck's records here. In a real shop it would go through a payment provider to a customer's card. Does that make it open-world?
