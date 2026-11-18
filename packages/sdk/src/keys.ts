import { createPrivateKey } from "node:crypto";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  importPKCS8,
  type CryptoKey,
  type JWK,
} from "jose";

import type { AgentKeyPair, AgentSigningAlg, PrivateKeyInput } from "./types.js";

export interface ImportedPrivateKey {
  key: CryptoKey | Uint8Array;
  alg: AgentSigningAlg;
  kid?: string;
  jwk?: JWK;
}

const PRIVATE_JWK_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "k"] as const;

function isJwk(value: unknown): value is JWK {
  return Boolean(value && typeof value === "object" && "kty" in value);
}

function unwrapQuotedPem(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function signingAlgOf(jwk: JWK): AgentSigningAlg {
  if (jwk.alg === "EdDSA" || (jwk.kty === "OKP" && jwk.crv === "Ed25519")) {
    return "EdDSA";
  }
  return "ES256";
}

export function hasPrivateJwkFields(jwk: JWK): boolean {
  return PRIVATE_JWK_FIELDS.some((field) => asString(jwk[field]));
}

/**
 * Drop private JWK members. Callers MUST register this object, never the
 * private key, with `POST /api/v1/agents` or `PUT .../public-key`.
 */
export function toPublicJwk(jwk: JWK): JWK {
  const publicJwk: JWK = { kty: jwk.kty };
  if (jwk.crv) publicJwk.crv = jwk.crv;
  if (jwk.x) publicJwk.x = jwk.x;
  if (jwk.y) publicJwk.y = jwk.y;
  if (jwk.kid) publicJwk.kid = jwk.kid;
  if (jwk.alg) publicJwk.alg = jwk.alg;
  if (jwk.use) publicJwk.use = jwk.use;
  return publicJwk;
}

export function assertPublicJwk(jwk: JWK): JWK {
  if (hasPrivateJwkFields(jwk)) {
    throw new Error(
      "public JWK must not include private fields (d, p, q, dp, dq, qi, k)",
    );
  }
  const alg = signingAlgOf(jwk);
  if (alg === "ES256") {
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
      throw new Error("ES256 public JWK requires kty=EC, crv=P-256, x, and y");
    }
  } else if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x) {
    throw new Error("EdDSA public JWK requires kty=OKP, crv=Ed25519, and x");
  }
  return toPublicJwk(jwk);
}

export async function jwkThumbprint(jwk: JWK): Promise<string> {
  return calculateJwkThumbprint(toPublicJwk(jwk), "sha256");
}

async function importEcPem(pem: string): Promise<CryptoKey> {
  const normalized = unwrapQuotedPem(pem).trim();

  if (normalized.includes("BEGIN PRIVATE KEY")) {
    try {
      return await importPKCS8(normalized, "ES256");
    } catch {
      return importPKCS8(normalized, "EdDSA");
    }
  }

  if (normalized.includes("BEGIN EC PRIVATE KEY")) {
    const keyObject = createPrivateKey({ key: normalized, format: "pem" });
    const pkcs8 = keyObject.export({ type: "pkcs8", format: "pem" }).toString();
    return importPKCS8(pkcs8, "ES256");
  }

  throw new Error(
    "privateKey PEM must be PKCS#8 (BEGIN PRIVATE KEY) or SEC1 (BEGIN EC PRIVATE KEY)",
  );
}

export async function importPrivateKey(
  input: PrivateKeyInput,
): Promise<ImportedPrivateKey> {
  if (isJwk(input)) {
    const alg = signingAlgOf(input);
    return {
      key: await importJWK(input, alg),
      alg,
      kid: typeof input.kid === "string" ? input.kid : undefined,
      jwk: input,
    };
  }

  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("privateKey is required (PEM or JWK)");
  }

  const trimmed = unwrapQuotedPem(input).trim();

  if (trimmed.startsWith("{")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isJwk(parsed)) {
      throw new Error("privateKey JSON must be a JWK object with kty");
    }
    return importPrivateKey(parsed);
  }

  if (trimmed.includes("BEGIN")) {
    const key = await importEcPem(trimmed);
    return { key, alg: "ES256" };
  }

  throw new Error(
    "privateKey must be a PEM string, a JWK JSON string, or a JWK object",
  );
}

export async function generateAgentKeyPair(options?: {
  alg?: AgentSigningAlg;
  kid?: string;
}): Promise<AgentKeyPair> {
  const alg = options?.alg ?? "ES256";
  const { publicKey, privateKey } = await generateKeyPair(alg, {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  const kid = options?.kid;
  for (const jwk of [publicJwk, privateJwk]) {
    jwk.alg = alg;
    jwk.use = "sig";
    if (kid) jwk.kid = kid;
  }
  return {
    alg,
    kid,
    publicJwk: toPublicJwk(publicJwk),
    privateJwk,
  };
}
