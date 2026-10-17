// Starting the truck and getting in, for the demo clients.
//
// The truck serves MCP over HTTP behind OAuth (src/http.ts). So that every
// demo is still one npm command, the client does the whole dance itself:
//
//   1. pick a free port on 127.0.0.1 and start the server on it
//   2. wait for the server to say it's listening
//   3. register as a new OAuth client, authorize (the demo server approves
//      without asking), and swap the code for a token, with PKCE
//   4. connect over Streamable HTTP with that token
//
// and stops the server again afterwards. Each run registers afresh, so each
// run is a new caller as far as the server can tell.

import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

import {
  discoverAuthorizationServerMetadata,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";

import type { Spawn } from "./spawn.js";

const HOST = "127.0.0.1";
// Nothing listens here. The authorization server redirects to it with the
// code in the query string, and we read the code off the redirect instead of
// following it.
const REDIRECT_URI = `http://${HOST}/callback`;

export interface RunningServer {
  url: URL;
  /** The last couple of thousand characters the server wrote to stderr. */
  stderr: () => string;
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, HOST, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/** Starts the server on a free port and resolves once it says it's listening. */
export async function startServer(
  spawn: Spawn,
  opts: { cwd?: string; quiet?: boolean; timeoutMs?: number },
): Promise<RunningServer> {
  const port = await freePort();
  return launch(spawn.command, spawn.args, spawn.label, {
    ...opts,
    env: { PORT: String(port), SCOOP_EXIT_WITH_PARENT: "1" },
    // stdin is how the server knows we've gone (src/http.ts).
    stopBy: "stdin",
    listening: (text) => {
      const match = /listening on (http:\/\/\S+\/mcp)/.exec(text);
      return match?.[1] ? new URL(match[1]) : undefined;
    },
  });
}

/**
 * Starts the `--via` proxy on a free port in front of a running server. The
 * proxy command gets `--listen 127.0.0.1:<port> --upstream <url>` appended,
 * which is Pipelock's HTTP-to-HTTP mode (`pipelock mcp proxy --help`). Only
 * /mcp goes through it: the OAuth endpoints stay on the server, so getToken()
 * is pointed at the server, and the token then rides through the proxy as an
 * ordinary Authorization header.
 */
export async function startProxy(
  spawn: Spawn,
  upstream: URL,
  opts: { cwd?: string; quiet?: boolean; timeoutMs?: number },
): Promise<RunningServer | undefined> {
  if (!spawn.proxy) return undefined;
  const port = await freePort();
  const url = new URL(`http://${HOST}:${port}/mcp`);
  const args = [...spawn.proxy.args, "--listen", `${HOST}:${port}`, "--upstream", upstream.href];
  return launch(spawn.proxy.command, args, spawn.proxy.command, {
    ...opts,
    stopBy: "signal",
    listening: (text) => (/proxy listening on /.test(text) ? url : undefined),
  });
}

async function launch(
  command: string,
  args: string[],
  label: string,
  opts: {
    cwd?: string;
    quiet?: boolean;
    timeoutMs?: number;
    env?: Record<string, string>;
    stopBy: "stdin" | "signal";
    listening: (output: string) => URL | undefined;
  },
): Promise<RunningServer> {
  const child: ChildProcess = spawnChild(command, args, {
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    env: { ...process.env, ...opts.env },
    // What it prints is how we know it's up.
    stdio: ["pipe", opts.stopBy === "stdin" ? "ignore" : "pipe", "pipe"],
  });
  let tail = "";
  let seen = "";

  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));

  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (opts.stopBy === "stdin") child.stdin?.end();
    else child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(timer);
  };

  const url = await new Promise<URL>((resolve, reject) => {
    const timer = setTimeout(() => {
      void stop();
      reject(new Error(`${label} didn't start listening within ${(opts.timeoutMs ?? 60_000) / 1000}s`));
    }, opts.timeoutMs ?? 60_000);
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (!opts.quiet) process.stderr.write(text);
      tail = (tail + text).slice(-2000);
      seen += text;
      const found = opts.listening(seen);
      if (found) {
        seen = "";
        clearTimeout(timer);
        resolve(found);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${label} exited (${code}) before it was listening`));
    });
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(tail.trim() ? `${message}\n--- server stderr (last lines) ---\n${tail.trim()}` : message);
  });

  return { url, stderr: () => tail, stop };
}

/**
 * fetch, but each request gets its own AbortSignal, chained to the one the
 * transport passes in. The transport hands the same signal to every POST, and
 * fetch only lets go of its listener on it when the request is garbage
 * collected; ten thousand hammer calls in two seconds outrun that and trip
 * Node's leak warning. Here the listener is removed as soon as fetch returns.
 */
export async function fetchWithOwnSignal(url: string | URL, init?: RequestInit): Promise<Response> {
  const outer = init?.signal;
  if (!outer) return fetch(url, init);
  const inner = new AbortController();
  const forward = () => inner.abort(outer.reason);
  outer.addEventListener("abort", forward, { once: true });
  try {
    return await fetch(url, { ...init, signal: inner.signal });
  } finally {
    outer.removeEventListener("abort", forward);
  }
}

/**
 * Register, authorize and exchange, with no browser: the demo server
 * approves every request, so the authorize step is one redirect to read.
 */
export async function getToken(mcpUrl: URL, clientName: string): Promise<string> {
  const issuer = new URL("/", mcpUrl);
  const metadata = await discoverAuthorizationServerMetadata(issuer);
  if (!metadata) throw new Error(`no OAuth metadata at ${issuer.href}`);

  const clientInformation = await registerClient(issuer, {
    metadata,
    clientMetadata: {
      client_name: clientName,
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });

  const { authorizationUrl, codeVerifier } = await startAuthorization(issuer, {
    metadata,
    clientInformation,
    redirectUrl: REDIRECT_URI,
    resource: mcpUrl,
  });
  const res = await fetch(authorizationUrl, { redirect: "manual" });
  const location = res.headers.get("location");
  const code = location ? new URL(location).searchParams.get("code") : null;
  if (!code) throw new Error(`authorization didn't return a code (HTTP ${res.status})`);

  const tokens = await exchangeAuthorization(issuer, {
    metadata,
    clientInformation,
    authorizationCode: code,
    codeVerifier,
    redirectUri: REDIRECT_URI,
    resource: mcpUrl,
  });
  return tokens.access_token;
}
