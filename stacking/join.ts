// Join the server's receipt chain to Pipelock's, using the correlation id the
// server copied out of the mediation envelope.
//
//   npm run join
//
// A proxy record with verdict "block" and no server receipt is an attack the
// proxy stopped that your server never saw. Before the envelope that was an
// invisible gap; now it's a line in this table. The join key itself is
// unsigned, so this is a label you can query across, not evidence.
//
// The server starts a new chain every time it starts (var/receipts.jsonl), so
// this joins it to Pipelock's most recent run only. Pipelock keeps every
// run's evidence in stacking/evidence; `pipelock verify-receipt --chain`
// checks all of them.

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readChain } from "../solution/receipts.js";

export interface ProxyRecord {
  id: string;
  tool: string;
  verdict: string;
}

export interface JoinRow {
  proxy: ProxyRecord;
  /** The server's receipts for the same call, as "tool status"; undefined if none. */
  server: string[] | undefined;
}

export interface Joined {
  /** The proxy run that was read, or undefined when there is no evidence. */
  run: string | undefined;
  rows: JoinRow[];
  /** Server receipts that carry a correlation id at all. */
  serverWithId: number;
  /** ...and how many of those resolve to a proxy record. */
  resolved: number;
}

/** The evidence files of Pipelock's most recent run. Each run writes files
 *  named `evidence-<session>.run.<id>-<n>.jsonl`. */
function latestRun(dir: string): { run: string | undefined; files: string[] } {
  if (!existsSync(dir)) return { run: undefined, files: [] };
  const byRun = new Map<string, { files: string[]; newest: number }>();
  for (const f of readdirSync(dir).filter((f) => f.startsWith("evidence-") && f.endsWith(".jsonl"))) {
    const run = /\.run\.([0-9a-f]+)/.exec(f)?.[1] ?? f;
    const entry = byRun.get(run) ?? { files: [], newest: 0 };
    entry.files.push(join(dir, f));
    entry.newest = Math.max(entry.newest, statSync(join(dir, f)).mtimeMs);
    byRun.set(run, entry);
  }
  const latest = [...byRun.entries()].sort((a, b) => b[1].newest - a[1].newest)[0];
  return latest ? { run: latest[0], files: latest[1].files.sort() } : { run: undefined, files: [] };
}

/** Pipelock's tool-call receipts from its flight recorder.
 *
 *  Each line of evidence-*.jsonl is an envelope; the receipt itself is at
 *  detail.action_record. Session open, heartbeat and close records are the
 *  recorder's own bookkeeping, not calls, so they're skipped. (Format as
 *  observed on pipelock 3.5.0 and 3.7.0.) */
function proxyRecords(files: string[]): ProxyRecord[] {
  const records: ProxyRecord[] = [];
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
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

export function joinChains(receiptsPath = "var/receipts.jsonl", evidenceDir = "stacking/evidence"): Joined {
  const receipts = existsSync(receiptsPath) ? readChain(readFileSync(receiptsPath, "utf8").split("\n")) : [];
  const { run, files } = latestRun(evidenceDir);
  const proxy = proxyRecords(files);
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
  return {
    run,
    rows: proxy.map((p) => ({ proxy: p, server: serverByCorrelation.get(p.id) })),
    serverWithId: serverByCorrelation.size,
    resolved: [...serverByCorrelation.keys()].filter((id) => proxy.some((p) => p.id === id)).length,
  };
}

function main(): void {
  const joined = joinChains();
  if (!joined.run) {
    console.log("No Pipelock evidence in stacking/evidence yet. Run something through the proxy first (steps/6-pipelock.md).");
    return;
  }
  console.log("proxy says                      server says, for the same call");
  for (const { proxy, server } of joined.rows) {
    console.log(`${`${proxy.verdict} ${proxy.tool}`.padEnd(31)} ${server ? server.join(", ") : "NONE (never reached the server)"}`);
  }
  console.log(`\n${joined.resolved} of ${joined.serverWithId} server correlation ids resolve to a proxy record.`);
  if (joined.serverWithId === 0) {
    console.log(
      "None of the server's receipts has a correlation id. It takes two things: src/server.ts reads Pipelock's id\n" +
        "from the request's _meta and passes it to the guard, and your sink in src/receipts.ts records\n" +
        "entry.correlationId in the receipt. Item 3 of steps/6-pipelock.md has both.",
    );
  }
}

function isMain(): boolean {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// Run only when started as a script; npm run check 6 imports joinChains.
if (isMain()) main();
