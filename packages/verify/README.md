# @agentidp/verify

Service-side verifier for AgentIDP. Check an AIT and protect Connect/Express endpoints.

This package lives in the `agentidp/agentidp` workspace. It is not published to npm yet. The public name stays `@agentidp/verify` and will be used when publish is approved.

```ts
import { agentIdMiddleware } from "@agentidp/verify";

app.post(
  "/api/submit",
  agentIdMiddleware({
    accessTier: "authenticated",
    minVerificationLevel: 2,
    rateLimit: { requestsPerHour: 100, scope: "agent_id" },
  }),
  (req, res) => {
    console.log(req.agent.owner_name);
  },
);
```

`verifyAgentToken(token, options)` is the isomorphic core used by the middleware.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `accessTier` | `authenticated` | `open` (token optional), `authenticated`, `permissioned` (allowlist of `agent_id` or `owner_id`) |
| `minVerificationLevel` | `0` | Integer 0–3. Token claim `"domain"` maps to `2` |
| `audience` | unset | When set, `aud` must match |
| `allowlist` | `[]` | Used by `permissioned` |
| `registryUrl` | `AGENTIDP_REGISTRY_URL` or `https://registry.agentidp.dev` | Base URL for JWKS, public-key, status, lookup |
| `jwksUri` | `{registryUrl}/.well-known/jwks.json` | Override with `AGENTIDP_JWKS_URI` |
| `getKey` | unset | Supply a key and skip the network |
| `checkRevocation` | `false` | `GET /v1/agents/{id}/status` (also tries `/api/v1/...`) |
| `lookupOwner` | `false` | If the token has no `owner_name`, fill it from public agent lookup when present |
| `keyCacheTtlSeconds` | `3600` | In-memory JWKS / key / status cache. Freshness is `min(token remaining life, cache TTL)` |
| `rateLimit` | unset | `{ requestsPerHour, scope: "agent_id" \| "owner_id" }` |
| `rateLimitStore` | in-memory | Without Redis/Upstash this is process-local. A warning is printed once. It does not enforce a global cap |

On success the middleware sets `req.agent`, including `owner_name` when that claim is on the token (or returned by `lookupOwner`). Missing names stay `undefined`.
