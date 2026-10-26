import { createPrivateKey } from "node:crypto";
import { importJWK, importPKCS8, type CryptoKey, type JWK } from "jose";

import type { PrivateKeyInput } from "./types.js";

export interface ImportedPrivateKey {
  key: CryptoKey | Uint8Array;
  kid?: string;
}

function isJwk(value: unknown): value is JWK {
  return Boolean(value && typeof value === "object" && "kty" in value);
}

function unwrapQuotedPem(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

async function importEcPem(pem: string): Promise<CryptoKey> {
  const normalized = unwrapQuotedPem(pem).trim();

  if (normalized.includes("BEGIN PRIVATE KEY")) {
    return importPKCS8(normalized, "ES256");
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
    return {
      key: await importJWK(input, "ES256"),
      kid: typeof input.kid === "string" ? input.kid : undefined,
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
    return { key: await importEcPem(trimmed) };
  }

  throw new Error(
    "privateKey must be a PEM string, a JWK JSON string, or a JWK object",
  );
}
