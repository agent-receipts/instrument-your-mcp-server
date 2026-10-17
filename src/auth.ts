// A pocket OAuth authorization server, so the truck can sit behind bearer
// auth without anyone setting up an identity provider.
//
// LOCAL DEMOS ONLY. It auto-approves every authorization request: there is no
// login page and no consent screen, so anyone who can reach the port can get
// a token. Everything lives in memory and is gone when the server stops.
//
// What it does do properly is the part the workshop cares about: every client
// that registers (dynamic client registration) gets its own client_id, and
// the access token it ends up with says which client it was issued to. Two
// clients are two callers, and callerId() in src/server.ts can tell them
// apart. PKCE is checked by the SDK's token handler against the challenge
// stored here.
//
// You don't edit this file in the workshop.

import { randomBytes, randomUUID } from "node:crypto";

import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

const TOKEN_LIFETIME_SECONDS = 60 * 60;

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    // The SDK's registration handler normally fills these in; doing it here
    // as well keeps the store correct on its own.
    const full = {
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...client,
    } as OAuthClientInformationFull;
    this.clients.set(full.client_id, full);
    return full;
  }
}

interface PendingCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource?: URL;
}

export class DemoAuthProvider implements OAuthServerProvider {
  readonly clientsStore = new InMemoryClientsStore();
  private codes = new Map<string, PendingCode>();
  private tokens = new Map<string, AuthInfo>();

  /** Auto-approves: no login, no consent. Straight back to the client with a code. */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Parameters<OAuthServerProvider["authorize"]>[2]): Promise<void> {
    const code = randomBytes(16).toString("hex");
    this.codes.set(code, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? [],
      ...(params.resource ? { resource: params.resource } : {}),
    });
    const target = new URL(params.redirectUri);
    target.searchParams.set("code", code);
    if (params.state !== undefined) target.searchParams.set("state", params.state);
    res.redirect(302, target.href);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    const pending = this.codes.get(code);
    if (!pending || pending.clientId !== client.client_id) throw new InvalidGrantError("unknown authorization code");
    return pending.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const pending = this.codes.get(code);
    if (!pending || pending.clientId !== client.client_id) throw new InvalidGrantError("unknown authorization code");
    if (redirectUri !== undefined && redirectUri !== pending.redirectUri) {
      throw new InvalidGrantError("redirect_uri doesn't match the authorization request");
    }
    this.codes.delete(code); // one use only

    // Opaque token: a random string that means something only to this map.
    const token = randomBytes(32).toString("hex");
    this.tokens.set(token, {
      token,
      clientId: client.client_id,
      scopes: pending.scopes,
      expiresAt: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
      ...(pending.resource ? { resource: pending.resource } : {}),
    });
    return {
      access_token: token,
      token_type: "bearer",
      expires_in: TOKEN_LIFETIME_SECONDS,
      ...(pending.scopes.length > 0 ? { scope: pending.scopes.join(" ") } : {}),
    };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new InvalidGrantError("this demo server doesn't issue refresh tokens; register and authorize again");
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const info = this.tokens.get(token);
    if (!info) throw new InvalidTokenError("unknown access token");
    return info;
  }
}
