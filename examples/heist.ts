// "Did the agent refund $9,000 in waffle cones?"
//
// The same five requests against either server. Against src/server.ts every
// one of them succeeds. Against solution/server.ts four are refused, each by
// a different layer, and all five are on the receipt chain either way.
//
// This is the demo to show a security stakeholder. It isn't about ice cream:
// it's an agent with a legitimate credential doing legitimate-looking things
// in an order nobody sanctioned, which is what this actually looks like when
// it happens to you.
//
//   npm run heist                          # the uninstrumented truck
//   npm run heist -- solution/server.ts    # the instrumented one
//   npm run heist -- --via pipelock mcp proxy --config stacking/pipelock.yaml \
//                     -- npx tsx solution/server.ts   # a proxy stacked on top
//   npm run verify                         # then read the receipts

import { HEIST_STEPS, runHeist } from "./attacks.js";
import { spawnFromArgv } from "./spawn.js";
import { describe } from "../workshop/checks/result.js";

async function main(): Promise<void> {
  const spawn = spawnFromArgv(process.argv.slice(2));
  console.log(`\nrunning against ${spawn.label}\n`);
  const { results, wentThrough } = await runHeist(spawn);

  for (const { step, blocked, detail } of results) {
    console.log(`${blocked ? "BLOCKED" : "WENT THROUGH"}  ${step.label}`);
    console.log(`         ${detail}`);
    if (!blocked && step.stoppedBy !== "nothing — this one is fine") {
      console.log(`         (should have been stopped by: ${step.stoppedBy})`);
    }
    console.log("");
  }

  console.log(`${wentThrough} of ${HEIST_STEPS.length} went through.`);
  if (wentThrough === HEIST_STEPS.length) {
    console.log("Nothing stopped any of it. The only trace is a plain-text line per call in var/server.log.");
  } else {
    console.log("Every attempt above — allowed and denied — is on the receipt chain.");
    console.log("Read it with: npm run verify");
  }
}

main().catch((err: unknown) => {
  console.error(describe(err));
  process.exit(1);
});
