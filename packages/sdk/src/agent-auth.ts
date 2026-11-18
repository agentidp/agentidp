import { randomBytes } from "node:crypto";
import { SignJWT, type JWTPayload } from "jose";

import { exchangeToken, registerAgentPublicKey } from "./exchange.js";
import { assertPublicJwk, importPrivateKey, toPublicJwk } from "./keys.js";
import { createProofJwt } from "./proof.js";
import {
  AIT_TYP,
  DEFAULT_REGISTRY_URL,
  DEFAULT_TOKEN_LIFETIME_SECONDS,
  MAX_TOKEN_LIFETIME_SECONDS,
  type AgentAuthOptions,
  type AitClaims,
  type FetchLike,
  type GetTokenOptions,
  type TokenExchangeResponse,
} from "./types.js";

function envRegistryUrl(): string | undefined {
  const value = process.env.AGENTIDP_REGISTRY_URL?.trim();
  return value && value.length > 0 ? value : undefined;
}

function envApiKey(): string | undefined {
  const value = process.env.AGENTIDP_API_KEY?.trim();
  return value && value.length > 0 ? value : undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function generateJti(): string {
  return `tok_${randomBytes(16).toString("hex")}`;
}

function requireAudience(audience: string | undefined): string {
  if (typeof audience !== "string" || audience.trim().length === 0) {
    throw new Error("getToken requires a non-empty audience");
  }
  return audience;
}

function resolveLifetime(expiresInSeconds?: number): number {
  const lifetime = expiresInSeconds ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
  if (!Number.isFinite(lifetime) || lifetime <= 0) {
    throw new Error("expiresInSeconds must be a positive number");
  }
  if (lifetime > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error(
      `AgentIDP token lifetime must be at most ${MAX_TOKEN_LIFETIME_SECONDS} seconds (24h)`,
    );
  }
  return Math.trunc(lifetime);
}

/**
 * Obtain AgentIDP tokens.
 *
 * When `apiKey` (or `AGENTIDP_API_KEY`) is set, `getToken` builds a proof JWT
 * and calls `POST /api/v1/tokens/exchange`. Without an API key it still signs
 * locally with the agent private key. Local minting is not the registry path.
 */
export class AgentAuth {
  readonly agentId: string;
  readonly registryUrl: string;
  readonly keyId?: string;
  readonly agentName?: string;
  readonly agentVersion?: string;
  readonly agentDescription?: string;
  readonly ownerId?: string;
  readonly ownerName?: string;
  readonly ownerType?: AgentAuthOptions["ownerType"];
  readonly verificationLevel?: AgentAuthOptions["verificationLevel"];

  private readonly privateKey: AgentAuthOptions["privateKey"];
  private readonly apiKey?: string;
  private readonly fetchImpl?: FetchLike;
  private imported?: Awaited<ReturnType<typeof importPrivateKey>>;

  constructor(options: AgentAuthOptions) {
    if (!options?.agentId?.trim()) {
      throw new Error("agentId is required");
    }
    if (options.privateKey == null || options.privateKey === "") {
      throw new Error("privateKey is required");
    }

    this.agentId = options.agentId.trim();
    this.privateKey = options.privateKey;
    this.registryUrl = stripTrailingSlash(
      options.registryUrl?.trim() || envRegistryUrl() || DEFAULT_REGISTRY_URL,
    );
    this.apiKey = options.apiKey?.trim() || envApiKey();
    this.fetchImpl = options.fetch;
    this.keyId = options.keyId?.trim() || undefined;
    this.agentName = options.agentName;
    this.agentVersion = options.agentVersion;
    this.agentDescription = options.agentDescription;
    this.ownerId = options.ownerId;
    this.ownerName = options.ownerName;
    this.ownerType = options.ownerType;
    this.verificationLevel = options.verificationLevel;
  }

  private async loadKey() {
    if (!this.imported) {
      this.imported = await importPrivateKey(this.privateKey);
    }
    return this.imported;
  }

  async createProofJwt(options?: {
    jti?: string;
    lifetimeSeconds?: number;
    now?: number;
  }): Promise<string> {
    return createProofJwt({
      agentId: this.agentId,
      privateKey: this.privateKey,
      registryUrl: this.registryUrl,
      keyId: this.keyId,
      jti: options?.jti,
      lifetimeSeconds: options?.lifetimeSeconds,
      now: options?.now,
    });
  }

  async registerPublicKey(): Promise<void> {
    if (!this.apiKey) {
      throw new Error("apiKey is required to register a public JWK");
    }
    const imported = await this.loadKey();
    if (!imported.jwk) {
      throw new Error(
        "registerPublicKey requires a JWK privateKey so the public members can be derived",
      );
    }
    await registerAgentPublicKey({
      agentId: this.agentId,
      publicKey: assertPublicJwk(toPublicJwk(imported.jwk)),
      apiKey: this.apiKey,
      registryUrl: this.registryUrl,
      fetch: this.fetchImpl,
    });
  }

  async exchangeToken(options: GetTokenOptions): Promise<TokenExchangeResponse> {
    if (!this.apiKey) {
      throw new Error(
        "apiKey is required for token exchange (pass apiKey or set AGENTIDP_API_KEY)",
      );
    }
    const audience = requireAudience(options.audience);
    const proof = await this.createProofJwt();
    return exchangeToken({
      agentId: this.agentId,
      audience,
      proof,
      apiKey: this.apiKey,
      registryUrl: this.registryUrl,
      scopes: options.capabilities,
      lifetimeSeconds: options.expiresInSeconds,
      delegationChain: options.delegationChain,
      fetch: this.fetchImpl,
    });
  }

  async getToken(options: GetTokenOptions): Promise<string> {
    if (this.apiKey) {
      const minted = await this.exchangeToken(options);
      return minted.token;
    }
    return this.mintLocal(options);
  }

  /**
   * Sign a token with the agent private key. This is not
   * `POST /api/v1/tokens/exchange`. Prefer `exchangeToken` against a registry.
   */
  async mintLocal(options: GetTokenOptions): Promise<string> {
    const audience = requireAudience(options.audience);
    const lifetime = resolveLifetime(options.expiresInSeconds);
    const imported = await this.loadKey();
    const now = Math.floor(Date.now() / 1000);
    const jti = generateJti();
    const kid = this.keyId ?? imported.kid ?? this.agentId;

    const claims: JWTPayload = {
      agent_id: this.agentId,
      iss: this.registryUrl,
      jti,
    };

    if (this.agentName !== undefined) claims.agent_name = this.agentName;
    if (this.agentVersion !== undefined) claims.agent_version = this.agentVersion;
    if (this.agentDescription !== undefined) {
      claims.agent_description = this.agentDescription;
    }
    if (this.ownerId !== undefined) claims.owner_id = this.ownerId;
    if (this.ownerName !== undefined) claims.owner_name = this.ownerName;
    if (this.ownerType !== undefined) claims.owner_type = this.ownerType;
    if (this.verificationLevel !== undefined) {
      claims.verification_level = this.verificationLevel;
    }
    if (options.capabilities !== undefined) {
      claims.capabilities = options.capabilities;
    }

    return new SignJWT(claims)
      .setProtectedHeader({
        alg: imported.alg,
        typ: AIT_TYP,
        kid,
      })
      .setSubject(this.agentId)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + lifetime)
      .sign(imported.key);
  }
}

/** Decode AgentIDP token claims without verifying the signature. */
export function decodeAitClaims(token: string): AitClaims {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("token is not a compact JWT");
  }
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as AitClaims;
}
