import { AgentIdError } from "./errors.js";
import { resolveRegistryUrl } from "./jwks.js";
import { defaultRateLimitStore, rateLimitKey } from "./rate-limit.js";
import type {
  AgentIdMiddlewareOptions,
  AgentIdNext,
  AgentIdRequest,
  AgentIdResponse,
  VerifyAgentTokenOptions,
} from "./types.js";
import { verifyAgentToken } from "./verify.js";

function headerValue(
  headers: AgentIdRequest["headers"],
  name: string,
): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function bearerToken(req: AgentIdRequest): string | undefined {
  const authorization = headerValue(req.headers, "authorization");
  if (!authorization) return undefined;
  const match = /^Bearer\s+(\S+)/i.exec(authorization);
  return match?.[1];
}

// Header values are ASCII quoted-strings: drop anything that would end one or
// that Node refuses in a header.
const quoted = (value: string) => `"${value.replace(/[^\x20-\x7e]|["\\]/g, "")}"`;

/**
 * `WWW-Authenticate` value for a 401 (RFC 6750 §3), telling an agent where
 * to get a token (`registry`) and what to put in its `aud` (`audience`).
 * Pass `error` only when a token was sent; a request with no token gets no
 * error code. `registry` is left out when keys come from your own `getKey`.
 */
export function agentIdChallenge(
  options: Pick<VerifyAgentTokenOptions, "registryUrl" | "audience" | "getKey">,
  error?: AgentIdError,
): string {
  const params: [string, string][] = [["realm", "agentidp"]];
  if (!options.getKey || options.registryUrl) {
    params.push(["registry", resolveRegistryUrl(options.registryUrl)]);
  }
  // An agent can only request one audience; any listed value is accepted.
  const audience = [options.audience ?? []].flat()[0];
  if (audience) params.push(["audience", audience]);
  if (error) {
    params.push(["error", "invalid_token"], ["error_description", error.message]);
  }
  return `Bearer ${params.map(([key, value]) => `${key}=${quoted(value)}`).join(", ")}`;
}

function writeError(
  res: AgentIdResponse,
  error: AgentIdError,
  options: AgentIdMiddlewareOptions,
  tokenSent: boolean,
): void {
  if (error.status === 401 && res.setHeader) {
    res.setHeader(
      "WWW-Authenticate",
      agentIdChallenge(options, tokenSent ? error : undefined),
    );
  }
  if (error.code === "AID-007" && res.setHeader) {
    res.setHeader("Retry-After", "3600");
  }
  res.status(error.status).json(error.toJSON());
}

/**
 * Connect/Express-style middleware. Attaches `req.agent` on success.
 * `owner_name` is not required. Display names come from registry lookup
 * (`verified_domain` at Level 2+).
 */
export function agentIdMiddleware(options: AgentIdMiddlewareOptions = {}) {
  const accessTier = options.accessTier ?? "authenticated";
  const store = options.rateLimit ? (options.rateLimitStore ?? defaultRateLimitStore()) : undefined;

  return async function middleware(
    req: AgentIdRequest,
    res: AgentIdResponse,
    next: AgentIdNext,
  ): Promise<void> {
    const tokenSent = bearerToken(req) !== undefined;
    try {
      if (accessTier === "open") {
        const token = bearerToken(req);
        if (!token) {
          next();
          return;
        }
      }

      const token = bearerToken(req);
      if (!token) {
        throw new AgentIdError("AID-001", "missing Authorization Bearer token");
      }

      const agent = await verifyAgentToken(token, {
        ...options,
        accessTier,
      });

      if (options.rateLimit && store) {
        const key = rateLimitKey(
          options.rateLimit.scope ?? "agent_id",
          agent.agent_id,
          agent.owner_id,
        );
        const count = await store.hit(key, 60 * 60 * 1000);
        if (count > options.rateLimit.requestsPerHour) {
          throw new AgentIdError("AID-007");
        }
      }

      req.agent = agent;
      next();
    } catch (error) {
      if (error instanceof AgentIdError) {
        writeError(res, error, options, tokenSent);
        return;
      }
      next(error);
    }
  };
}
