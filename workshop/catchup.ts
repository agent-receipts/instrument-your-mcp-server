// npm run catchup <n>
//
// Puts src/ into the known-good state at the end of step n, so anyone who
// fell behind starts the next step from the same place as everyone else.
// Copies the finished module for steps 1..n and the server wired for exactly
// those steps. Everything it replaces is backed up first.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { ROOT, at } from "./lib/paths.js";
import { CATCHUP_STEPS, STEPS, UsageError, parseStep, snapshotFor } from "./lib/steps.js";

const USAGE = "usage: npm run catchup <0-5>   (puts src/ at the end of that step)";

function main(): void {
  const argv = process.argv.slice(2);
  // Steps 6 and 7 run tools against the truck from step 5 and don't change
  // src/, so there is nothing to catch up to. Say that, not just the usage.
  const arg = argv.find((a) => !a.startsWith("-"));
  const guided = STEPS.find((s) => s.module === undefined && String(s.n) === arg);
  if (guided) {
    throw new UsageError(
      `Step ${guided.n} doesn't change src/, so there's nothing to catch up to.\n` +
        `It starts from the end of step 5. To get there: npm run catchup 5\n${USAGE}`,
    );
  }
  const n = parseStep(argv, USAGE, CATCHUP_STEPS);

  const copies: Array<{ from: string; to: string }> = [
    ...CATCHUP_STEPS.filter((s) => s.n <= n).map((s) => ({
      from: at("solution", s.module ?? ""),
      to: at("src", s.module ?? ""),
    })),
    { from: at(snapshotFor(n)), to: at("src/server.ts") },
  ];

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = at("var/catchup-backup", stamp);
  let backedUp = 0;
  for (const { from, to } of copies) {
    if (existsSync(to) && readFileSync(to, "utf8") !== readFileSync(from, "utf8")) {
      mkdirSync(backupDir, { recursive: true });
      copyFileSync(to, join(backupDir, relative(at("src"), to)));
      backedUp++;
    }
  }

  for (const { from, to } of copies) {
    copyFileSync(from, to);
    console.log(`  ${relative(ROOT, from)}  ->  ${relative(ROOT, to)}`);
  }

  if (backedUp > 0) {
    console.log(`\nYour previous versions of ${backedUp} file(s) are in ${relative(ROOT, backupDir)}/`);
  }
  const next = STEPS.find((s) => s.n === n + 1);
  console.log(
    next?.module
      ? `\nsrc/ is now at the end of step ${n}. Next: ${next.brief}`
      : `\nsrc/ now has every step, 0 to 5. Run: npm run heist` +
          (next ? `\nSteps 6 and 7 start from here: ${next.brief}` : ""),
  );
}

try {
  main();
} catch (err: unknown) {
  if (err instanceof UsageError) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}
