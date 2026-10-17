// A policy that allows everything.
//
// ToolGuard needs a PolicyRuntime from the start, but the real one is step 4.
// Until then this stands in, so steps 1 to 3 can build a guard without
// writing a policy first. Replacing it is part of step 4.

import type { PolicyRuntime } from "./toolGuard.js";

export const allowAll: PolicyRuntime = {
  evaluatePreToolCall: () => ({ allowed: true, reason: "no policy yet (that's step 4)" }),
};
