# Step 4: Policy

Behind? `npm run catchup 3` puts `src/` at the end of step 3. Anything it replaces is saved in `var/catchup-backup/`.

## The gap

`npm run heist` still gets 5 of 5 through: a $9,000 refund on a $9.00 order, a smaller refund that is still more than the order, a free scoop with nobody watching, and a text to 12,403 phones.

## Why it matters

The model chooses the arguments, so treat them like any other untrusted input. Without limits in the server, an agent that is confused, manipulated or simply wrong can refund any amount or text every customer. Policy is where the business rules live: how much can move without a person, what needs someone's approval, and what is off the table entirely.

## What to build

1. In `src/policy.ts`, write `createShopPolicy(shop)`. It returns a `PolicyRuntime`: an object with one method, `evaluatePreToolCall({ toolName, args })`, that returns `{ allowed, reason }`.
   - For `issue_refund`, refuse when:
     - `amount_cents` isn't a positive whole number
     - it's over $50 (5,000 cents)
     - it would take the order's total refunds past what the order cost. The order is `shop.orders.get(order_id)`, its cost is `totalCents`, and earlier refunds are in `shop.refunds`.
   - Allow everything else, for now.
2. In `src/server.ts`, change the guard's options. The policy uses the same `shop` as the tools:

   ```ts
   runtime: createShopPolicy(shop), // replaces allowAll
   deniedTools: ["blast_promo_sms"],
   sensitiveTools: ["comp_free_scoop"],
   approvalCallback: async (agentId, toolName, params): Promise<"approved" | "denied"> => {
     console.error(`[approval] ${agentId} wants ${toolName}: ${JSON.stringify(params)}`);
     return "denied";
   },
   ```

## Done when

`npm run check 4` prints `PASS  step 4`. It tests your policy on orders of different sizes, runs the heist, and reads the receipt chain to see that the deny-list and approval did their own blocking. If a heist request still gets through, it tells you which one and what should have stopped it.

To see it yourself: `npm run heist`. One of five should go through: the legitimate order.

## Watch out for

An approval callback that always says `"approved"` is worse than none. The call goes through exactly as before, and your records now show a human decision that never happened. Make "denied" the default.

## Before you move on

What does each of the policy, the deny-list and approval protect against, and what does none of them cover?

- Make `evaluatePreToolCall` throw an error, and run the heist. Does the guard let calls through or stop them?
- Your policy allows any tool it has no rule for. See what that means for a tool someone adds next sprint:
  1. In `src/tools.ts`, add a tool called `export_customers` to `TOOLS` (copy `list_flavors`'s entry, but set `readOnlyHint: false` and `destructiveHint: true`: it sends customer data out, and `npm run check` rejects any other tool that claims to be read-only), and a `case "export_customers":` in `dispatch` that returns `"Exported 12,403 customers"`.
  2. In `examples/attacks.ts`, add a sixth entry to `HEIST_STEPS` that calls it, with `stoppedBy: "nothing yet"`.
  3. Run `npm run heist`. Nobody decided this tool should be open to every agent, and it is.
  4. What would you change so a new tool is closed until someone opens it? Then undo the experiment by deleting the tool, its `case` and the heist entry you added. Don't use `git checkout src/tools.ts`: that file also holds your step 0 annotations, and checking it out throws them away.
