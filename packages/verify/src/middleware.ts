import { AgentIdError } from "./errors.js";
import { defaultRateLimitStore, rateLimitKey } from "./rate-limit.js";
import type {
  AgentIdMiddlewareOptions,
  AgentIdNext,
  AgentIdRequest,
  AgentIdResponse,
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

function writeError(res: AgentIdResponse, error: AgentIdError): void {
  if (error.code === "AID-007" && res.setHeader) {
    res.setHeader("Retry-After", "3600");
  }
  res.status(error.status).json(error.toJSON());
}

/**
 * Connect/Express-style middleware. Attaches `req.agent` on success,
 * including `owner_name` when that claim is present on the token.
 */
export function agentIdMiddleware(options: AgentIdMiddlewareOptions = {}) {
  const accessTier = options.accessTier ?? "authenticated";
  const store = options.rateLimit ? (options.rateLimitStore ?? defaultRateLimitStore()) : undefined;

  return async function middleware(
    req: AgentIdRequest,
    res: AgentIdResponse,
    next: AgentIdNext,
  ): Promise<void> {
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
        requireAudience: options.requireAudience ?? options.audience != null,
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
        writeError(res, error);
        return;
      }
      next(error);
    }
  };
}
