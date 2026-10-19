// npm run check <n>
//
// Checks steps 0..n against your src/, stopping at the first one that fails.
// Each step's check tests the module you wrote on its own, then runs a real
// attack against src/server.ts. The logs it reads are deleted before each
// run, so an old run can't pass or fail it for you.

import { spawnSync } from "node:child_process";

import { paint } from "./lib/colour.js";
import { ROOT } from "./lib/paths.js";
import { STEPS, UsageError, parseStep } from "./lib/steps.js";
import type { CheckResult } from "./checks/result.js";
import { checkStep0 } from "./checks/step0.js";
import { checkStep1 } from "./checks/step1.js";
import { checkStep2 } from "./checks/step2.js";
import { checkStep3 } from "./checks/step3.js";
import { checkStep4 } from "./checks/step4.js";
import { checkStep5 } from "./checks/step5.js";

/** Indexed by step number: CHECKS[0] is step 0's. */
export const CHECKS: Array<() => Promise<CheckResult>> = [checkStep0, checkStep1, checkStep2, checkStep3, checkStep4, checkStep5];

const USAGE = "usage: npm run check <0-5>   (checks steps 0 up to that one)";

/** Type errors in src/, as a note. tsx runs code without type-checking it,
 *  so a step can pass with code that doesn't compile. That shouldn't stop
 *  anyone in the room, but they should know. */
function typeNote(): void {
  const r = spawnSync("npx", ["tsc", "--noEmit"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const errors = `${r.stdout ?? ""}`.split("\n").filter((l) => /^src[\\/].*error TS/.test(l));
  if (errors.length === 0) return;
  console.log(
    `\n${paint("yellow", "note")}  ${errors.length} type error(s) in src/. Your code runs, but it won't compile cleanly.\n` +
      `      First one: ${errors[0]}\n` +
      "      Run npm run typecheck to see them all.",
  );
}

function indent(text: string): string {
  return text.split("\n").join("\n      ");
}

async function main(): Promise<void> {
  const n = parseStep(process.argv.slice(2), USAGE);
  console.log(`Checking steps 0 to ${n} against src/\n`);

  for (const step of STEPS.filter((s) => s.n <= n)) {
    const check = CHECKS[step.n];
    if (!check) throw new Error(`no check for step ${step.n}`);
    const r = await check();
    console.log(`${r.ok ? paint(["green", "bold"], "PASS") : paint(["red", "bold"], "FAIL")}  step ${step.n}  ${step.title}  ${indent(r.detail)}`);
    if (!r.ok) {
      typeNote();
      console.log(`      brief: ${step.brief}`);
      const current = STEPS.find((s) => s.n === n);
      if (step.n < n && current) {
        console.log(
          `      This ran against your whole server, so code you added for step ${n} can cause it` +
            ` (brief: ${current.brief}).`,
        );
      }
      process.exit(1);
    }
  }
  typeNote();
  console.log(`\n${paint("green", `Step ${n} done.`)}`);
}

main().catch((err: unknown) => {
  if (err instanceof UsageError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
