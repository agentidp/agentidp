import { importJWK, type CryptoKey, type JWK } from "jose";

import { TtlCache } from "./cache.js";
import { AgentIdError } from "./errors.js";
import {
  DEFAULT_JWKS_PATH,
  DEFAULT_KEY_CACHE_TTL_SECONDS,
  DEFAULT_REGISTRY_URL,
  type FetchLike,
  type JwtHeader,
  type JwtPayload,
  type KeyMaterial,
} from "./types.js";

const defaultFetch: FetchLike = async (input) => {
  const response = await fetch(input);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
  };
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function envRegistryUrl(): string | undefined {
  const value = process.env.AGENTIDP_REGISTRY_URL?.trim();
  return value && value.length > 0 ? value : undefined;
}

function envJwksUri(): string | undefined {
  const value = process.env.AGENTIDP_JWKS_URI?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function resolveRegistryUrl(explicit?: string): string {
  return stripTrailingSlash(
    explicit?.trim() || envRegistryUrl() || DEFAULT_REGISTRY_URL,
  );
}

export function resolveJwksUri(
  registryUrl: string,
  explicit?: string,
): string {
  if (explicit?.trim()) return explicit.trim();
  const fromEnv = envJwksUri();
  if (fromEnv) return fromEnv;
  return `${registryUrl}${DEFAULT_JWKS_PATH}`;
}

function asJwkSet(body: unknown): JWK[] {
  if (Array.isArray(body)) {
    return body.filter((item): item is JWK => Boolean(item && typeof item === "object"));
  }
  if (body && typeof body === "object" && "keys" in body) {
    const keys = (body as { keys?: unknown }).keys;
    if (Array.isArray(keys)) {
      return keys.filter((item): item is JWK => Boolean(item && typeof item === "object"));
    }
  }
  if (body && typeof body === "object" && "kty" in body) {
    return [body as JWK];
  }
  return [];
}

function findKey(keys: JWK[], kid?: string): JWK | undefined {
  if (kid) {
    const match = keys.find((key) => key.kid === kid);
    if (match) return match;
  }
  return keys.length === 1 ? keys[0] : undefined;
}

export class RegistryKeySource {
  private readonly jwksCache = new TtlCache<JWK[]>();
  private readonly keyCache = new TtlCache<JWK>();
  private readonly statusCache = new TtlCache<string>();
  private readonly ownerCache = new TtlCache<Record<string, unknown>>();

  constructor(
    private readonly fetchImpl: FetchLike = defaultFetch,
    private readonly ttlSeconds = DEFAULT_KEY_CACHE_TTL_SECONDS,
  ) {}

  ttlMs(now = Date.now(), expSeconds?: number): number {
    const configured = this.ttlSeconds * 1000;
    if (typeof expSeconds !== "number") return configured;
    const remaining = expSeconds * 1000 - now;
    if (remaining <= 0) return 0;
    return Math.min(configured, remaining);
  }

  async getKeyFromJwks(
    jwksUri: string,
    header: JwtHeader,
    forceRefresh = false,
  ): Promise<JWK | undefined> {
    const cached = forceRefresh ? undefined : this.jwksCache.get(jwksUri);
    const keys = cached ?? (await this.loadJwks(jwksUri));
    let key = findKey(keys, header.kid);
    if (!key && !forceRefresh) {
      const refreshed = await this.loadJwks(jwksUri);
      key = findKey(refreshed, header.kid);
    }
    return key;
  }

  async getAgentPublicKey(
    registryUrl: string,
    agentId: string,
    expSeconds?: number,
  ): Promise<JWK | undefined> {
    const cacheKey = `agent-key:${registryUrl}:${agentId}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached) return cached;

    const paths = [
      `${registryUrl}/v1/agents/${encodeURIComponent(agentId)}/public-key`,
      `${registryUrl}/api/v1/agents/${encodeURIComponent(agentId)}/public-key`,
    ];

    for (const url of paths) {
      const body = await this.getJson(url);
      if (!body) continue;
      if (this.isErrorBody(body)) {
        this.throwStatusError(body);
      }
      const keys = asJwkSet(body);
      const jwk = keys[0];
      if (jwk) {
        const ttl = this.ttlMs(Date.now(), expSeconds);
        if (ttl > 0) this.keyCache.set(cacheKey, jwk, ttl);
        return jwk;
      }
    }
    return undefined;
  }

  async getAgentStatus(
    registryUrl: string,
    agentId: string,
    expSeconds?: number,
  ): Promise<string | undefined> {
    const cacheKey = `status:${registryUrl}:${agentId}`;
    const cached = this.statusCache.get(cacheKey);
    if (cached) return cached;

    const paths = [
      `${registryUrl}/v1/agents/${encodeURIComponent(agentId)}/status`,
      `${registryUrl}/api/v1/agents/${encodeURIComponent(agentId)}/status`,
    ];

    for (const url of paths) {
      const body = await this.getJson(url);
      if (!body || typeof body !== "object") continue;
      if (this.isErrorBody(body)) {
        this.throwStatusError(body);
      }
      const status = (body as { status?: unknown }).status;
      if (typeof status === "string") {
        const ttl = this.ttlMs(Date.now(), expSeconds);
        if (ttl > 0) this.statusCache.set(cacheKey, status, ttl);
        return status;
      }
    }
    return undefined;
  }

  async lookupOwner(
    registryUrl: string,
    agentId: string,
    expSeconds?: number,
  ): Promise<{ owner_id?: string; owner_name?: string; owner_type?: string; verification_level?: unknown } | undefined> {
    const cacheKey = `owner:${registryUrl}:${agentId}`;
    const cached = this.ownerCache.get(cacheKey);
    if (cached) return cached as { owner_id?: string; owner_name?: string; owner_type?: string; verification_level?: unknown };

    const paths = [
      `${registryUrl}/v1/agents/${encodeURIComponent(agentId)}`,
      `${registryUrl}/api/v1/agents/${encodeURIComponent(agentId)}`,
    ];

    for (const url of paths) {
      const body = await this.getJson(url);
      if (!body || typeof body !== "object") continue;
      const owner = (body as { owner?: Record<string, unknown> }).owner;
      if (!owner) continue;
      const value = {
        owner_id: typeof owner.owner_id === "string" ? owner.owner_id : undefined,
        owner_name:
          typeof owner.owner_name === "string" ? owner.owner_name : undefined,
        owner_type:
          typeof owner.owner_type === "string" ? owner.owner_type : undefined,
        verification_level: owner.verification_level,
      };
      const ttl = this.ttlMs(Date.now(), expSeconds);
      if (ttl > 0) this.ownerCache.set(cacheKey, value, ttl);
      return value;
    }
    return undefined;
  }

  private async loadJwks(jwksUri: string): Promise<JWK[]> {
    const body = await this.getJson(jwksUri);
    const keys = asJwkSet(body);
    this.jwksCache.set(jwksUri, keys, this.ttlSeconds * 1000);
    return keys;
  }

  private async getJson(url: string): Promise<unknown | undefined> {
    try {
      const response = await this.fetchImpl(url);
      if (!response.ok) {
        if (response.status === 404) return undefined;
        try {
          return await response.json();
        } catch {
          return undefined;
        }
      }
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private isErrorBody(body: unknown): body is { error: string } {
    return Boolean(
      body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string" &&
        String((body as { error: string }).error).startsWith("AID-"),
    );
  }

  private throwStatusError(body: { error: string }): never {
    if (body.error === "AID-003") throw new AgentIdError("AID-003");
    if (body.error === "AID-004") throw new AgentIdError("AID-004");
    throw new AgentIdError("AID-001", body.error);
  }
}

function isJwk(key: KeyMaterial): key is JWK {
  return typeof key === "object" && key !== null && "kty" in key;
}

export async function materializeKey(
  key: KeyMaterial,
): Promise<CryptoKey | Uint8Array> {
  if (isJwk(key)) return importJWK(key, "ES256");
  return key;
}

export async function resolveVerifyKey(input: {
  header: JwtHeader;
  payload: JwtPayload;
  getKey?: (header: JwtHeader, payload: JwtPayload) => Promise<KeyMaterial | undefined> | KeyMaterial | undefined;
  source: RegistryKeySource;
  registryUrl: string;
  jwksUri: string;
  expSeconds?: number;
}): Promise<CryptoKey | Uint8Array> {
  if (input.getKey) {
    const provided = await input.getKey(input.header, input.payload);
    if (provided) return materializeKey(provided);
  }

  const fromJwks = await input.source.getKeyFromJwks(input.jwksUri, input.header);
  if (fromJwks) return materializeKey(fromJwks);

  const agentId =
    typeof input.payload.agent_id === "string"
      ? input.payload.agent_id
      : typeof input.payload.sub === "string"
        ? input.payload.sub
        : undefined;

  if (agentId) {
    const agentKey = await input.source.getAgentPublicKey(
      input.registryUrl,
      agentId,
      input.expSeconds,
    );
    if (agentKey) return materializeKey(agentKey);
  }

  throw new AgentIdError("AID-001", "signing key not found");
}
