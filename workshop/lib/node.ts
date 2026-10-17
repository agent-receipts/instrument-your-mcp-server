// The oldest Node the workshop runs on.
//
// @obsigna/sdk-ts imports node:sqlite, which only loads without a flag from
// Node 22.13. On anything older, step 3 can't run at all.

export const MIN_NODE = "22.13.0";

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
