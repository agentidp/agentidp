import {
  calculateJwkThumbprint,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWK,
} from "jose";

import { AgentIdError } from "./errors.js";
import {
  RegistryKeySource,
  resolveJwksUri,
  resolveRegistryUrl,
  resolveVerifyKey,
} from "./jwks.js";
import { optionalString, optionalStringArray, parseVerificationLevel } from "./levels.js";
import type {
  JwtHeader,
  JwtPayload,
  VerifiedAgent,
  VerifyAgentTokenOptions,
} from "./types.js";
import {
  AGENTIDP_TOKEN_TYP,
  AIT_TYP,
  DEFAULT_KEY_CACHE_TTL_SECONDS,
  DEFAULT_REVOCATION_CACHE_TTL_SECONDS,
} from "./types.js";

const ACCEPTED_TYPS = new Set([AGENTIDP_TOKEN_TYP, AIT_TYP, "JWT"]);
const JKT_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function asCnfJkt(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new AgentIdError("AID-001", "cnf must be an object");
  }
  const jkt = (value as { jkt?: unknown }).jkt;
  if (typeof jkt !== "string" || !JKT_PATTERN.test(jkt)) {
    throw new AgentIdError(
      "AID-001",
      "cnf.jkt must be a SHA-256 JWK thumbprint (RFC 7638 base64url)",
    );
  }
  return jkt;
}

const keySources = new WeakMap<
  NonNullable<VerifyAgentTokenOptions["fetch"]> | typeof globalThis,
  Map<string, RegistryKeySource>
>();

function sourceFor(options: VerifyAgentTokenOptions): RegistryKeySource {
  const fetchImpl = options.fetch;
  const cacheKey = fetchImpl ?? globalThis;
  const ttl = options.keyCacheTtlSeconds ?? DEFAULT_KEY_CACHE_TTL_SECONDS;
  const revocationTtl =
    options.revocationCacheTtlSeconds ?? DEFAULT_REVOCATION_CACHE_TTL_SECONDS;
  const slotKey = `${ttl}:${revocationTtl}`;
  let slots = keySources.get(cacheKey);
  if (!slots) {
    slots = new Map();
    keySources.set(cacheKey, slots);
  }
  const existing = slots.get(slotKey);
  if (existing) return existing;
  const created = new RegistryKeySource(fetchImpl, ttl, revocationTtl);
  slots.set(slotKey, created);
  return created;
}

function audiencesOf(
  value: string | string[] | undefined,
): string[] | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value : [value];
}

function audienceAllowed(
  tokenAud: unknown,
  required: string | string[] | undefined,
): boolean {
  if (required == null) return true;
  const wanted = audiencesOf(required) ?? [];
  if (wanted.length === 0) return true;
  const presented = Array.isArray(tokenAud)
    ? tokenAud.filter((item): item is string => typeof item === "string")
    : typeof tokenAud === "string"
      ? [tokenAud]
      : [];
  return presented.some((value) => wanted.includes(value));
}

function asPayload(value: unknown): JwtPayload {
  return (value ?? {}) as JwtPayload;
}

function requireAgentId(payload: JwtPayload): string {
  const agentId =
    optionalString(payload.agent_id) ?? optionalString(payload.sub);
  if (!agentId) {
    throw new AgentIdError("AID-001", "agent_id claim is missing");
  }
  return agentId;
}

function mapJoseError(error: unknown): never {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  if (code === "ERR_JWT_EXPIRED") {
    throw new AgentIdError("AID-002");
  }
  throw new AgentIdError("AID-001", error instanceof Error ? error.message : undefined);
}

