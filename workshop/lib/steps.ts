// The steps of the workshop, in order, and where each one's files live. Step 0
// is a warm-up; steps 1 to 5 build on it. Steps 6 and 7 are guided steps
// that come after step 5 and don't change src/, so they have no module and
// nothing to catch up to.

export interface StepInfo {
  n: number;
  title: string;
  /** The module the attendee writes, in src/ (stub) and solution/ (finished).
   *  Steps 6 and 7 have none: they run tools against the truck from step 5. */
  module?: string;
  brief: string;
}

export const STEPS: StepInfo[] = [
  { n: 0, title: "tool annotations", module: "tools.ts", brief: "steps/0-annotations.md" },
  { n: 1, title: "rate limit", module: "rateLimit.ts", brief: "steps/1-rate-limit.md" },
  { n: 2, title: "audit trail", module: "auditLog.ts", brief: "steps/2-audit-trail.md" },
  { n: 3, title: "signed receipts", module: "receipts.ts", brief: "steps/3-receipts.md" },
  { n: 4, title: "policy", module: "policy.ts", brief: "steps/4-policy.md" },
  { n: 5, title: "poisoned menu", module: "responseScan.ts", brief: "steps/5-poisoned-menu.md" },
  { n: 6, title: "a proxy in front", brief: "steps/6-pipelock.md" },
  { n: 7, title: "the attacks as tests", brief: "steps/7-promptfoo.md" },
];

/** The steps that change src/, which are the ones catchup can put you at. */
export const CATCHUP_STEPS = STEPS.filter((s) => s.module !== undefined);

const LAST = Math.max(...CATCHUP_STEPS.map((s) => s.n));

/** The server wired for exactly steps 1..n. */
export function snapshotFor(n: number): string {
  return n === LAST ? "solution/server.ts" : `solution/server.step${n}.ts`;
}

export class UsageError extends Error {}

export function parseStep(argv: string[], usage: string, steps: StepInfo[] = STEPS): number {
  const arg = argv.find((a) => !a.startsWith("-"));
  const n = Number(arg);
  if (arg === undefined || arg.trim() === "" || !steps.some((s) => s.n === n)) throw new UsageError(usage);
  return n;
}
