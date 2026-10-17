// Step 5 — write this. The brief is steps/5-poisoned-menu.md.

import type { ResponseScanner, ScanResult, ThreatMatch } from "./toolGuard.js";

/** Looks at what a tool is about to send back to the model, for text that
 *  tries to give the model instructions. */
export class PromptInjectionScanner implements ResponseScanner {
  scan(content: string, toolName: string): ScanResult {
    throw new Error("not implemented: PromptInjectionScanner.scan (step 5)");
  }

  sanitize(content: string, toolName: string): { sanitized: string; removed: ThreatMatch[] } {
    throw new Error("not implemented: PromptInjectionScanner.sanitize (step 5)");
  }
}
