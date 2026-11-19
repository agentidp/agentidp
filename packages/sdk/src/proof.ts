import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";

import { importPrivateKey } from "./keys.js";
import {
  AGENTIDP_PROOF_TYP,
  DEFAULT_PROOF_LIFETIME_SECONDS,
  PROOF_MAX_LIFETIME_SECONDS,
  type CreateProofJwtOptions,
} from "./types.js";

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function tokenExchangePath(): string {
  return "/api/v1/tokens/exchange";
}

export function tokenExchangeAudiences(registryUrl: string): string[] {
  const base = stripTrailingSlash(registryUrl);
  return [`${base}/api/v1/tokens/exchange`, `${base}/v1/tokens/exchange`];
}

export function tokenExchangeAudience(registryUrl: string): string {
  return tokenExchangeAudiences(registryUrl)[0]!;
}

/** `aud` of the proof that authorises replacing an agent's registered key. */
export function publicKeyAudience(registryUrl: string, agentId: string): string {
  return `${stripTrailingSlash(registryUrl)}/api/v1/agents/${encodeURIComponent(agentId)}/public-key`;
}

export function generateProofJti(): string {
  return `pop_${randomBytes(16).toString("hex")}`;
}

/**
 * Build the short-lived proof JWT the registry requires on
 * `POST /api/v1/tokens/exchange`.
 *
 * Claims: `iss`/`sub` = agent id, `aud` = token-exchange endpoint,
 * unique `jti`, `exp - iat` at most 300 seconds.
 */
export async function createProofJwt(
  options: CreateProofJwtOptions,
): Promise<string> {
  if (!options.agentId?.trim()) {
    throw new Error("agentId is required");
  }
  const lifetime = options.lifetimeSeconds ?? DEFAULT_PROOF_LIFETIME_SECONDS;
  if (!Number.isFinite(lifetime) || lifetime <= 0) {
    throw new Error("proof lifetimeSeconds must be a positive number");
  }
  if (lifetime > PROOF_MAX_LIFETIME_SECONDS) {
    throw new Error(
      `proof lifetime must be at most ${PROOF_MAX_LIFETIME_SECONDS} seconds`,
    );
  }

  const imported = await importPrivateKey(options.privateKey);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const jti = options.jti?.trim() || generateProofJti();
  const kid = options.keyId ?? imported.kid;
  const header: { alg: "ES256" | "EdDSA"; typ: string; kid?: string } = {
    alg: imported.alg,
    typ: AGENTIDP_PROOF_TYP,
  };
  if (kid) header.kid = kid;

  return new SignJWT({})
    .setProtectedHeader(header)
    .setIssuer(options.agentId)
    .setSubject(options.agentId)
    .setAudience(
      options.audience ?? tokenExchangeAudience(options.registryUrl),
    )
    .setIssuedAt(now)
    .setExpirationTime(now + Math.trunc(lifetime))
    .setJti(jti)
    .sign(imported.key);
}
