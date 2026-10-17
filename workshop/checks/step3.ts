// Step 3: receipts from your sink verify, both from a small test chain and
// from a real heist. The two mistakes almost everyone makes first get named.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { didFromPublicKey } from "@obsigna/sdk-ts";
import { verifyChain, type AgentReceipt } from "@obsigna/sdk-ts/receipt";

import { runHeist } from "../../examples/attacks.js";
import { publicKeyPathFor } from "../../solution/receipts.js";
import type { AuditEntry, AuditSink } from "../../src/toolGuard.js";
import { at, importFrom, serverSpawn } from "../lib/paths.js";
import {
  ATTACK,
  UNDEFINED_FIELD,
  describe,
  fail,
  notWrittenYet,
  pass,
  type CheckResult,
} from "./result.js";

type Module = { ReceiptAuditSink: new (path: string) => AuditSink };

const RECEIPT_LOG = at("var/receipts.jsonl");


function verifyFile(path: string, what: string): CheckResult & { length: number } {
  const keyPath = publicKeyPathFor(path);
  if (!existsSync(path)) return { ...fail(`${what}: no receipts were written`), length: 0 };
  if (!existsSync(keyPath)) {
    return { ...fail(`${what}: no public key at ${keyPath}. Write it next to the log (publicKeyPathFor)`), length: 0 };
  }
  let receipts: AgentReceipt[];
  try {
    receipts = readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as AgentReceipt);
  } catch {
    return { ...fail(`${what}: the log isn't one JSON receipt per line`), length: 0 };
  }
  if (receipts.length === 0) return { ...fail(`${what}: the log is empty`), length: 0 };

  const result = verifyChain(receipts, readFileSync(keyPath, "utf8"));
  if (result.valid) return { ...pass(""), length: receipts.length };

  const broken = result.receipts[result.brokenAt];
  const firstSequence = (receipts[0] as { credentialSubject?: { chain?: { sequence?: number } } })
    .credentialSubject?.chain?.sequence;
  if (result.brokenAt === 0 && broken && !broken.sequenceValid && firstSequence === 0) {
    return { ...fail(`${what}: the first receipt is numbered 0. Chain sequence starts at 1`), length: 0 };
  }
  const parts = broken
    ? `signature ${broken.signatureValid ? "ok" : "INVALID"}, hash link ${broken.hashLinkValid ? "ok" : "INVALID"}, sequence ${broken.sequenceValid ? "ok" : "INVALID"}`
    : "";
  return {
    ...fail(`${what}: chain broken at index ${result.brokenAt}. ${parts}${result.error ? `. ${result.error}` : ""}`),
    length: 0,
  };
}

/** The did:key a receipt's issuer should have, worked out from the PEM. */
function didOf(publicKeyPem: string): string {
  const jwk = createPublicKey(publicKeyPem).export({ format: "jwk" });
  return didFromPublicKey(new Uint8Array(Buffer.from(jwk.x ?? "", "base64url")));
}

interface ReceiptShape {
  issuer?: { id?: string };
  credentialSubject?: { action?: { tool_name?: string; risk_level?: string; parameters_hash?: string } };
}

/** What signing alone doesn't catch: whose key it is, and what was kept. */
function checkContent(path: string): CheckResult | null {
  const receipts = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ReceiptShape);
  const [first] = receipts;
  const action = (tool: string) => receipts.find((r) => r.credentialSubject?.action?.tool_name === tool)?.credentialSubject?.action;
  const expected = didOf(readFileSync(publicKeyPathFor(path), "utf8"));
  if (first?.issuer?.id !== expected) {
    return fail(
      `the receipt's issuer isn't the did:key of the signing key (expected ${expected}, got ${first?.issuer?.id}). ` +
        "Make the DID from the public key you sign with, with didFromPublicKey",
    );
  }
  const hash = first.credentialSubject?.action?.parameters_hash ?? "";
  if (hash.includes("vanilla")) {
    return fail("parameters_hash contains the parameters themselves. Store a hash of them (for example sha256), not the values");
  }
  if (hash !== "" && hash === action("issue_refund")?.parameters_hash) {
    return fail("two calls with different parameters got the same parameters_hash. Hash the entry's own parameters");
  }
  for (const tool of ["issue_refund", "blast_promo_sms"]) {
    if (action(tool)?.risk_level === "low") {
      return fail(`${tool} has risk_level "low". It moves money or texts 12,403 people, so mark it higher (see the brief)`);
    }
  }
  return null;
}

