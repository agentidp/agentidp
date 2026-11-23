/**
 * Offline fixtures matching the live registry contract at
 * `https://registry.agentidp.dev`. Tests use these shapes instead of the network.
 *
 * Canonical paths (`agentidp/registry` main). No bare `/v1/...`:
 *   GET {registry}/.well-known/jwks.json
 *   GET {registry}/api/v1/agents/{agent_id}/public-key
 *   GET {registry}/api/v1/agents/{agent_id}/status
 *   GET {registry}/api/v1/agents/{agent_id}
 *
 * JWKS mock default is `Cache-Control: public, max-age=3600`, matching the
 * live `/.well-known/jwks.json` header. Tests that need a longer max-age to
 * prove the 1-hour cap pass an explicit header.
 *
 * No CRL, introspect, or denylist endpoint exists on the registry. Revocation
 * is the status field: active | revoked | suspended.
 */

import type { JWK } from "jose";

import type { MockRoute } from "../helpers.js";

export const REGISTRY = "https://registry.test";

export function jwksRoute(
  keys: JWK[],
  cacheControl = "public, max-age=3600",
): Record<string, MockRoute> {
  return {
    [`${REGISTRY}/.well-known/jwks.json`]: {
      body: { keys },
      headers: { "Cache-Control": cacheControl },
    },
  };
}

export function statusRoute(
  agentId: string,
  status: "active" | "revoked" | "suspended",
  cacheControl = "public, max-age=60",
): Record<string, MockRoute> {
  return {
    [`${REGISTRY}/api/v1/agents/${agentId}/status`]: {
      body: {
        agent_id: agentId,
        status,
        checked_at: "2026-10-26T00:00:00.000Z",
      },
      headers: { "Cache-Control": cacheControl },
    },
  };
}

export function publicKeyRoute(
  agentId: string,
  jwk: JWK,
  cacheControl = "public, max-age=86400",
): Record<string, MockRoute> {
  return {
    [`${REGISTRY}/api/v1/agents/${agentId}/public-key`]: {
      body: jwk,
      headers: {
        "Cache-Control": cacheControl,
        "Content-Type": "application/jwk+json",
      },
    },
  };
}

export function lookupRoute(
  agentId: string,
  status: "active" | "revoked" | "suspended" = "active",
): Record<string, MockRoute> {
  return {
    [`${REGISTRY}/api/v1/agents/${agentId}`]: {
      body: {
        agent_id: agentId,
        name: "AcmeBookingAgent",
        status,
        owner: {
          owner_id: "own_T1mR4xBq9",
          owner_type: "org",
          verification_level: 2,
          verified_domain: "acme.inc",
        },
        public_key_url: `/api/v1/agents/${agentId}/public-key`,
      },
      headers: { "Cache-Control": "public, max-age=300" },
    },
  };
}

export function revokedPublicKeyRoute(agentId: string): Record<string, MockRoute> {
  return {
    [`${REGISTRY}/api/v1/agents/${agentId}/public-key`]: {
      status: 403,
      body: {
        error: "AID-003",
        message: "Agent has been revoked",
      },
    },
  };
}
