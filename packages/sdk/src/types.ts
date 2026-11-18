import type { JWK } from "jose";

export const DEFAULT_REGISTRY_URL = "https://registry.agentidp.dev";
export const MAX_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
export const DEFAULT_TOKEN_LIFETIME_SECONDS = 60 * 60;
export const MIN_TOKEN_LIFETIME_SECONDS = 60;

/** JWT `typ` for a registry-issued AgentIDP token. */
export const AGENTIDP_TOKEN_TYP = "agentidp+jwt";
/** JWT `typ` for an agent proof JWT presented at token exchange. */
export const AGENTIDP_PROOF_TYP = "agentidp-pop+jwt";
/** JWT `typ` for a signed delegation hop. */
export const AGENTIDP_DELEGATION_TYP = "agentidp-dlg+jwt";

/**
 * Historical JWT `typ` used by some registry-issued tokens.
 * New protocol text calls the credential an AgentIDP token (`agentidp+jwt`).
 */
export const AIT_TYP = "AIT+jwt";

export const PROOF_MAX_LIFETIME_SECONDS = 300;
export const DEFAULT_PROOF_LIFETIME_SECONDS = 60;
export const PROOF_CLOCK_SKEW_SECONDS = 60;
export const MAX_DELEGATION_DEPTH = 8;

export type OwnerType = "person" | "org";

export type VerificationLevelInput = number | string;

export type AgentSigningAlg = "ES256" | "EdDSA";

/** PEM string, JWK JSON string, or JWK object. */
export type PrivateKeyInput = string | JWK;

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface AgentKeyPair {
  alg: AgentSigningAlg;
  kid?: string;
  publicJwk: JWK;
  privateJwk: JWK;
}

export interface AgentAuthOptions {
  agentId: string;
  privateKey: PrivateKeyInput;
  registryUrl?: string;
  /**
   * Owner API key (`aidp_…`). When set, `getToken` calls
   * `POST /api/v1/tokens/exchange` with a proof JWT instead of minting locally.
   * Also read from `AGENTIDP_API_KEY`.
   */
  apiKey?: string;
  fetch?: FetchLike;
  /** Key id written to the JWT header. Falls back to the JWK `kid` when present. */
  keyId?: string;
  agentName?: string;
  agentVersion?: string;
  agentDescription?: string;
  ownerId?: string;
  ownerName?: string;
  ownerType?: OwnerType;
  verificationLevel?: VerificationLevelInput;
}

export interface GetTokenOptions {
  audience: string;
  capabilities?: string[];
  expiresInSeconds?: number;
  /** Compact JWS hops. Each hop can only narrow scopes, audience, and expiry. */
  delegationChain?: string[];
}

export interface CreateProofJwtOptions {
  agentId: string;
  privateKey: PrivateKeyInput;
  registryUrl: string;
  jti?: string;
  lifetimeSeconds?: number;
  now?: number;
  keyId?: string;
}

export interface TokenExchangeRequest {
  agentId: string;
  audience: string;
  proof: string;
  apiKey: string;
  registryUrl: string;
  scopes?: string[];
  lifetimeSeconds?: number;
  delegationChain?: string[];
  fetch?: FetchLike;
}

export interface TokenExchangeResponse {
  token: string;
  token_type: string;
  token_id: string;
  expires_at: string;
  agent_id: string;
  kid: string;
}

export interface Confirmation {
  jkt: string;
}

export interface DelegationEntry {
  principal_type: "user" | "agent";
  principal_id: string;
  granted_at?: string;
  scopes?: string[];
  evidence?: string;
}

export interface AitClaims {
  agent_id: string;
  agent_name?: string;
  agent_version?: string;
  agent_description?: string;
  owner_id?: string;
  owner_type?: OwnerType;
  owner_name?: string;
  verification_level?: VerificationLevelInput;
  capabilities?: string[];
  delegation_chain?: DelegationEntry[] | string[];
  cnf?: Confirmation;
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

/** Alias for {@link AitClaims}. The protocol name is AgentIDP token. */
export type AgentIdpTokenClaims = AitClaims;
