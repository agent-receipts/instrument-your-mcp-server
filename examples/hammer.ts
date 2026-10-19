// "Hammer the endpoint, watch it cut off."
//
// Starts the scoop-truck server, connects over HTTP as a real MCP client
// (examples/connect.ts), places an order, then brute-forces the four-digit
// discount code. Against the uninstrumented server this finds the code and no
// one is any the wiser.
// Once you've added rate limiting, run it again: it should stop dead, and
// your audit log should show exactly how many guesses it got through.
//
// Run with: npm run hammer
// Point it at your instrumented version with: npm run hammer -- solution/server.ts
// Or attack a whole stack:
//   npm run hammer -- --via pipelock mcp proxy -- npx tsx solution/server.ts

import { runHammer } from "./attacks.js";
import { spawnFromArgv } from "./spawn.js";
import { describe } from "../workshop/checks/result.js";

async function main(): Promise<void> {
  const spawn = spawnFromArgv(process.argv.slice(2));
  console.log(`connected to ${spawn.label}\n`);
  const r = await runHammer(spawn, {
    onOrder: (orderText, orderId) => {
      console.log(orderText);
      console.log(`\nbrute-forcing discount codes against ${orderId}...`);
    },
    onProgress: (guesses) => console.log(`  ${guesses} guesses, still going...`),
  });

  const seconds = r.seconds.toFixed(1);
  console.log("");
  if (r.outcome === "stopped") {
    console.log(`STOPPED after ${r.guesses} guesses in ${seconds}s`);
    console.log(`  server said: ${r.stoppedBy}`);
  } else if (r.outcome === "cracked") {
    console.log(`CRACKED after ${r.guesses} guesses in ${seconds}s — code is ${r.code}`);
    console.log("  nothing stopped it. var/server.log has every code it tried, in plain text.");
  } else {
    console.log(`gave up after ${r.guesses} guesses in ${seconds}s`);
  }
}

main().catch((err: unknown) => {
  console.error(describe(err));
  process.exit(1);
});
