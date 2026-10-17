// Step 1: the store resets per window, and the hammer gets stopped.

import { runHammer, type HammerResult } from "../../examples/attacks.js";
import type { RateLimitStore } from "../../src/toolGuard.js";
import { importFrom, serverSpawn } from "../lib/paths.js";
import { ATTACK, describe, fail, notWrittenYet, pass, type CheckResult } from "./result.js";

type Module = {
  FixedWindowRateLimitStore: new (windowMs: number, clock?: () => number) => RateLimitStore;
};

export async function checkStep1(): Promise<CheckResult> {
  try {
    const { FixedWindowRateLimitStore } = await importFrom<Module>("src/rateLimit.ts");
    let now = 1_000_000;
    const store = new FixedWindowRateLimitStore(60_000, () => now);
    store.increment("a");
    store.increment("a");
    store.increment("a");
    if (store.getCount("a") !== 3) {
      return fail(`after 3 calls, getCount("a") is ${store.getCount("a")}. Expected 3`);
    }
    if (store.getCount("b") !== 0) {
      return fail(`callers share one count: "b" has ${store.getCount("b")} without calling`);
    }
    now += 59_999;
    if (store.getCount("a") !== 3) return fail("the count reset before the window ended");
    now += 1;
    if (store.getCount("a") !== 0) {
      return fail("the count didn't reset when the window ended, so this is a quota, not a rate limit");
    }
    store.increment("a");
    store.increment("a");
    if (store.getCount("a") !== 2) {
      return fail(
        `the store stopped counting after the first window ("a" has ${store.getCount("a")} after 2 calls). ` +
          "The limit would switch itself off after a minute. Each new window should count from 0 again",
      );
    }
    now += 60_000;
    if (store.getCount("a") !== 0) return fail("the count didn't reset at the end of the second window");
  } catch (err: unknown) {
    return notWrittenYet(err, "src/rateLimit.ts") ?? fail(`src/rateLimit.ts threw: ${describe(err)}`);
  }

  let hammer: HammerResult;
  try {
    hammer = await runHammer(serverSpawn(), ATTACK);
  } catch (err: unknown) {
    return fail(`src/server.ts didn't survive the hammer: ${describe(err)}`);
  }
  if (hammer.outcome !== "stopped") {
    return fail(
      `the hammer ${hammer.outcome === "cracked" ? "cracked the code" : "gave up"} after ` +
        `${hammer.guesses} guesses. Is the guard called in the handler in src/server.ts? ` +
        "If you did step 1's extra, put callerId() back to reading the caller from extra.authInfo",
    );
  }
  if (hammer.guesses > 100) {
    return fail(`stopped, but only after ${hammer.guesses} guesses. The brief asks for 30 calls a minute`);
  }
  return pass(`store resets each window; hammer stopped after ${hammer.guesses} guesses`);
}