export async function verifyAgentToken(
  token: string,
  options: VerifyAgentTokenOptions = {},
): Promise<VerifiedAgent> {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new AgentIdError("AID-001", "token is not a compact JWT");
  }

  let header: JwtHeader;
  let unverified: JwtPayload;
  try {
    header = decodeProtectedHeader(token) as JwtHeader;
    unverified = asPayload(decodeJwt(token));
  } catch (error) {
    throw new AgentIdError(
      "AID-001",
      error instanceof Error ? error.message : "unable to decode token",
    );
  }

  if (header.alg && header.alg !== "ES256") {
    throw new AgentIdError("AID-001", `unsupported alg ${header.alg}`);
  }
  if (header.typ && !ACCEPTED_TYPS.has(header.typ)) {
    throw new AgentIdError("AID-001", `unsupported typ ${header.typ}`);
  }

  const exp =
    typeof unverified.exp === "number" ? unverified.exp : undefined;
  const now = options.now?.() ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const tolerance = options.clockToleranceSeconds ?? 30;
  if (exp != null && exp + tolerance < nowSeconds) {
    throw new AgentIdError("AID-002");
  }

  const requireAudience = options.requireAudience ?? true;
  if (requireAudience && unverified.aud == null) {
    throw new AgentIdError("AID-011", "aud claim is required");
  }
  if (
    requireAudience &&
    options.audience != null &&
    !audienceAllowed(unverified.aud, options.audience)
  ) {
    throw new AgentIdError("AID-001", "audience mismatch");
  }

  const registryUrl = resolveRegistryUrl(options.registryUrl);
  const jwksUri = resolveJwksUri(registryUrl, options.jwksUri);
  const source = sourceFor(options);
  const nowMs = now.getTime();

  const key = await resolveVerifyKey({
    header,
    payload: unverified,
    getKey: options.getKey,
    source,
    registryUrl,
    jwksUri,
    expSeconds: exp,
    now: nowMs,
  });

  let payload: JwtPayload;
  try {
    const verified = await jwtVerify(token, key, {
      algorithms: ["ES256"],
      currentDate: now,
      clockTolerance: tolerance,
      typ:
        header.typ === AIT_TYP || header.typ === AGENTIDP_TOKEN_TYP
          ? header.typ
          : undefined,
    });
    payload = asPayload(verified.payload);
  } catch (error) {
    if (error instanceof AgentIdError) throw error;
    mapJoseError(error);
  }

  const agentId = requireAgentId(payload);
  let verificationLevel = parseVerificationLevel(payload.verification_level);
  const min = options.minVerificationLevel ?? 0;
  if (verificationLevel < min) {
    throw new AgentIdError("AID-005");
  }

  if (options.accessTier === "permissioned") {
    const allow = options.allowlist ?? [];
    const ownerId = optionalString(payload.owner_id);
    const permitted =
      allow.includes(agentId) || (ownerId != null && allow.includes(ownerId));
    if (!permitted) {
      throw new AgentIdError("AID-008");
    }
  }

  const capabilities = optionalStringArray(payload.capabilities);
  if (options.requiredCapabilities?.length) {
    const have = new Set(capabilities ?? []);
    const missing = options.requiredCapabilities.some((cap) => !have.has(cap));
    if (missing) {
      throw new AgentIdError("AID-006");
    }
  }

  if (options.checkRevocation) {
    const status = await source.getAgentStatus(
      registryUrl,
      agentId,
      exp,
      nowMs,
    );
    if (status === "revoked") throw new AgentIdError("AID-003");
    if (status === "suspended") throw new AgentIdError("AID-004");
    if (status == null) {
      throw new AgentIdError("AID-001", "revocation status unavailable");
    }
  }

  let ownerId = optionalString(payload.owner_id);
  let ownerName = optionalString(payload.owner_name);
  let ownerType = optionalString(payload.owner_type);

  if (options.lookupOwner && ownerName == null) {
    const lookedUp = await source.lookupOwner(registryUrl, agentId, exp, nowMs);
    if (lookedUp) {
      ownerId = ownerId ?? lookedUp.owner_id;
      ownerName = lookedUp.owner_name;
      ownerType = ownerType ?? lookedUp.owner_type;
      if (payload.verification_level == null && lookedUp.verification_level != null) {
        verificationLevel = parseVerificationLevel(lookedUp.verification_level);
        if (verificationLevel < min) {
          throw new AgentIdError("AID-005");
        }
      }
    }
  }

  const aud = payload.aud;
  const agent: VerifiedAgent = {
    agent_id: agentId,
    verificationLevel,
    token,
  };

  const agentName = optionalString(payload.agent_name);
  if (agentName !== undefined) agent.agent_name = agentName;
  const agentVersion = optionalString(payload.agent_version);
  if (agentVersion !== undefined) agent.agent_version = agentVersion;
  const agentDescription = optionalString(payload.agent_description);
  if (agentDescription !== undefined) agent.agent_description = agentDescription;
  if (ownerId !== undefined) agent.owner_id = ownerId;
  if (ownerName !== undefined) agent.owner_name = ownerName;
  if (ownerType !== undefined) agent.owner_type = ownerType;
  if (payload.verification_level !== undefined) {
    agent.verification_level = payload.verification_level as number | string;
  }
  if (capabilities !== undefined) agent.capabilities = capabilities;
  if (Array.isArray(payload.delegation_chain)) {
    agent.delegation_chain = payload.delegation_chain;
  }
  const iss = optionalString(payload.iss);
  if (iss !== undefined) agent.iss = iss;
  const sub = optionalString(payload.sub);
  if (sub !== undefined) agent.sub = sub;
  if (typeof aud === "string" || Array.isArray(aud)) agent.aud = aud;
  if (typeof payload.iat === "number") agent.iat = payload.iat;
  if (typeof payload.exp === "number") agent.exp = payload.exp;
  const jti = optionalString(payload.jti);
  if (jti !== undefined) agent.jti = jti;

  const jkt = asCnfJkt(payload.cnf);
  if (jkt !== undefined) {
    if (options.expectedJkt && options.expectedJkt !== jkt) {
      throw new AgentIdError("AID-001", "cnf.jkt does not match expectedJkt");
    }
    if (options.confirmationJwk) {
      const computed = await calculateJwkThumbprint(
        options.confirmationJwk as JWK,
        "sha256",
      );
      if (computed !== jkt) {
        throw new AgentIdError(
          "AID-001",
          "cnf.jkt does not match confirmationJwk thumbprint",
        );
      }
    }
    agent.cnf = { jkt };
  }

  return agent;
}
