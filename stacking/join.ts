// Join the server's receipt chain to Pipelock's, using the correlation id the
// server copied out of the mediation envelope.
//
//   npm run join
//
// A proxy record with verdict "block" and no server receipt is an attack the
// proxy stopped that your server never saw. Before the envelope that was an
// invisible gap; now it's a line in this table. The join key itself is
// unsigned, so this is a label you can query across, not evidence.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readChain } from "../solution/receipts.js";

interface ProxyRecord {
  id: string;
  tool: string;
  verdict: string;
}

/** Pipelock's tool-call receipts from its flight recorder.
 *
 *  Each line of evidence-*.jsonl is an envelope; the receipt itself is at
 *  detail.action_record. Session open, heartbeat and close records are the
 *  recorder's own bookkeeping, not calls, so they're skipped. (Format as
 *  observed on pipelock 3.5.0.) */
function proxyRecords(dir: string): ProxyRecord[] {
  const records: ProxyRecord[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const envelope = JSON.parse(line) as {
        type?: string;
        detail?: {
          action_record?: {
            action_id?: string;
            verdict?: string;
            target?: string;
            session_control?: unknown;
          };
        };
      };
      const r = envelope.detail?.action_record;
      if (envelope.type !== "action_receipt" || !r?.action_id || r.session_control) continue;
      records.push({ id: r.action_id, tool: r.target ?? "?", verdict: r.verdict ?? "?" });
    }
  }
  return records;
}

const receipts = readChain(readFileSync("var/receipts.jsonl", "utf8").split("\n"));
const proxy = proxyRecords("stacking/evidence");
const serverByCorrelation = new Map<string, string[]>();
for (const r of receipts) {
  const subject = r.credentialSubject as unknown as {
    correlation_id?: string;
    action: { tool_name?: string };
    outcome: { status: string };
  };
  if (!subject.correlation_id) continue;
  const list = serverByCorrelation.get(subject.correlation_id) ?? [];
  list.push(`${subject.action.tool_name ?? "?"} ${subject.outcome.status}`);
  serverByCorrelation.set(subject.correlation_id, list);
}

console.log("proxy says                      server says, for the same call");
for (const p of proxy) {
  const server = serverByCorrelation.get(p.id);
  console.log(
    `${`${p.verdict} ${p.tool}`.padEnd(31)} ${server ? server.join(", ") : "NONE (never reached the server)"}`,
  );
}
const joined = [...serverByCorrelation.keys()].filter((id) => proxy.some((p) => p.id === id)).length;
console.log(`\n${joined} of ${serverByCorrelation.size} server correlation ids resolve to a proxy record.`);
