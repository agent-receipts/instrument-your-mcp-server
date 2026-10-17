// Step 3 — signed receipts.
//
// Same AuditSink interface as step 2, so swapping it in is a one-line change
// in server.ts. That's the injected-interface design paying off: the guard
// never learns that its audit trail became cryptographic.
//
// What changes underneath is the trust story. A JSONL line says "this
// happened" and you either believe the server or you don't. A receipt is an
// Ed25519 signature over a canonical encoding of the record, hash-linked to
// the receipt before it. Edit one entry and its signature stops verifying.
// Delete one from the middle and the next one's previous_receipt_hash stops
// matching. Both are detectable by someone who was never here.
//
// What it still does NOT give you, and this is the honest part:
//
//   - The server signs. If the server is compromised, it can sign anything
//     it likes going forward. Receipts bound what can be changed AFTER the
//     fact, not what a compromised signer can assert. (Obsigna's own threat
//     model says this about its daemon; it's not a limitation this workshop
//     invented.)
//   - Dropping receipts off the END of the chain is undetectable from the
//     chain alone — nothing in the file says how long it should be. That's
//     what verifyChain's expectedLength / expectedFinalHash options are for,
//     and it's why anchoring exists.
//   - A signed receipt attests the server witnessed a request. It says
//     nothing about whether the agent that sent it was telling the truth
//     about why.
//
// Key custody: this generates a keypair on startup, which is fine for a
// workshop and wrong everywhere else — it mints a fresh identity on every
// cold start, so yesterday's receipts verify against a key nobody has. The
// SDK will refuse GeneratingKeyProvider outright when AGENTRECEIPTS_PRODUCTION
// is set, which is the right instinct. In production the key belongs in KMS:
// it never sits in plaintext in a public-facing process, and every sign call
// lands in CloudTrail as an independent record of when signing happened.

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createPublicKey, randomUUID } from "node:crypto";
import { dirname } from "node:path";

import {
  createReceipt,
  generateKeyPair,
  hashReceipt,
  signReceipt,
  type AgentReceipt,
  type RiskLevel,
} from "@obsigna/sdk-ts/receipt";
import { didFromPublicKey } from "@obsigna/sdk-ts";

import { sha256 } from "@obsigna/sdk-ts/receipt";
import type { AuditEntry, AuditSink } from "../src/toolGuard.js";

/** How much each tool can cost you if it goes wrong. This drives
 *  `action.risk_level`, which is what an auditor filters on when they don't
 *  want to read 40,000 receipts about list_flavors. */
const TOOL_RISK: Record<string, RiskLevel> = {
  list_flavors: "low",
  check_inventory: "low",
  place_order: "medium",
  apply_discount_code: "medium",
  comp_free_scoop: "high",
  issue_refund: "high",
  blast_promo_sms: "critical",
};

/** Extract the raw 32-byte Ed25519 public key from the SDK's PEM output.
 *  A did:key identifier is derived from the key bytes, not the PEM wrapper. */
function rawPublicKey(publicKeyPem: string): Uint8Array {
  const der = createPublicKey(publicKeyPem).export({ format: "der", type: "spki" });
  return new Uint8Array(der.subarray(der.length - 32));
}

export class ReceiptAuditSink implements AuditSink {
  readonly did: string;
  readonly publicKey: string;
  private readonly privateKey: string;
  private readonly verificationMethod: string;
  private readonly chainId = randomUUID();
  /** 1-based: the spec's chain sequence starts at 1, and verifyChain rejects
   *  a first receipt numbered 0. Off-by-one here produces a chain whose
   *  signatures all verify and whose linkage is intact, but which fails
   *  verification at index 0 — worth seeing once. */
  private sequence = 1;
  private previousHash: string | null = null;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    // A new key pair means a new chain, so start a new file. Appending this
    // run's receipts to the last run's would put two chains, signed by two
    // keys, in one file, and verification would fail for someone who did
    // nothing wrong.
    writeFileSync(path, "", "utf8");
    const keyPair = generateKeyPair();
    this.publicKey = keyPair.publicKey;
    this.privateKey = keyPair.privateKey;
    this.did = didFromPublicKey(rawPublicKey(keyPair.publicKey));
    this.verificationMethod = `${this.did}#${this.did.slice("did:key:".length)}`;

    // The verifier needs the public key, so we drop it next to the log.
    //
    // Read that sentence again, because it undoes most of what signing just
    // bought us. Anyone who can rewrite receipts.jsonl can also rewrite
    // receipts.pubkey.pem: generate a fresh keypair, re-sign a chain that
    // says whatever they like, overwrite both files, and verification passes
    // cleanly. A signature only proves anything if the verifier got the key
    // from somewhere the signer's attacker doesn't control — a key registry,
    // a DID resolved independently, a value pinned in the auditor's own
    // config. This file is a convenience for `npm run verify`, not a trust
    // anchor, and swapping it is one of the red-team exercises.
    writeFileSync(publicKeyPathFor(path), keyPair.publicKey, "utf8");
  }

  record(entry: AuditEntry): void {
    const unsigned = createReceipt({
      issuer: { id: this.did, name: "scoop-truck", type: "Service" },
      // The principal is whoever CALLED us — the untrusted side. The issuer
      // is us. Keeping those distinct is the entire point: the receipt is
      // our witness of their request, not their account of it.
      principal: { id: `agent:${entry.agentId}` },
      action: {
        type: entry.direction === "request" ? "tool_call" : "tool_result",
        tool_name: entry.toolName,
        risk_level: TOOL_RISK[entry.toolName] ?? "medium",
        target: { system: "scoop-truck", resource: entry.toolName },
        // Commit to the arguments without storing them. The hash proves
        // later what was asked; it doesn't put a customer's details in a
        // file that outlives the order. Note these params are already
        // redacted — the guard redacts before it calls the sink, so the
        // commitment is to the redacted form. Hash what you kept, not what
        // you threw away, or verification can never reproduce it.
        // Spread rather than `parameters_hash: undefined`. Receipts are
        // canonicalised per RFC 8785 before signing, and the canonicaliser
        // rejects an explicit undefined value outright — an optional field
        // has to be ABSENT, not present-and-undefined. Easy to trip over,
        // and it fails at sign time rather than compile time.
        ...(entry.parameters
          ? { parameters_hash: sha256(JSON.stringify(entry.parameters)) }
          : {}),
      },
      outcome: {
        status: entry.allowed ? ("success" as const) : ("failure" as const),
        ...(entry.allowed ? {} : { error: entry.reason }),
      },
      chain: {
        sequence: this.sequence,
        previous_receipt_hash: this.previousHash,
        chain_id: this.chainId,
      },
      actionTimestamp: new Date(entry.timestamp).toISOString(),
      // Links this receipt to the upstream mediator's record of the same
      // call. The SDK takes it as an opaque token and commits to it in the
      // signature, so the join survives independently of either log.
      ...(entry.correlationId ? { correlationId: entry.correlationId } : {}),
    });

    const receipt = signReceipt(unsigned, this.privateKey, this.verificationMethod);

    this.previousHash = hashReceipt(receipt);
    this.sequence += 1;
    appendFileSync(this.path, JSON.stringify(receipt) + "\n", "utf8");
  }
}

/** Where ReceiptAuditSink parks the public key for a given receipt log. */
export function publicKeyPathFor(receiptLogPath: string): string {
  return receiptLogPath.replace(/\.jsonl$/, "") + ".pubkey.pem";
}

/** Read a receipt chain back off disk. Used by `npm run verify`. */
export function readChain(lines: string[]): AgentReceipt[] {
  return lines
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as AgentReceipt);
}
