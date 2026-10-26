/**
 * Registry HTTP contract used by @agentidp/verify.
 *
 * Locked to `agentidp/registry` on main (Connor, 2026-10-26):
 *   GET /.well-known/jwks.json
 *   GET /api/v1/agents/{id}/public-key
 *   GET /api/v1/agents/{id}/status
 *   GET /api/v1/agents/{id}          (lookup; status fallback)
 *
 * There are no bare `/v1/...` routes in the app. Spec §4.1 still writes
 * `/v1/...`; that is not the live contract.
 */

export function encodeAgentId(agentId: string): string {
  return encodeURIComponent(agentId);
}

export function jwksUrl(registryUrl: string): string {
  return `${registryUrl}/.well-known/jwks.json`;
}

export function agentPublicKeyUrl(
  registryUrl: string,
  agentId: string,
): string {
  return `${registryUrl}/api/v1/agents/${encodeAgentId(agentId)}/public-key`;
}

export function agentStatusUrl(registryUrl: string, agentId: string): string {
  return `${registryUrl}/api/v1/agents/${encodeAgentId(agentId)}/status`;
}

export function agentLookupUrl(registryUrl: string, agentId: string): string {
  return `${registryUrl}/api/v1/agents/${encodeAgentId(agentId)}`;
}
