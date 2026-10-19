// Step 0: every tool says what it does. Checks the annotations in
// src/tools.ts against what each tool actually does, then that they reach a
// client over MCP.

import { decide } from "../../examples/client.js";
import { withClient } from "../../examples/attacks.js";
import type { ToolDefinition } from "../../src/tools.js";
import { importFrom, serverSpawn } from "../lib/paths.js";
import { ATTACK, describe, fail, pass, type CheckResult } from "./result.js";

const READ_ONLY = ["list_flavors", "check_inventory"];
const DESTRUCTIVE = ["issue_refund", "comp_free_scoop", "blast_promo_sms"];
const CHANGES_STATE = ["place_order", "apply_discount_code"];

export async function checkStep0(): Promise<CheckResult> {
  let tools: ToolDefinition[];
  try {
    ({ TOOLS: tools } = await importFrom<{ TOOLS: ToolDefinition[] }>("src/tools.ts"));
  } catch (err: unknown) {
    return fail(`src/tools.ts threw: ${describe(err)}`);
  }

  const missing = tools.filter((t) => !t.annotations).map((t) => t.name);
  if (missing.length === tools.length) return fail("no tool has annotations yet. Add an annotations object to each tool in src/tools.ts");
  if (missing.length > 0) return fail(`these tools have no annotations: ${missing.join(", ")}`);

  for (const t of tools) {
    const a = t.annotations ?? {};
    if (READ_ONLY.includes(t.name) && a.readOnlyHint !== true) {
      return fail(`${t.name} only reads. Mark it readOnlyHint: true, or a careful client will ask before every menu`);
    }
    if (!READ_ONLY.includes(t.name) && a.readOnlyHint === true) {
      return fail(`${t.name} changes something, but says readOnlyHint: true. A client would run it without asking`);
    }
    if (!READ_ONLY.includes(t.name) && typeof a.destructiveHint !== "boolean") {
      return fail(`${t.name} changes something but doesn't say whether it's destructive. Set destructiveHint to true or false; a client left guessing assumes the worst`);
    }
    if (DESTRUCTIVE.includes(t.name) && a.destructiveHint === false) {
      return fail(`${t.name} can give away money, stock or messages, but says destructiveHint: false`);
    }
    if (CHANGES_STATE.includes(t.name) && a.destructiveHint !== false) {
      return fail(
        `${t.name} changes data but gives nothing away, yet says destructiveHint: true. ` +
          "A careful client would ask before every one; set it to false",
      );
    }
  }
  const blast = tools.find((t) => t.name === "blast_promo_sms");
  if (blast?.annotations?.openWorldHint !== true) {
    return fail("blast_promo_sms texts 12,403 real phones. Mark it openWorldHint: true: it reaches outside the system");
  }

  let served: Array<{ name: string; annotations?: object }>;
  try {
    served = await withClient(serverSpawn(), "check", ATTACK, async (client) => (await client.listTools()).tools);
  } catch (err: unknown) {
    return fail(`src/server.ts didn't list its tools: ${describe(err)}`);
  }
  if (served.some((t) => !t.annotations)) return fail("src/tools.ts has annotations, but they don't reach the client. Is TOOLS what the server lists?");
  const runs = served.filter((t) => decide(t.annotations).action === "run").length;
  return pass(`every tool says what it does; a careful client runs ${runs} of ${served.length} without asking`);
}
