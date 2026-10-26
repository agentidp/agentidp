import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from "jose";

import type { FetchLike } from "../src/index.js";

export interface GeneratedPair {
  privateKey: KeyLike;
  publicJwk: JWK;
  kid: string;
}

export async function generatePair(kid = "test-verify-key"): Promise<GeneratedPair> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  return { privateKey, publicJwk, kid };
}

export async function signAit(
  privateKey: KeyLike,
  claims: Record<string, unknown>,
  kid: string,
  lifetimeSeconds = 3600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", typ: "AIT+jwt", kid })
    .setIssuedAt(now)
    .setExpirationTime(now + lifetimeSeconds)
    .setSubject(String(claims.agent_id ?? claims.sub ?? "ag_test"))
    .sign(privateKey);
}

export function jsonFetch(
  routes: Record<string, { status?: number; body: unknown }>,
): FetchLike {
  return async (input) => {
    const hit = routes[input];
    if (!hit) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      };
    }
    const status = hit.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => hit.body,
    };
  };
}
