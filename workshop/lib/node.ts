// The oldest Node the workshop runs on.
//
// @obsigna/sdk-ts imports node:sqlite, which only loads without a flag from
// Node 22.13; undici (a dependency) asks for 22.19, and promptfoo (step 7)
// for 22.22. One floor for everything: 22.22. The current LTS, 24, is fine.

export const MIN_NODE = "22.22.0";

export function nodeSupported(version: string): boolean {
  const have = version.replace(/^v/, "").split(".").map(Number);
  const need = MIN_NODE.split(".").map(Number);
  for (let i = 0; i < need.length; i++) {
    const h = have[i] ?? 0;
    const n = need[i] ?? 0;
    if (h !== n) return h > n;
  }
  return true;
}
