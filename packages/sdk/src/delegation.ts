import { randomBytes } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";

import { importPrivateKey } from "./keys.js";
import {
  AGENTIDP_DELEGATION_TYP,
  MAX_DELEGATION_DEPTH,
  type PrivateKeyInput,
} from "./types.js";

export interface CreateDelegationHopOptions {
  privateKey: PrivateKeyInput;
  iss: string;
  sub: string;
  audience: string;
  scopes: string[];
  exp: number;
  jti?: string;
  now?: number;
  keyId?: string;
}

export function generateDelegationJti(): string {
  return `dlg_${randomBytes(12).toString("hex")}`;
}

/**
 * Sign one compact JWS hop. The registry verifies each hop against the
 * delegating agent's registered public key. Hops MUST only narrow.
 */
export async function createDelegationHop(
  options: CreateDelegationHopOptions,
): Promise<string> {
  if (!options.iss?.trim() || !options.sub?.trim()) {
    throw new Error("delegation hop iss and sub are required");
  }
  if (!options.audience?.trim()) {
    throw new Error("delegation hop audience is required");
  }
  if (!options.scopes?.length) {
    throw new Error("delegation hop scopes are required");
  }
  const imported = await importPrivateKey(options.privateKey);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const kid = options.keyId ?? imported.kid;
  const header: { alg: "ES256" | "EdDSA"; typ: string; kid?: string } = {
    alg: imported.alg,
    typ: AGENTIDP_DELEGATION_TYP,
  };
  if (kid) header.kid = kid;

  return new SignJWT({ scopes: options.scopes })
    .setProtectedHeader(header)
    .setIssuer(options.iss)
    .setSubject(options.sub)
    .setAudience(options.audience)
    .setIssuedAt(now)
    .setExpirationTime(options.exp)
    .setJti(options.jti?.trim() || generateDelegationJti())
    .sign(imported.key);
}

export function decodeDelegationHop(compact: string): {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  scopes?: string[];
  exp?: number;
  jti?: string;
} {
  const payload = decodeJwt(compact);
  const scopes = payload.scopes ?? payload.scope;
  return {
    iss: typeof payload.iss === "string" ? payload.iss : undefined,
    sub: typeof payload.sub === "string" ? payload.sub : undefined,
    aud: payload.aud as string | string[] | undefined,
    scopes: Array.isArray(scopes)
      ? scopes.filter((item): item is string => typeof item === "string")
      : typeof scopes === "string"
        ? scopes.split(/\s+/).filter(Boolean)
        : undefined,
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
    jti: typeof payload.jti === "string" ? payload.jti : undefined,
  };
}

export { MAX_DELEGATION_DEPTH };
