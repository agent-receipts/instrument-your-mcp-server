// Paths for the workshop scripts, resolved from this file rather than the
// current directory, so they behave the same wherever they are run from.

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { spawnFromArgv, type Spawn } from "../../examples/spawn.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function at(...parts: string[]): string {
  return resolve(ROOT, ...parts);
}

/** Import one of the attendee's files by path relative to the project folder. */
export async function importFrom<T>(relPath: string): Promise<T> {
  return (await import(pathToFileURL(at(relPath)).href)) as T;
}

/** The attendee's server, which is what every check attacks. */
export function serverSpawn(): Spawn {
  return spawnFromArgv([], "src/server.ts");
}
