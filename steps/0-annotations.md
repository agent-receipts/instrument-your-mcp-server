# Step 0: Say what your tools do (warm-up)

## The gap

Run `npm run client`. It shows what a careful MCP client would let run without asking. Right now that's nothing: the truck's tools say nothing about themselves, so a client can't tell `list_flavors` from `issue_refund` and has to ask about every call. Ask about everything for long enough and people click "always allow", which is worse.

## What to build

In `src/tools.ts`, give each tool in `TOOLS` an `annotations` object. These are MCP's hints about what a tool does:

- `readOnlyHint: true` for tools that only read.
- `destructiveHint: true` for tools that can destroy or give away something that can't be taken back (money, stock, messages to customers). `destructiveHint: false` for tools that change data but nothing worse.
- `openWorldHint: true` for tools that reach outside the system, `false` for those that don't.

Decide for each of the seven tools from what it does, not its name. The `ToolDefinition` type already has the field.

## Done when

`npm run check 0` prints `PASS  step 0`. It checks each tool's hints against what the tool does, then that they reach a client.

To see it yourself: `npm run client` again. Four of the seven should now run without asking: the two that only read, and `place_order` and `apply_discount_code`, which change data but nothing worse. The refund, the free scoop and the SMS blast still ask.

## Before you move on

These hints are your server's own claims. What would a client do if a server marked `issue_refund` as `readOnlyHint: true`? Who could stop that?

- Mark `issue_refund` as read-only and run `npm run client`. Then put it back.
- `blast_promo_sms` could be argued either way on `destructiveHint`: a sent text can't be unsent, but nothing on the truck is destroyed. What did you pick, and what does that choice tell a client?
