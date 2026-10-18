// A bearer token for a truck you started yourself, for tools that can't do
// the OAuth dance on their own (promptfoo, curl, an MCP inspector).
//
//   npm run server                    # in one terminal
//   npm run -s token                  # in another: prints the token, nothing else
//   npm run -s token -- --port 4000   # if you started the server on another port
//
// It does what every demo script does before it connects (connect.ts):
// registers as a new client, authorizes, and swaps the code for a token. The
// token lasts an hour, and only as long as that server keeps running: the
// truck keeps its tokens in memory, so restart it and you need a new one.

import { getToken } from "./connect.js";

const flag = process.argv.indexOf("--port");
const port = flag !== -1 ? process.argv[flag + 1] : (process.env.PORT ?? "3333");
const url = new URL(`http://127.0.0.1:${port}/mcp`);

getToken(url, "token")
  .then((token) => console.log(token))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`couldn't get a token from ${url.href}: ${message}`);
    console.error("Is the truck running? Start it with `npm run server` first.");
    process.exit(1);
  });
