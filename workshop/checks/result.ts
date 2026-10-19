// What a check reports, and the helpers every step's check shares.

import type { RunOptions } from "../../examples/attacks.js";
import { ROOT } from "../lib/paths.js";

export interface CheckResult {
  ok: boolean;
  detail: string;
  /** The step couldn't be checked on this machine (a tool isn't installed).
   *  Not a failure: later steps still run. */
  skipped?: boolean;
}

export const pass = (detail: string): CheckResult => ({ ok: true, detail });
export const fail = (detail: string): CheckResult => ({ ok: false, detail });
export const skip = (detail: string): CheckResult => ({ ok: true, skipped: true, detail });

export const UNDEFINED_FIELD =
  "signing failed on an optional field set to undefined. Receipts are canonicalised " +
  "(RFC 8785) before signing, and undefined isn't JSON, so an optional field has to be " +
  "left out, not set to undefined. Look at parameters_hash and correlationId";

export const OVERBROAD_SCANNER =
  "your response scanner (step 5) stopped an ordinary answer, so the attack couldn't run. " +
  "It should only catch text that instructs the model";

/** The error's message, plus an explanation when it's a mistake we recognise.
 *  A server-side signing error reaches the checks as a tool-call failure, so
 *  it can surface in any step's attack run, not only step 3's. A response
 *  scanner that flags too much does the same. */
export function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  // The explanation goes straight after the error's first line, before any
  // server stderr attached to it, where it's hard to miss.
  const explain = (hint: string) => {
    const [first, ...rest] = message.split("\n");
    return [first, hint, ...rest].join("\n");
  };
  if (/RFC 8785/.test(message) && /undefined/.test(message)) return explain(UNDEFINED_FIELD);
  if (/Response blocked|sanitization incomplete/.test(message)) return explain(OVERBROAD_SCANNER);
  return message;
}

/** A stub that hasn't been replaced yet, reported as such rather than as a crash. */
export function notWrittenYet(err: unknown, file: string): CheckResult | null {
  const message = describe(err);
  return message.startsWith("not implemented")
    ? fail(`${file} isn't written yet (${message})`)
    : null;
}

/** How the checks run an attack: in the project folder, quietly, and never forever. */
export const ATTACK: RunOptions = { cwd: ROOT, quiet: true, timeoutMs: 60_000 };
