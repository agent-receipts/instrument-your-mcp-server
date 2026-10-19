// The server's log as a table, one line per entry.
//
// Reads whichever of var/audit.jsonl (step 2) and var/receipts.jsonl
// (step 3 on) was written last. It only reads: it doesn't check signatures
// (that's npm run verify), and the attacks still edit the raw file.
//
//   npm run log                       # the latest log
//   npm run log -- --denied           # only what was refused
//   npm run log -- var/audit.jsonl    # a particular file

import { existsSync, readFileSync, statSync } from "node:fs";

import { paint } from "../workshop/lib/colour.js";

interface Row {
  time: string;
  caller: string;
  kind: string;
  tool: string;
  allowed: boolean;
  detail: string;
}

const CANDIDATES = ["var/audit.jsonl", "var/receipts.jsonl"];

function latestLog(): string | undefined {
  return CANDIDATES.filter((p) => existsSync(p)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function clock(iso: string | number | undefined): string {
  if (iso === undefined) return "--:--:--";
  return new Date(iso).toTimeString().slice(0, 8);
}

function short(id: string | undefined): string {
  return (id ?? "?").replace(/^agent:/, "").slice(0, 8);
}

/** One entry from either file, as a row. Anything unrecognised is shown as such. */
function toRow(entry: Record<string, unknown>): Row {
  const subject = entry["credentialSubject"] as
    | {
        principal?: { id?: string };
        action?: { type?: string; tool_name?: string; timestamp?: string };
        outcome?: { status?: string; error?: string };
        chain?: { sequence?: number };
      }
    | undefined;
  if (subject) {
    const allowed = subject.outcome?.status === "success";
    return {
      time: clock(subject.action?.timestamp),
      caller: short(subject.principal?.id),
      kind: subject.action?.type === "tool_result" ? "result" : "call",
      tool: subject.action?.tool_name ?? "?",
      allowed,
      detail: `#${subject.chain?.sequence ?? "?"}${allowed ? "" : `  ${subject.outcome?.error ?? ""}`}`,
    };
  }
  const allowed = entry["allowed"] === true;
  const params = entry["parameters"] ? JSON.stringify(entry["parameters"]) : "";
  const stage = typeof entry["stage"] === "string" && !allowed ? `${entry["stage"]}: ` : "";
  return {
    time: clock(entry["timestamp"] as number | undefined),
    caller: short(entry["agentId"] as string | undefined),
    kind: entry["direction"] === "response" ? "result" : "call",
    tool: String(entry["toolName"] ?? "?"),
    allowed,
    detail: allowed ? params : `${stage}${String(entry["reason"] ?? "")}`,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const deniedOnly = args.includes("--denied");
  const path = args.find((a) => !a.startsWith("--")) ?? latestLog();
  if (!path) {
    console.log("No log yet. Steps 2 and 3 write var/audit.jsonl and var/receipts.jsonl; run npm run hammer or npm run heist first.");
    process.exit(1);
  }
  if (!existsSync(path)) {
    console.log(`No such file: ${path}`);
    process.exit(1);
  }

  const lines = readFileSync(path, "utf8").split("\n");
  let shown = 0;
  let denied = 0;
  let total = 0;
  console.log(`${path}\n`);
  lines.forEach((line, i) => {
    if (line.trim() === "") return;
    total += 1;
    let row: Row;
    try {
      row = toRow(JSON.parse(line) as Record<string, unknown>);
    } catch {
      console.log(paint("yellow", `line ${i + 1}: not valid JSON`));
      return;
    }
    if (!row.allowed) denied += 1;
    if (deniedOnly && row.allowed) return;
    shown += 1;
    const outcome = row.allowed ? paint("green", "ok    ") : paint(["red", "bold"], "DENIED");
    console.log(
      `${String(i + 1).padStart(4)}  ${row.time}  ${row.caller.padEnd(8)}  ${row.kind.padEnd(6)}  ${row.tool.padEnd(20)}  ${outcome}  ${row.detail}`,
    );
  });
  console.log(`\n${total} entries, ${denied} denied${deniedOnly ? `, ${shown} shown` : ""}.`);
  if (path.endsWith("receipts.jsonl")) console.log("This only reads the chain. npm run verify checks it.");
}

main();
