// Step 1 — write this. The brief is steps/1-rate-limit.md.
//
// A fixed-window rate limit: each caller gets a budget of calls per window,
// and their count goes back to zero when their window ends. ToolGuard does
// the comparison against the budget; this only has to count.

import type { RateLimitStore } from "./toolGuard.js";

export class FixedWindowRateLimitStore implements RateLimitStore {
  constructor(
    private readonly windowMs: number,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  getCount(agentId: string): number {
    throw new Error("not implemented: FixedWindowRateLimitStore.getCount (step 1)");
  }

  increment(agentId: string): void {
    throw new Error("not implemented: FixedWindowRateLimitStore.increment (step 1)");
  }

  reset(agentId: string): void {
    throw new Error("not implemented: FixedWindowRateLimitStore.reset (step 1)");
  }
}
