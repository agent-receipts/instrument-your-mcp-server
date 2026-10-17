// How the demo clients decide what to launch.
//
// Both demo scripts take either a server path:
//
//   npm run heist -- solution/server.ts
//
// or, after `--via`, a proxy command, then `--`, then the server command —
// which is how you put a proxy in front of the server and attack the stack
// rather than the server:
//
//   npm run heist -- --via pipelock mcp proxy --config stacking/pipelock.yaml -- npx tsx solution/server.ts
//
// The truck speaks HTTP (src/http.ts), so the client starts both: the server
// on one free port, then the proxy on another with `--listen 127.0.0.1:<port>
// --upstream <server url>` appended, and talks to the proxy. The OAuth token
// comes from the server itself; the proxy only sees MCP traffic, bearer
// header included (see connect.ts).

export interface Spawn {
  command: string;
  args: string[];
  label: string;
  /** A reverse proxy to put between client and server, when `--via` is given. */
  proxy?: { command: string; args: string[] };
}

export function spawnFromArgv(argv: string[], fallback = "src/server.ts"): Spawn {
  const via = argv.indexOf("--via");
  if (via !== -1) {
    const rest = argv.slice(via + 1).filter((a) => a.length > 0);
    const split = rest.indexOf("--");
    const proxy = split === -1 ? [] : rest.slice(0, split);
    const server = split === -1 ? [] : rest.slice(split + 1);
    if (!proxy[0] || !server[0]) {
      throw new Error(
        "--via needs a proxy command, then --, then the server command, e.g. " +
          "--via pipelock mcp proxy --config stacking/pipelock.yaml -- npx tsx solution/server.ts",
      );
    }
    return {
      command: server[0],
      args: server.slice(1),
      label: rest.join(" "),
      proxy: { command: proxy[0], args: proxy.slice(1) },
    };
  }
  const target = argv.find((a) => a.endsWith(".ts")) ?? fallback;
  return { command: "npx", args: ["tsx", target], label: target };
}
