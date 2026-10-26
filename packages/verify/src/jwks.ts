import { importJWK, type CryptoKey, type JWK } from "jose";

import { TtlCache } from "./cache.js";
import { AgentIdError } from "./errors.js";
import {
  agentLookupUrls,
  agentPublicKeyUrls,
  agentStatusUrls,
} from "./registry.js";
import {
  DEFAULT_KEY_CACHE_TTL_SECONDS,
  DEFAULT_JWKS_PATH,
  DEFAULT_REGISTRY_URL,
  DEFAULT_REVOCATION_CACHE_TTL_SECONDS,
  type FetchHeaders,
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
    headers: response.headers,
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

function headerValue(
  headers: FetchHeaders | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find(
    (item) => item.toLowerCase() === name.toLowerCase(),
  );
  return key ? record[key] : undefined;
}

/** Honour a shorter Cache-Control max-age. Ignore a longer one. */
export function cacheTtlMs(
  configuredSeconds: number,
  cacheControl?: string,
): number {
  const configured = Math.max(0, configuredSeconds) * 1000;
  if (!cacheControl) return configured;
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
  if (!match) return configured;
  const fromHeader = Number(match[1]) * 1000;
  if (!Number.isFinite(fromHeader)) return configured;
  return Math.min(configured, fromHeader);
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

function statusFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const status = (body as { status?: unknown }).status;
  return typeof status === "string" ? status : undefined;
}

interface FetchedJson {
  body: unknown;
  status: number;
  ok: boolean;
  cacheControl?: string;
}

export class RegistryKeySource {
  private readonly jwksCache = new TtlCache<JWK[]>();
  private readonly keyCache = new TtlCache<JWK>();
  private readonly statusCache = new TtlCache<string>();
  private readonly ownerCache = new TtlCache<Record<string, unknown>>();

  constructor(
    private readonly fetchImpl: FetchLike = defaultFetch,
    private readonly ttlSeconds = DEFAULT_KEY_CACHE_TTL_SECONDS,
    private readonly revocationTtlSeconds = DEFAULT_REVOCATION_CACHE_TTL_SECONDS,
  ) {}

  /**
   * Revocation freshness: min(token remaining life, configured TTL).
   * Key cache uses configured TTL (and a shorter Cache-Control max-age).
   */
  ttlMs(now = Date.now(), expSeconds?: number, configuredSeconds = this.ttlSeconds): number {
    const configured = configuredSeconds * 1000;
    if (typeof expSeconds !== "number") return configured;
    const remaining = expSeconds * 1000 - now;
    if (remaining <= 0) return 0;
    return Math.min(configured, remaining);
  }

  async getKeyFromJwks(
    jwksUri: string,
    header: JwtHeader,
    forceRefresh = false,
    now = Date.now(),
  ): Promise<JWK | undefined> {
    const cached = forceRefresh ? undefined : this.jwksCache.get(jwksUri, now);
    const keys = cached ?? (await this.loadJwks(jwksUri, now));
    let key = findKey(keys, header.kid);
    if (!key && !forceRefresh) {
      const refreshed = await this.loadJwks(jwksUri, now);
      key = findKey(refreshed, header.kid);
    }
    return key;
  }

  async getAgentPublicKey(
    registryUrl: string,
    agentId: string,
    expSeconds?: number,
    now = Date.now(),
  ): Promise<JWK | undefined> {
    const cacheKey = `agent-key:${registryUrl}:${agentId}`;
    const cached = this.keyCache.get(cacheKey, now);
    if (cached) return cached;

    for (const url of agentPublicKeyUrls(registryUrl, agentId)) {
      const fetched = await this.getJson(url);
      if (!fetched) continue;
      if (this.isErrorBody(fetched.body)) {
        this.throwStatusError(fetched.body);
      }
      const keys = asJwkSet(fetched.body);
      const jwk = keys[0];
      if (jwk) {
        const ttl = Math.min(
          this.ttlMs(now, expSeconds, this.ttlSeconds),
          cacheTtlMs(this.ttlSeconds, fetched.cacheControl),
        );
        if (ttl > 0) this.keyCache.set(cacheKey, jwk, ttl, now);
        return jwk;
      }
    }
    return undefined;
  }

  async getAgentStatus(
    registryUrl: string,
    agentId: string,
    expSeconds?: number,
    now = Date.now(),
  ): Promise<string | undefined> {
    const cacheKey = `status:${registryUrl}:${agentId}`;
    const cached = this.statusCache.get(cacheKey, now);
    if (cached) return cached;

    const urls = [
      ...agentStatusUrls(registryUrl, agentId),
      ...agentLookupUrls(registryUrl, agentId),
    ];

    for (const url of urls) {
      const fetched = await this.getJson(url);
      if (!fetched) continue;
      if (this.isErrorBody(fetched.body)) {
        this.throwStatusError(fetched.body);
      }
      const status = statusFromBody(fetched.body);
      if (status) {
        const ttl = Math.min(
          this.ttlMs(now, expSeconds, this.revocationTtlSeconds),
          cacheTtlMs(this.revocationTtlSeconds, fetched.cacheControl),
        );
        if (ttl > 0) this.statusCache.set(cacheKey, status, ttl, now);
        return status;
      }
    }
    return undefined;
  }

  async lookupOwner(
    registryUrl: string,
    agentId: string,
    expSeconds?: number,
    now = Date.now(),
  ): Promise<{ owner_id?: string; owner_name?: string; owner_type?: string; verification_level?: unknown } | undefined> {
    const cacheKey = `owner:${registryUrl}:${agentId}`;
    const cached = this.ownerCache.get(cacheKey, now);
    if (cached) {
      return cached as {
        owner_id?: string;
        owner_name?: string;
        owner_type?: string;
        verification_level?: unknown;
      };
    }

    for (const url of agentLookupUrls(registryUrl, agentId)) {
      const fetched = await this.getJson(url);
      if (!fetched || !fetched.body || typeof fetched.body !== "object") continue;
      const owner = (fetched.body as { owner?: Record<string, unknown> }).owner;
      if (!owner) continue;
      const value = {
        owner_id: typeof owner.owner_id === "string" ? owner.owner_id : undefined,
        owner_name:
          typeof owner.owner_name === "string" ? owner.owner_name : undefined,
        owner_type:
          typeof owner.owner_type === "string" ? owner.owner_type : undefined,
        verification_level: owner.verification_level,
      };
      const ttl = Math.min(
        this.ttlMs(now, expSeconds, this.ttlSeconds),
        cacheTtlMs(this.ttlSeconds, fetched.cacheControl),
      );
      if (ttl > 0) this.ownerCache.set(cacheKey, value, ttl, now);
      return value;
    }
    return undefined;
  }

  private async loadJwks(jwksUri: string, now = Date.now()): Promise<JWK[]> {
    const fetched = await this.getJson(jwksUri);
    if (!fetched) return [];
    const keys = asJwkSet(fetched.body);
    const ttl = cacheTtlMs(this.ttlSeconds, fetched.cacheControl);
    if (ttl > 0) this.jwksCache.set(jwksUri, keys, ttl, now);
    return keys;
  }

  private async getJson(url: string): Promise<FetchedJson | undefined> {
    try {
      const response = await this.fetchImpl(url);
      const cacheControl = headerValue(response.headers, "cache-control");
      if (!response.ok) {
        if (response.status === 404) return undefined;
        try {
          return {
            body: await response.json(),
            status: response.status,
            ok: false,
            cacheControl,
          };
        } catch {
          return undefined;
        }
      }
      return {
        body: await response.json(),
        status: response.status,
        ok: true,
        cacheControl,
      };
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
  now?: number;
}): Promise<CryptoKey | Uint8Array> {
  if (input.getKey) {
    const provided = await input.getKey(input.header, input.payload);
    if (provided) return materializeKey(provided);
  }

  const now = input.now ?? Date.now();
  const fromJwks = await input.source.getKeyFromJwks(
    input.jwksUri,
    input.header,
    false,
    now,
  );
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
      now,
    );
    if (agentKey) return materializeKey(agentKey);
  }

  throw new AgentIdError("AID-001", "signing key not found");
}
