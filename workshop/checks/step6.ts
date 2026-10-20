// Step 6: Pipelock in front of your truck. The probe goes through the stack;
// the proxy should stop the hidden instruction before your server sees it,
// your server should refuse the SMS blast, and the join should resolve the
// proxy's record of that call to your server's receipt.
//
// Pipelock is an optional install. Without it the step is skipped, not
// failed, so someone who paired or watched can still run check 7.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";

import { textOf, withClient } from "../../examples/attacks.js";
import { PROBES } from "../../examples/probe.js";
import type { Spawn } from "../../examples/spawn.js";
import { joinChains } from "../../stacking/join.js";
import { at } from "../lib/paths.js";
import { ATTACK, describe, fail, pass, skip, type CheckResult } from "./result.js";

/** The Pipelock command. SCOOP_PIPELOCK overrides it, which is how the tests
 *  try the not-installed path on a machine that has it. */
const PIPELOCK = process.env["SCOOP_PIPELOCK"] ?? "pipelock";
const CONFIG = "stacking/pipelock.yaml";
const KEY = "stacking/plhome/agents/scoop-mediator/id_ed25519";

/** How a probe ended: refused by the proxy (the call throws), refused by the
 *  server (isError), or went through. */
interface Outcome {
  kind: "transport" | "refused" | "through";
  text: string;
}

/** Which half of the correlation id is missing, going by the source. Only a
 *  hint: either file can do its part some other way. */
function whereToLook(): string {
  const read = (file: string) => (existsSync(at(file)) ? readFileSync(at(file), "utf8") : "");
  const server = read("src/server.ts").includes("com.pipelock/mediation");
  const sink = read("src/receipts.ts").includes("correlationId");
  if (server && !sink) return "src/server.ts reads the envelope, but src/receipts.ts never mentions correlationId, so start with the sink. ";
  if (!server && sink) return "src/server.ts never mentions com.pipelock/mediation, so start with the server. ";
  if (!server && !sink) return "Neither file mentions it yet. ";
  return "";
}

export async function checkStep6(): Promise<CheckResult> {
  const version = spawnSync(PIPELOCK, ["version"], { encoding: "utf8" });
  if (version.error) {
    return skip(
      "Pipelock isn't installed here, so this step wasn't checked. That's fine if you paired or watched.\n" +
        "To do it yourself, the brief says how to install it (steps/6-pipelock.md).",
    );
  }
  const installed = /version\s+(\S+)/.exec(version.stdout ?? "")?.[1] ?? "unknown";

  if (!existsSync(at(KEY))) {
    return fail(
      `Pipelock ${installed} is installed, but its signing key isn't set up yet. From this folder, run:\n` +
        "  npm run pipelock:key",
    );
  }

  const spawn: Spawn = {
    command: "npx",
    args: ["tsx", "src/server.ts"],
    label: `pipelock in front of src/server.ts`,
    proxy: { command: PIPELOCK, args: ["mcp", "proxy", "--config", CONFIG] },
  };

  rmSync(at("var/receipts.jsonl"), { force: true });
  let outcomes: Outcome[];
  try {
    outcomes = await withClient(spawn, "check", ATTACK, async (client) => {
      const out: Outcome[] = [];
      for (const probe of PROBES) {
        try {
          const result = await client.callTool({ name: probe.name, arguments: probe.arguments });
          out.push({ kind: result.isError ? "refused" : "through", text: textOf(result) });
        } catch (err: unknown) {
          out.push({ kind: "transport", text: err instanceof Error ? err.message : String(err) });
        }
      }
      return out;
    });
  } catch (err: unknown) {
    return fail(`couldn't run the probe through Pipelock ${installed}: ${describe(err)}`);
  }

  const [hidden, blast] = outcomes;
  if (hidden?.kind !== "transport") {
    return fail(
      `the order with a hidden instruction and an AWS-style key ${hidden?.kind === "through" ? "went through" : "reached your server"}. ` +
        `Pipelock should have blocked it at the transport. Is ${CONFIG} the one from the repo, and is Pipelock 3.7 or newer (you have ${installed})?`,
    );
  }
  if (blast?.kind !== "refused") {
    return fail(
      blast?.kind === "through"
        ? "the SMS blast went through the proxy and your server. Your server's deny-list (step 4) should refuse it"
        : `the SMS blast didn't reach your server: ${blast?.text ?? "no answer"}`,
    );
  }

  const joined = joinChains(at("var/receipts.jsonl"), at("stacking/evidence"));
  if (!joined.run) {
    return fail(`Pipelock wrote no evidence to stacking/evidence. Check flight_recorder in ${CONFIG}`);
  }
  const blocked = joined.rows.find((r) => r.proxy.verdict === "block" && r.proxy.tool === "place_order");
  if (!blocked) {
    return fail("Pipelock's evidence has no record of blocking the order. Run npm run join to see what it did record");
  }
  if (joined.serverWithId === 0) {
    return fail(
      "your server's receipts don't record Pipelock's id, so the two chains can't be joined. It takes two things: " +
        "src/server.ts reads the id from the request's _meta and passes it to the guard, and your sink in " +
        "src/receipts.ts records entry.correlationId in the receipt (createReceipt's correlationId). " +
        `${whereToLook()}"What to build", item 3, in steps/6-pipelock.md has both`,
    );
  }
  const sms = joined.rows.find((r) => r.proxy.tool === "blast_promo_sms" && r.server);
  if (!sms) {
    return fail(
      "your server recorded a correlation id, but it doesn't match Pipelock's record of the SMS blast. " +
        "Pass the envelope's rid to the guard unchanged. Run npm run join to compare",
    );
  }
  return pass(
    `Pipelock ${installed} blocked the hidden instruction before your server saw it, your server refused the SMS blast, ` +
      `and the join resolves the proxy's "${sms.proxy.verdict} blast_promo_sms" to your server's "${sms.server?.join(", ")}". ` +
      "npm run join shows the table",
  );
}
