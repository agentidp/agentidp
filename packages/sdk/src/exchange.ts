import { TokenExchangeError } from "./errors.js";
import { tokenExchangeAudience, tokenExchangePath } from "./proof.js";
import {
  DEFAULT_TOKEN_LIFETIME_SECONDS,
  MAX_TOKEN_LIFETIME_SECONDS,
  MIN_TOKEN_LIFETIME_SECONDS,
  type FetchLike,
  type TokenExchangeRequest,
  type TokenExchangeResponse,
} from "./types.js";

const defaultFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, init);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
  };
};

function resolveLifetime(lifetime?: number): number {
  const value = lifetime ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
  if (!Number.isFinite(value) || value < MIN_TOKEN_LIFETIME_SECONDS) {
    throw new Error(
      `lifetimeSeconds must be at least ${MIN_TOKEN_LIFETIME_SECONDS}`,
    );
  }
  if (value > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error(
      `lifetimeSeconds must be at most ${MAX_TOKEN_LIFETIME_SECONDS} seconds (24h)`,
    );
  }
  return Math.trunc(value);
}

function asResponse(body: unknown): TokenExchangeResponse | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.token !== "string" || record.token.length === 0) return null;
  return {
    token: record.token,
    token_type: typeof record.token_type === "string" ? record.token_type : "",
    token_id: typeof record.token_id === "string" ? record.token_id : "",
    expires_at: typeof record.expires_at === "string" ? record.expires_at : "",
    agent_id: typeof record.agent_id === "string" ? record.agent_id : "",
    kid: typeof record.kid === "string" ? record.kid : "",
  };
}

/**
 * Call `POST /api/v1/tokens/exchange` with an owner API key and agent proof.
 */
export async function exchangeToken(
  request: TokenExchangeRequest,
): Promise<TokenExchangeResponse> {
  if (!request.apiKey?.trim()) {
    throw new Error("apiKey is required to call token exchange");
  }
  if (!request.audience?.trim()) {
    throw new Error("audience is required");
  }
  if (!request.proof?.trim()) {
    throw new Error("proof JWT is required");
  }

  const lifetime = resolveLifetime(request.lifetimeSeconds);
  const url = `${request.registryUrl.replace(/\/+$/, "")}${tokenExchangePath()}`;
  const body: Record<string, unknown> = {
    agent_id: request.agentId,
    aud: request.audience,
    proof: request.proof,
    lifetime,
  };
  if (request.scopes) body.scopes = request.scopes;
  if (request.delegationChain) body.delegation_chain = request.delegationChain;

  const fetchImpl = request.fetch ?? defaultFetch;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new TokenExchangeError(
      "AID-001",
      response.status,
      "Token exchange returned a non-JSON body",
    );
  }

  if (!response.ok) {
    const record =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    const code =
      typeof record.error === "string" ? record.error : `HTTP_${response.status}`;
    const message =
      typeof record.message === "string"
        ? record.message
        : "Token exchange failed";
    const detail = typeof record.detail === "string" ? record.detail : undefined;
    throw new TokenExchangeError(code, response.status, message, detail);
  }

  const minted = asResponse(parsed);
  if (!minted) {
    throw new TokenExchangeError(
      "AID-001",
      response.status,
      "Token exchange response is missing token",
    );
  }
  return minted;
}

export async function registerAgentPublicKey(input: {
  agentId: string;
  publicKey: unknown;
  apiKey: string;
  registryUrl: string;
  fetch?: FetchLike;
}): Promise<void> {
  const url = `${input.registryUrl.replace(/\/+$/, "")}/api/v1/agents/${encodeURIComponent(input.agentId)}/public-key`;
  const fetchImpl = input.fetch ?? defaultFetch;
  const response = await fetchImpl(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ public_key: input.publicKey }),
  });
  if (response.ok) return;

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new TokenExchangeError(
      "AID-017",
      response.status,
      "Public key registration failed",
    );
  }
  const record =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  throw new TokenExchangeError(
    typeof record.error === "string" ? record.error : "AID-017",
    response.status,
    typeof record.message === "string"
      ? record.message
      : "Public key registration failed",
    typeof record.detail === "string" ? record.detail : undefined,
  );
}

export { tokenExchangeAudience };
