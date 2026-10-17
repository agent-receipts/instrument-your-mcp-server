// The steps of part one, in order, and where each one's files live. Step 0
// is a warm-up; the rest build on it.

export interface StepInfo {
  n: number;
  title: string;
  /** The module the attendee writes, in src/ (stub) and solution/ (finished). */
  module: string;
  brief: string;
}

export const STEPS: StepInfo[] = [
  { n: 0, title: "tool annotations", module: "tools.ts", brief: "steps/0-annotations.md" },
  { n: 1, title: "rate limit", module: "rateLimit.ts", brief: "steps/1-rate-limit.md" },
  { n: 2, title: "audit trail", module: "auditLog.ts", brief: "steps/2-audit-trail.md" },
  { n: 3, title: "signed receipts", module: "receipts.ts", brief: "steps/3-receipts.md" },
  { n: 4, title: "policy", module: "policy.ts", brief: "steps/4-policy.md" },
  { n: 5, title: "poisoned menu", module: "responseScan.ts", brief: "steps/5-poisoned-menu.md" },
];

/** The server wired for exactly steps 1..n. */
export function snapshotFor(n: number): string {
  return n === LAST ? "solution/server.ts" : `solution/server.step${n}.ts`;
}

const LAST = Math.max(...STEPS.map((s) => s.n));

export class UsageError extends Error {}

export function parseStep(argv: string[], usage: string): number {
  const arg = argv.find((a) => !a.startsWith("-"));
  const n = Number(arg);
  if (arg === undefined || arg.trim() === "" || !STEPS.some((s) => s.n === n)) throw new UsageError(usage);
  return n;
}
