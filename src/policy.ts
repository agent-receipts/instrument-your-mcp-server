// Step 4 — write this. The brief is steps/4-policy.md.

import type { PolicyRuntime } from "./toolGuard.js";
import type { Shop } from "./shop.js";

/** The truck's policy: decides, from the arguments, whether a call may run. */
export function createShopPolicy(shop: Shop): PolicyRuntime {
  throw new Error("not implemented: createShopPolicy (step 4)");
}