export async function checkStep3(): Promise<CheckResult> {
  let Sink: Module["ReceiptAuditSink"];
  try {
    ({ ReceiptAuditSink: Sink } = await importFrom<Module>("src/receipts.ts"));
  } catch (err: unknown) {
    return fail(`src/receipts.ts didn't load: ${describe(err)}`);
  }

  const path = join(mkdtempSync(join(tmpdir(), "scoop-receipts-")), "receipts.jsonl");
  try {
    const sink = new Sink(path);
    const base = { timestamp: Date.now(), agentId: "check", toolName: "place_order", reason: "checking" };
    const entries: AuditEntry[] = [
      { ...base, direction: "request", parameters: { flavor: "vanilla", scoops: 2 }, allowed: true },
      // No parameters and no correlationId: the optional-field trap.
      { ...base, direction: "response", allowed: true },
      { ...base, toolName: "issue_refund", direction: "request", parameters: { amount_cents: 900_000 }, allowed: false, reason: "over the limit" },
      { ...base, toolName: "blast_promo_sms", direction: "request", parameters: { segment: "all" }, allowed: false, reason: "on the deny list" },
    ];
    for (const e of entries) sink.record(e);
  } catch (err: unknown) {
    const message = describe(err);
    if (/RFC 8785/.test(message) && /undefined/.test(message)) return fail(UNDEFINED_FIELD);
    return notWrittenYet(err, "src/receipts.ts") ?? fail(`ReceiptAuditSink threw: ${message}`);
  }
  const unit = verifyFile(path, "test chain");
  if (!unit.ok) return unit;
  const content = checkContent(path);
  if (content) return content;
  const firstKey = readFileSync(publicKeyPathFor(path), "utf8");

  // A second sink on the same file is what a second server run looks like.
  // It has a new key, so it has to start a new chain in a new, empty file.
  try {
    const again = new Sink(path);
    again.record({ timestamp: Date.now(), agentId: "check", toolName: "list_flavors", direction: "request", allowed: true, reason: "checking" });
  } catch (err: unknown) {
    return fail(`ReceiptAuditSink threw on a second run: ${describe(err)}`);
  }
  const second = verifyFile(path, "second run");
  if (!second.ok || second.length !== 1) {
    return fail(
      "a second ReceiptAuditSink on the same path added to the old file. Each run has a new key, " +
        "so two runs in one file won't verify. In the constructor, start a new, empty file",
    );
  }
  if (readFileSync(publicKeyPathFor(path), "utf8") === firstKey) {
    return fail(
      "a second ReceiptAuditSink used the same key as the first. Generate a new key pair in the " +
        "constructor, so each run is its own chain with its own key",
    );
  }

  rmSync(RECEIPT_LOG, { force: true });
  rmSync(publicKeyPathFor(RECEIPT_LOG), { force: true });
  try {
    await runHeist(serverSpawn(), ATTACK);
  } catch (err: unknown) {
    return fail(`src/server.ts didn't survive the heist: ${describe(err)}`);
  }
  if (!existsSync(RECEIPT_LOG)) {
    return fail('no var/receipts.jsonl after the heist. Is new ReceiptAuditSink("var/receipts.jsonl") the auditSink in src/server.ts?');
  }
  const run = verifyFile(RECEIPT_LOG, "var/receipts.jsonl");
  if (!run.ok) return run;
  return pass(`test chain verifies; heist wrote ${run.length} receipts and they verify`);
}
