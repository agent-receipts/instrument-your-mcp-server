// "What's on the truck today?"
//
// Asks the server for the menu and prints exactly what would reach the
// model. One of the flavours comes from the supplier's feed, and its
// description has a note for AI assistants in it. Step 5 is about that note.
//
//   npm run menu                          # the uninstrumented truck
//   npm run menu -- solution/server.ts    # the instrumented one

import { textOf, withClient } from "./attacks.js";
import { spawnFromArgv } from "./spawn.js";

async function main(): Promise<void> {
  const spawn = spawnFromArgv(process.argv.slice(2));
  console.log(`\nasking ${spawn.label} for the menu\n`);
  const { text, isError } = await withClient(spawn, "menu", {}, async (client) => {
    const result = await client.callTool({ name: "list_flavors", arguments: {} });
    return { text: textOf(result), isError: result.isError === true };
  });
  console.log(isError ? `REFUSED  ${text}` : text);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
