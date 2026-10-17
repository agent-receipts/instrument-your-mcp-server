// Serves an MCP Server over Streamable HTTP on localhost, behind bearer auth.
//
// The truck's handlers don't change for this: they still live on one Server
// in src/server.ts. This file puts an HTTP front door on it:
//
//   /.well-known/...  /authorize  /token  /register   the OAuth server (src/auth.ts)
//   /mcp                                             MCP, bearer token required
//
// Binds to 127.0.0.1 only. The port comes from --port <n>, then PORT, then
// 3333. The demo clients pick a free port and start the server themselves, so
// you rarely run this directly.
//
// You don't edit this file in the workshop.

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { DemoAuthProvider } from "./auth.js";

const HOST = "127.0.0.1";

// express ships without type declarations here, so name what the handlers
// need from the transport's own signature instead.
type McpRequest = Parameters<StreamableHTTPServerTransport["handleRequest"]>[0] & { body?: unknown };
type McpResponse = Parameters<StreamableHTTPServerTransport["handleRequest"]>[1];

function portFromArgs(): number {
  const flag = process.argv.indexOf("--port");
  const raw = flag !== -1 ? process.argv[flag + 1] : process.env.PORT;
  const port = Number(raw ?? 3333);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`not a port: ${raw}`);
  return port;
}

export async function serveHttp(server: Server, label: string): Promise<void> {
  const port = portFromArgs();
  const base = new URL(`http://${HOST}:${port}`);
  const mcpUrl = new URL("/mcp", base);
  const provider = new DemoAuthProvider();

  const app = createMcpExpressApp({ host: HOST });
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: base,
      resourceServerUrl: mcpUrl,
      resourceName: "scoop-truck",
      // The hammer is one client making ten thousand calls; the limits that
      // matter are the ones you add to the tool handler, not these.
      authorizationOptions: { rateLimit: false },
      clientRegistrationOptions: { rateLimit: false },
      tokenOptions: { rateLimit: false },
      revocationOptions: { rateLimit: false },
    }),
  );
  const auth = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
  });

  // Stateless: each POST is a self-contained exchange, and the token on it
  // says who is calling. A Server holds one transport at a time, so requests
  // take turns rather than each getting a Server of its own. That keeps every
  // handler in src/server.ts on the one Server you can read top to bottom.
  let queue: Promise<void> = Promise.resolve();
  app.post("/mcp", auth, (req: McpRequest, res: McpResponse) => {
    const turn = queue.then(async () => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } finally {
        await server.close();
      }
    });
    queue = turn.catch((err: unknown) => {
      console.error(`${label}: request failed:`, err);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });
  // No server-to-client stream and no sessions to end.
  const postOnly = (_req: McpRequest, res: McpResponse) => res.writeHead(405, { Allow: "POST" }).end();
  app.get("/mcp", postOnly);
  app.delete("/mcp", postOnly);

  await new Promise<void>((resolve, reject) => {
    const listener = app.listen(port, HOST, () => {
      const address = listener.address();
      const actual = typeof address === "object" && address ? address.port : port;
      // The demo clients wait for this line, and read the URL from it.
      console.error(`${label} listening on http://${HOST}:${actual}/mcp`);
      resolve();
    });
    listener.on("error", reject);
  });

  // Started by a demo client: go when it does, even if it can't say goodbye.
  if (process.env.SCOOP_EXIT_WITH_PARENT === "1") {
    process.stdin.on("end", () => process.exit(0));
    process.stdin.resume();
  }
}
