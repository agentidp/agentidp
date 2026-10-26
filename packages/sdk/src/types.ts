import type { JWK } from "jose";

export const DEFAULT_REGISTRY_URL = "https://registry.agentidp.dev";
export const MAX_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
export const DEFAULT_TOKEN_LIFETIME_SECONDS = 60 * 60;
export const AIT_TYP = "AIT+jwt";

export type OwnerType = "person" | "org";

export type VerificationLevelInput = number | string;

/** PEM string, JWK JSON string, or JWK object. */
export type PrivateKeyInput = string | JWK;

export interface AgentAuthOptions {
  agentId: string;
  privateKey: PrivateKeyInput;
  registryUrl?: string;
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
  delegation_chain?: DelegationEntry[];
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}
