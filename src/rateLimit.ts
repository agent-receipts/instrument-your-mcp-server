// Step 1 — rate limiting.
//
// The guard ships with InMemoryRateLimitStore, which counts and never forgets.
// That's fine for a unit test and wrong for a server: once a caller hits the
// budget they're locked out for the lifetime of the process. A budget without
// a window isn't a rate limit, it's a quota.
//
// This is a fixed-window counter: N calls per window per caller, and the count
// resets when the window rolls over. It's the simplest thing that's actually a
// rate limit, and it has a known flaw worth saying out loud — a caller can
// spend a full budget at the end of one window and another at the start of the
// next, so the true burst ceiling is 2N. Sliding-window or token-bucket fixes
// that. For "stop a brute force", fixed-window is enough, and being able to
// say why you chose it beats reaching for the fanciest option.
//
// In-memory also means per-process. Two instances behind a load balancer means
// two independent budgets, which is how brute forces get through servers that
// technically have rate limiting. Shared state (Redis, or a rate limiter at
// the edge) is the fix — and this is exactly the seam for it, because
// RateLimitStore is an interface.

import type { RateLimitStore } from "../src/toolGuard.js";

interface Window {
  count: number;
  startedAt: number;
}

export class FixedWindowRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly windowMs: number,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  private current(agentId: string): Window {
    const now = this.clock();
    const existing = this.windows.get(agentId);
    if (!existing || now - existing.startedAt >= this.windowMs) {
      const fresh: Window = { count: 0, startedAt: now };
      this.windows.set(agentId, fresh);
      return fresh;
    }
    return existing;
  }

  getCount(agentId: string): number {
    return this.current(agentId).count;
  }

  increment(agentId: string): void {
    this.current(agentId).count += 1;
  }

  reset(agentId: string): void {
    this.windows.delete(agentId);
  }
}
