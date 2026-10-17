// Step 5 — a scanner for what goes back to the model.
//
// A tool's output is input to the model, and some of it wasn't written by
// you: here, a flavour description straight from the supplier's feed. Text
// that addresses the model and tells it what to do from now on is an
// injection, whoever meant it.
//
// This is a tripwire, not a defence. It catches the phrasings it knows and
// nothing else; reword the injection and it walks past. What it buys you is
// a cheap catch for the obvious ones, and a receipt that something was
// tried.

import type { ResponseScanner, ScanResult, ThreatMatch } from "../src/toolGuard.js";

const PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /\b(ignore|disregard|forget)\b[^.]*\b(previous|prior|above|earlier)\b[^.]*\binstructions?\b/i,
    description: "tries to override the model's instructions",
  },
  {
    pattern: /\b(ai|language model|llm)\s+(assistants?|agents?|models?)\b|\byou are now\b|\bsystem prompt\b/i,
    description: "addresses the model directly",
  },
  {
    pattern: /\bfrom now on\b|\bfor the rest of (this|the) (conversation|chat|session)\b/i,
    description: "tries to change the model's behaviour beyond this answer",
  },
];

function threatsIn(text: string): ThreatMatch[] {
  return PATTERNS.filter((p) => p.pattern.test(text)).map((p) => ({
    category: "prompt_injection",
    description: p.description,
  }));
}

export class PromptInjectionScanner implements ResponseScanner {
  scan(content: string, _toolName: string): ScanResult {
    const threats = threatsIn(content);
    return { safe: threats.length === 0, threats };
  }

  // Drop each sentence that trips a pattern and keep the rest, so one bad
  // flavour costs its note, not the whole menu. The guard re-scans the
  // result, so a sentence this misses still gets the response blocked.
  sanitize(content: string, _toolName: string): { sanitized: string; removed: ThreatMatch[] } {
    const removed: ThreatMatch[] = [];
    const sanitized = content
      .split("\n")
      .map((line) =>
        line
          .split(/(?<=[.!?])\s+/)
          .filter((sentence) => {
            const found = threatsIn(sentence);
            removed.push(...found);
            return found.length === 0;
          })
          .join(" "),
      )
      .join("\n");
    return { sanitized, removed };
  }
}
