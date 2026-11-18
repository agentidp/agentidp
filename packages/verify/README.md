# @agentidp/verify

Service-side verifier for AgentIDP. Check an AgentIDP token and protect Connect/Express endpoints.

```bash
npm install @agentidp/verify
```

```ts
import { agentIdMiddleware } from "@agentidp/verify";

app.post(
  "/api/submit",
  agentIdMiddleware({
    audience: "https://api.example.com", // this service's own URL
    accessTier: "authenticated",
    minVerificationLevel: 2,
    rateLimit: { requestsPerHour: 100, scope: "agent_id" },
  }),
  (req, res) => {
    console.log(req.agent.agent_id, req.agent.owner_id);
  },
);
```

`verifyAgentToken(token, options)` is the isomorphic core used by the middleware.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `accessTier` | `authenticated` | `open` (token optional), `authenticated`, `permissioned` (allowlist of `agent_id` or `owner_id`) |
| `minVerificationLevel` | `0` | Integer 0-3. Token `verification_level` MUST be that integer, not a name string |
| `audience` | **required** | This service's own URL (or a list). Token `aud` must match. Verification fails with `AID-011` if unset, unless `requireAudience` is `false` |
| `issuer` | `registryUrl` | Expected `iss`. Not checked with a custom `getKey` unless set |
| `requireAudience` | `true` | Token MUST include `aud`. Missing `aud` is `AID-011`. Set `false` only for tokens minted before this rule |
| `confirmationJwk` | unset | When the token has `cnf.jkt`, it MUST match this JWK's SHA-256 thumbprint |
| `expectedJkt` | unset | When the token has `cnf.jkt`, it MUST equal this string |
| `allowlist` | `[]` | Used by `permissioned` |
| `registryUrl` | `AGENTIDP_REGISTRY_URL` or `https://registry.agentidp.dev` | Base URL for JWKS, status, lookup |
| `jwksUri` | `{registryUrl}/.well-known/jwks.json` | Override with `AGENTIDP_JWKS_URI` |
| `getKey` | unset | Supply a key and skip the network |
| `checkRevocation` | `false` | `GET /api/v1/agents/{id}/status`. Fail closed if status is missing |
| `lookupOwner` | `false` | Fill `verified_domain`, `owner_id`, and `owner_type` from public agent lookup. Does not copy `owner_name` |
| `keyCacheTtlSeconds` | `3600` | JWKS cache. Honour a shorter `Cache-Control` `max-age` |
| `revocationCacheTtlSeconds` | `60` | Status cache. Freshness is `min(token remaining life, this TTL, Cache-Control max-age)` |
| `rateLimit` | unset | `{ requestsPerHour, scope: "agent_id" \| "owner_id" }` |
| `rateLimitStore` | in-memory | Without Redis/Upstash this is process-local. A warning is printed once. It does not enforce a global cap |

On success the middleware sets `req.agent`. Display names come from registry lookup. Lookup uses `verified_domain` (Level 2+) as the protocol display field.

### Discovery header

When the middleware answers 401 (no token, or a token it refuses), it also sends a `WWW-Authenticate` header telling the agent where to get a token and which audience to ask for:

```http
WWW-Authenticate: Bearer realm="agentidp", registry="https://registry.agentidp.dev", audience="https://api.example.com"
```

A refused token adds `error="invalid_token"` and `error_description`. 403 responses carry no challenge. Outside the middleware, build the same value with `agentIdChallenge(options, error?)`:

```ts
import { agentIdChallenge, isAgentIdError, verifyAgentToken } from "@agentidp/verify";

try {
  const agent = await verifyAgentToken(token, options);
} catch (error) {
  if (isAgentIdError(error) && error.status === 401) {
    response.headers.set("WWW-Authenticate", agentIdChallenge(options, token ? error : undefined));
  }
}
```

## Registry contract

Default issuer: `https://registry.agentidp.dev` via `AGENTIDP_REGISTRY_URL` or `registryUrl`. The hosted registry is live.

Canonical paths are `/api/v1/...` plus well-known JWKS. There are no bare `/v1/...` routes.

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/.well-known/jwks.json` | `{ keys: JWK[] }`. Registry `Cache-Control: public, max-age=86400` (verifier caps at 1h) |
| `GET` | `/api/v1/agents/{id}/status` | `{ agent_id, status, checked_at }` where `status` is `active` / `revoked` / `suspended`. `max-age=60` |
| `GET` | `/api/v1/agents/{id}` | Public lookup, including `owner` and `status`. Used for `lookupOwner` and as a status fallback |

There is no CRL, introspect, or denylist endpoint on the current registry. Revocation is the status field. `@agentidp/verify` caches JWKS (default 1 hour, honour a shorter `Cache-Control` `max-age`) and status (default 60 seconds). When `checkRevocation` is true, freshness is `min(remaining token TTL, cache TTL, Cache-Control max-age)`. Status is not fetched unless `checkRevocation` is true. Pass `getKey` for offline verify. This package does not verify a resource-server DPoP proof. Designed alongside RFC 8693 token exchange and RFC 9449 DPoP. Resource-server DPoP and formal profiles of these specs are on the roadmap.
