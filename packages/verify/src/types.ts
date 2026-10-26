import type { CryptoKey, JWK } from "jose";

export const DEFAULT_REGISTRY_URL = "https://registry.agentidp.dev";
export const DEFAULT_JWKS_PATH = "/.well-known/jwks.json";
export const DEFAULT_KEY_CACHE_TTL_SECONDS = 60 * 60;
/** Status / revocation cache. Registry sends Cache-Control max-age=60. */
export const DEFAULT_REVOCATION_CACHE_TTL_SECONDS = 60;
export const AIT_TYP = "AIT+jwt";

export type AccessTier = "open" | "authenticated" | "permissioned";
export type RateLimitScope = "agent_id" | "owner_id";

export interface RateLimitOptions {
  requestsPerHour: number;
  scope?: RateLimitScope;
}

export interface RateLimitStore {
  /**
   * Record one request in a sliding window and return the count in that window.
   * Implementations that cannot enforce a global limit should still increment
   * locally and document that behaviour.
   */
  hit(key: string, windowMs: number): Promise<number> | number;
}

export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
}

export interface JwtPayload {
  agent_id?: unknown;
  agent_name?: unknown;
  agent_version?: unknown;
  agent_description?: unknown;
  owner_id?: unknown;
  owner_name?: unknown;
  owner_type?: unknown;
  verification_level?: unknown;
  capabilities?: unknown;
  delegation_chain?: unknown;
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  iat?: unknown;
  exp?: unknown;
  jti?: unknown;
  [key: string]: unknown;
}

export type KeyMaterial = CryptoKey | JWK | Uint8Array;

export type GetKey = (
  header: JwtHeader,
  payload: JwtPayload,
) => Promise<KeyMaterial | undefined> | KeyMaterial | undefined;

export type FetchHeaders = Headers | Record<string, string>;

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  headers?: FetchHeaders;
}>;

export interface VerifyAgentTokenOptions {
  registryUrl?: string;
  jwksUri?: string;
  getKey?: GetKey;
  audience?: string | string[];
  requireAudience?: boolean;
  minVerificationLevel?: number;
  accessTier?: AccessTier;
  allowlist?: string[];
  requiredCapabilities?: string[];
  checkRevocation?: boolean;
  lookupOwner?: boolean;
  keyCacheTtlSeconds?: number;
  /** Status cache TTL. Freshness is min(token remaining life, this TTL, Cache-Control max-age). */
  revocationCacheTtlSeconds?: number;
  fetch?: FetchLike;
  now?: () => Date;
  clockToleranceSeconds?: number;
}

export interface AgentIdMiddlewareOptions extends VerifyAgentTokenOptions {
  rateLimit?: RateLimitOptions;
  rateLimitStore?: RateLimitStore;
}

export interface VerifiedAgent {
  agent_id: string;
  agent_name?: string;
  agent_version?: string;
  agent_description?: string;
  owner_id?: string;
  /** Present when the token (or optional lookup) supplies it. Never invented. */
  owner_name?: string;
  owner_type?: string;
  verification_level?: number | string;
  verificationLevel: number;
  capabilities?: string[];
  delegation_chain?: unknown[];
  iss?: string;
  sub?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
  jti?: string;
  token: string;
}

export type AgentIdErrorCode =
  | "AID-001"
  | "AID-002"
  | "AID-003"
  | "AID-004"
  | "AID-005"
  | "AID-006"
  | "AID-007"
  | "AID-008"
  | "AID-009"
  | "AID-010";

export interface AgentIdErrorBody {
  error: AgentIdErrorCode;
  message: string;
  detail?: string;
}

export interface AgentIdRequest {
  headers: Record<string, string | string[] | undefined>;
  agent?: VerifiedAgent;
}

export interface AgentIdResponse {
  status(code: number): AgentIdResponse;
  json(body: unknown): unknown;
  setHeader?(name: string, value: string): void;
}

export type AgentIdNext = (err?: unknown) => void;
