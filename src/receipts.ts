// Step 3 — write ReceiptAuditSink. The brief is steps/3-receipts.md.
// publicKeyPathFor and readChain below are provided: npm run verify uses the
// same convention, so keep to it.

import type { AgentReceipt } from "@obsigna/sdk-ts/receipt";

import type { AuditEntry, AuditSink } from "./toolGuard.js";

/** An AuditSink that writes each entry as a signed, hash-linked receipt. */
export class ReceiptAuditSink implements AuditSink {
  readonly did: string = "";

  constructor(private readonly path: string) {
    throw new Error("not implemented: ReceiptAuditSink (step 3)");
  }

  record(entry: AuditEntry): void {
    throw new Error("not implemented: ReceiptAuditSink.record (step 3)");
  }
}

/** Where the public key for a given receipt log goes. */
export function publicKeyPathFor(receiptLogPath: string): string {
  return receiptLogPath.replace(/\.jsonl$/, "") + ".pubkey.pem";
}

/** Read a receipt chain back off disk. */
export function readChain(lines: string[]): AgentReceipt[] {
  return lines
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as AgentReceipt);
}
