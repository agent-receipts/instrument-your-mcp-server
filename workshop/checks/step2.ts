// Step 2: the sink writes JSONL, redaction strips codes, and a real run's log
// has the denials in it. From step 3 the server's sink is the receipt chain
// instead, so the run's log is whichever of the two files the server wrote.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { runHammer } from "../../examples/attacks.js";
import type { AuditEntry, AuditSink } from "../../src/toolGuard.js";
import { ROOT, at, importFrom, serverSpawn } from "../lib/paths.js";
import { ATTACK, describe, fail, notWrittenYet, pass, type CheckResult } from "./result.js";

type Module = {
  JsonlAuditSink: new (path: string) => AuditSink;
  redactShopParams: (params: Record<string, unknown>) => Record<string, unknown>;
};

const AUDIT_LOG = at("var/audit.jsonl");
const RECEIPT_LOG = at("var/receipts.jsonl");

export async function checkStep2(): Promise<CheckResult> {
  try {
    const { JsonlAuditSink, redactShopParams } = await importFrom<Module>("src/auditLog.ts");

    const original = {
      order_id: "order-0001",
      code: "SCOOP-1234",
      phone: "021 555 0123",
      email: "kev@example.com",
      card_number: "4111 1111 1111 1111",
    };
    const given = { ...original };
    const redacted = redactShopParams(given);
    for (const key of ["code", "phone", "email", "card_number"] as const) {
      if (redacted[key] === original[key]) return fail(`redactShopParams left ${key} in`);
      if (redacted[key] !== "[redacted]") {
        return fail(
          `redactShopParams changed ${key}, but not to "[redacted]". Anything else, such as an ` +
            "encoding, can be turned back into the value, and leaving the key out hides that it was there",
        );
      }
    }
    if (redacted["order_id"] !== "order-0001") {
      return fail("redactShopParams removed order_id too. Strip secrets, keep what an investigator needs");
    }
    if (JSON.stringify(given) !== JSON.stringify(original)) {
      return fail(
        "redactShopParams changed the arguments it was given. Return a copy: those same arguments " +
          "go on to the tool, so it would receive [redacted] instead of the real values",
      );
    }

    const path = join(mkdtempSync(join(tmpdir(), "scoop-audit-")), "not-yet-created", "audit.jsonl");
    const sink = new JsonlAuditSink(path);
    const entry: AuditEntry = {
      timestamp: 1,
      agentId: "check",
      toolName: "list_flavors",
      direction: "request",
      allowed: false,
      reason: "checking",
    };
    sink.record(entry);
    sink.record({ ...entry, timestamp: 2 });
    const lines = readFileSync(path, "utf8").trim().split("\n");
    if (lines.length !== 2) {
      return fail(`JsonlAuditSink wrote ${lines.length} line(s) for 2 entries. One JSON object per line`);
    }
    const first = JSON.parse(lines[0] ?? "") as Partial<AuditEntry>;
    if (first.reason !== "checking" || first.allowed !== false) {
      return fail("JsonlAuditSink didn't write the entry as it was given");
    }
  } catch (err: unknown) {
    return notWrittenYet(err, "src/auditLog.ts") ?? fail(`src/auditLog.ts threw: ${describe(err)}`);
  }

  rmSync(AUDIT_LOG, { force: true });
  rmSync(RECEIPT_LOG, { force: true });
  try {
    await runHammer(serverSpawn(), ATTACK);
  } catch (err: unknown) {
    return fail(`src/server.ts didn't survive the hammer: ${describe(err)}`);
  }

  const receipts = existsSync(RECEIPT_LOG);
  const log = receipts ? RECEIPT_LOG : AUDIT_LOG;
  const name = relative(ROOT, log);
  if (!existsSync(log)) {
    return fail(`no ${name} after running the hammer. Is auditSink passed to ToolGuard in src/server.ts?`);
  }
  const text = readFileSync(log, "utf8");
  if (/SCOOP-\d{4}/.test(text)) {
    return fail(`${name} has discount codes in plain text. Pass redact to ToolGuard`);
  }
  let entries: unknown[];
  try {
    entries = text.trim().split("\n").map((l) => JSON.parse(l) as unknown);
  } catch {
    return fail(`${name} isn't one JSON object per line`);
  }
  const denied = entries.filter((e) =>
    receipts
      ? (e as { credentialSubject?: { outcome?: { status?: string } } }).credentialSubject?.outcome
          ?.status === "failure"
      : (e as { allowed?: boolean }).allowed === false,
  );
  if (denied.length === 0) {
    return fail(`${name} has no denied calls, but the hammer was stopped. A log of successes can't show an attack`);
  }
  const responses = entries.filter((e) =>
    receipts
      ? (e as { credentialSubject?: { action?: { type?: string } } }).credentialSubject?.action?.type === "tool_result"
      : (e as { direction?: string }).direction === "response",
  );
  if (responses.length === 0) {
    return fail(
      `${name} records what was asked, but never what happened. Call guard.guardToolResponse after dispatch ` +
        "(and in the ShopError branch), so the log shows each call's outcome too",
    );
  }
  return pass(`${name}: ${entries.length} entries, ${denied.length} denied, codes redacted`);
}
