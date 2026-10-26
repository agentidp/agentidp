/**
 * Registry HTTP contract used by @agentidp/verify.
 *
 * Live Next.js app (`agentidp/registry`) serves these under `/api/v1/...`.
 * Spec §4.1 writes `/v1/...`. The verifier tries the Next.js path first, then
 * the spec path. JWKS is `/.well-known/jwks.json` on both.
 */

export function encodeAgentId(agentId: string): string {
  return encodeURIComponent(agentId);
}

export function jwksUrl(registryUrl: string): string {
  return `${registryUrl}/.well-known/jwks.json`;
}

export function agentPublicKeyUrls(
  registryUrl: string,
  agentId: string,
): string[] {
  const id = encodeAgentId(agentId);
  return [
    `${registryUrl}/api/v1/agents/${id}/public-key`,
    `${registryUrl}/v1/agents/${id}/public-key`,
  ];
}

export function agentStatusUrls(
  registryUrl: string,
  agentId: string,
): string[] {
  const id = encodeAgentId(agentId);
  return [
    `${registryUrl}/api/v1/agents/${id}/status`,
    `${registryUrl}/v1/agents/${id}/status`,
  ];
}

export function agentLookupUrls(
  registryUrl: string,
  agentId: string,
): string[] {
  const id = encodeAgentId(agentId);
  return [
    `${registryUrl}/api/v1/agents/${id}`,
    `${registryUrl}/v1/agents/${id}`,
  ];
}
