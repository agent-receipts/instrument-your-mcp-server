# Step 1: Rate limiting

Behind? `npm run catchup 0` puts `src/` at the end of step 0. Anything it replaces is saved in `var/catchup-backup/`.

## The gap

`npm run hammer` guessed the truck's four-digit discount code in about 4,800 tries, in a couple of seconds. Nothing slowed it down. The only trace is `var/server.log`, which now holds every code it tried, in plain text.

## What to build

1. In `src/rateLimit.ts`, write `FixedWindowRateLimitStore`. It implements `RateLimitStore` from `src/toolGuard.ts`:
   - `constructor(windowMs: number, clock = () => Date.now())`
   - `getCount(agentId)`, `increment(agentId)` and `reset(agentId)`
   - Each caller has their own count. When a caller's window of `windowMs` ends, their count goes back to 0.
   - Use `clock()` for the time, not `Date.now()` directly, so it can be tested.
2. In `src/server.ts`, create one guard, outside the handler and below `const shop = new Shop()` (step 4's policy needs `shop`):

   ```ts
   import { ToolGuard } from "./toolGuard.js";
   import { allowAll } from "./allowAll.js";
   import { FixedWindowRateLimitStore } from "./rateLimit.js";

   const guard = new ToolGuard({
     runtime: allowAll, // the real policy is step 4
     rateLimit: 30,
     rateLimitStore: new FixedWindowRateLimitStore(60_000),
     responseScanner: null,
   });
   ```

3. In the `CallToolRequestSchema` handler, before `dispatch`, call `await guard.guardToolCall(agentId, name, args)`. If the decision's `allowed` is false, return its `reason` with `isError: true` and don't dispatch.

## Done when

`npm run check 1` prints `PASS  step 1`. It tests your store on a fake clock, then runs the hammer against your server. If your code has type errors, the check mentions them under a `note` line but doesn't fail the step.

To see it yourself: `npm run hammer`. It should stop after 30 guesses.

## Before you move on

Your limit is 30 a minute. How many guesses could the hammer get through in two seconds if it timed them well? And what happens to the count if the server restarts, or runs as two copies?

`callerId()` in `src/server.ts` reads the caller from the OAuth token, so every client that registers is a caller of its own. Change it to return a random id each time, and run the hammer again. What happened to the limit? And if it returned one constant for everyone, what would two clients do to each other? Then put `callerId()` back as it was: the later checks run the hammer again.
