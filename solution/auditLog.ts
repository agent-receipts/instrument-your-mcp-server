// Step 2 — the audit trail.
//
// An AuditSink that appends one JSON object per line to a file. That's it.
// It is worth building this before receipts, because it makes the gap between
// "logged" and "attested" concrete: everything here is true, and none of it
// is provable. The file is a plain text file. The server can rewrite it. So
// can anyone with the box. An auditor reading it is taking your word.
//
// That's not a reason to skip it — most of the value of an audit trail is
// operational, not forensic, and you cannot sign what you never recorded.
// It's a reason to know which one you have.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { AuditEntry, AuditSink } from "../src/toolGuard.js";

export class JsonlAuditSink implements AuditSink {
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  record(entry: AuditEntry): void {
    // Synchronous on purpose. AuditSink.record returns void, so an async
    // write here would let the tool call proceed while the record is still
    // in flight — and a crash in between loses exactly the entry you most
    // wanted. For real throughput you'd batch behind a queue with an fsync
    // policy you've actually chosen; appendFileSync is the honest small
    // version, not the fast one.
    appendFileSync(this.path, JSON.stringify(entry) + "\n", "utf8");
  }
}

/** Strips things that shouldn't be written down, before they're persisted.
 *
 *  The guard applies this at the point of writing an audit entry, not at the
 *  point of deciding — policy evaluation always sees raw arguments. That
 *  ordering matters: redact before you decide and your policy is reasoning
 *  about data that isn't what the tool will actually receive.
 *
 *  Note `code` is redacted here. A discount code is a shared secret, and an
 *  audit log full of guessed codes is a list of guesses at a live credential.
 *  The guess COUNT is what the rate-limit exercise needs; the guesses
 *  themselves aren't. */
export function redactShopParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const key of ["code", "phone", "email", "card_number"]) {
    if (key in out) out[key] = "[redacted]";
  }
  return out;
}
