// npm run preflight
//
// Run this before the workshop. It checks your Node version, that
// npm install worked, and that the ice cream truck starts and answers.

import { MIN_NODE, nodeSupported } from "./lib/node.js";
import { ROOT, serverSpawn } from "./lib/paths.js";

let failed = false;

function report(ok: boolean, what: string, fix?: string): void {
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) {
    failed = true;
    if (fix) console.log(`      ${fix.split("\n").join("\n      ")}`);
  }
}

async function main(): Promise<void> {
  const nodeOk = nodeSupported(process.versions.node);
  report(
    nodeOk,
    `Node ${process.versions.node}`,
    `The workshop needs Node ${MIN_NODE} or newer. Download it from https://nodejs.org`,
  );

  let depsError: string | null = null;
  try {
    await import("@modelcontextprotocol/sdk/client/index.js");
    await import("@obsigna/sdk-ts");
  } catch (err: unknown) {
    depsError = (err instanceof Error ? err.message : String(err)).split("\n")[0] ?? "";
  }
  const depsOk = depsError === null;
  report(
    depsOk,
    "dependencies installed",
    nodeOk
      ? `${depsError}\nRun npm install in this folder (the one with package.json), then try again.`
      : `${depsError}\nThis is probably the Node version above. Upgrade Node first.`,
  );

  if (depsOk) {
    // Imported here rather than at the top, so a missing dependency is
    // reported above instead of crashing this script before it starts.
    const { withClient, textOf } = await import("../examples/attacks.js");
    try {
      const text = await withClient(
        serverSpawn(),
        "preflight",
        { cwd: ROOT, quiet: true, timeoutMs: 30_000 },
        async (client) => textOf(await client.callTool({ name: "list_flavors", arguments: {} })),
      );
      report(text.includes("vanilla"), "the truck starts and lists its flavours", `Unexpected answer: ${text}`);
    } catch (err: unknown) {
      report(false, "the truck starts and lists its flavours", err instanceof Error ? err.message : String(err));
    }
  }

  console.log(failed ? "\nFix the FAIL lines above, then run npm run preflight again." : "\nYou're ready.");
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
