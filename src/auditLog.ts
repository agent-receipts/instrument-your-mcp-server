// Step 2 — write this. The brief is steps/2-audit-trail.md.

import type { AuditEntry, AuditSink } from "./toolGuard.js";

/** Appends one JSON object per line to a file. */
export class JsonlAuditSink implements AuditSink {
  constructor(private readonly path: string) {
    throw new Error("not implemented: JsonlAuditSink (step 2)");
  }

  record(entry: AuditEntry): void {
    throw new Error("not implemented: JsonlAuditSink.record (step 2)");
  }
}

/** Returns a copy of params with secrets replaced, for writing down. */
export function redactShopParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  throw new Error("not implemented: redactShopParams (step 2)");
}
