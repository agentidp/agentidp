# AgentIDP

Not affiliated with AgentMail's AgentID (agentid.com).

AgentIDP is an open identity standard and protocol for AI agents, with a hosted registry, TypeScript SDKs, and a dashboard. A service that verifies an AgentIDP token can answer:

1. Which agent is this?
2. Who is accountable for it?
3. What is it permitted to do?

OAuth covers user-to-app delegation. OpenID Connect covers user identity federation. AgentIDP covers agent-to-service identity.

Agents hold their own keys. Owners register after email verification. Token exchange mints a short-lived, registry-signed AgentIDP token bound to the agent key (`cnf.jkt`). Delegation hops are signed compact JWS and can only narrow. `@agentidp/verify` checks JWKS and, when asked, revocation status.

Designed alongside RFC 8693 token exchange and RFC 9449 DPoP. Resource-server DPoP and formal profiles of these specs are on the roadmap.

## TypeScript packages

This repository holds the protocol text and the TypeScript packages:

| Package | Path | Version | Role |
| --- | --- | --- | --- |
| [`@agentidp/sdk`](packages/sdk) | `packages/sdk` | `0.2.1` | Agent-side: generate a key, build a proof JWT, call token exchange |
| [`@agentidp/verify`](packages/verify) | `packages/verify` | `0.3.0` | Service-side: verify an AgentIDP token and protect an HTTP route |
| [`@agentidp/mcp`](packages/mcp) | `packages/mcp` | `0.1.0` | MCP server: look up, verify, register and mint from a coding agent |

All three are on npm under the `@agentidp` scope. Releases follow [docs/npm-publish.md](docs/npm-publish.md).

```bash
npm install @agentidp/sdk @agentidp/verify
```

The MCP server is `npx -y @agentidp/mcp` (stdio). See [`packages/mcp`](packages/mcp).

From this workspace:

```bash
git clone https://github.com/agentidp/agentidp.git
cd agentidp
pnpm install
pnpm build
pnpm test
```

### Agent SDK

```ts
import { AgentAuth, generateAgentKeyPair } from "@agentidp/sdk";

const keys = await generateAgentKeyPair();
const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: keys.privateJwk,
  apiKey: process.env.AGENTIDP_API_KEY,
});

const token = await auth.getToken({
  audience: "https://api.example.com",
});

await fetch("https://api.example.com/submit", {
  headers: { Authorization: `Bearer ${token}` },
});
```

When `apiKey` is set, `getToken` builds a proof JWT and calls `POST /api/v1/tokens/exchange`. Without it, `AgentAuth` signs locally with the agent private key (PEM or JWK). Local mint is not the registry path. Pass optional owner fields at construct time when you want them on a locally minted token. `verificationLevel` is an integer 0-3. Do not pass a name string.

```ts
const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: process.env.AGENT_PRIVATE_KEY,
  ownerId: "own_T1mR4xBq9",
  ownerType: "org",
  verificationLevel: 2,
});
```

The SDK does not require an owner display name and does not invent one. Owner display info comes from registry lookup. For Level 2+ the protocol field is `verified_domain`.

Public exports include `AgentAuth`, `generateAgentKeyPair`, `createProofJwt`, `exchangeToken`, `registerAgentPublicKey`, `createDelegationHop`, `hopNarrows`, `isSubset`, and `publicKeyAudience`. To replace an existing key with an owner API key, `registerPublicKey({ currentPrivateKey })` sends a proof JWT. Agent creation is `POST /api/v1/agents` on the registry.

### Service middleware

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

`req.agent` carries `agent_id` and `owner_id` when those claims are on the token. Use `verifyAgentToken(token, options)` outside Express. `audience` is required unless `requireAudience` is false. Only registry JWKS keys (or a caller-supplied `getKey`) verify tokens. On 401, `agentIdMiddleware` sends a `WWW-Authenticate` discovery challenge (spec §3.4.3).

### MCP server

`@agentidp/mcp` is a stdio MCP server for the registry. Tools: `lookup_agent`, `agent_status`, `verify_token` (no API key); `register_agent`, `rotate_agent_key`, `mint_token` (owner API key). Private keys stay in `~/.agentidp/keys` and are never returned by a tool. Configure with `AGENTIDP_API_KEY`, `AGENTIDP_REGISTRY_URL`, and `AGENTIDP_KEY_DIR`. Export `createAgentIdpServer` for a custom transport. There is no hosted or HTTP MCP endpoint.

## Live registry

The hosted registry is live at [https://registry.agentidp.dev](https://registry.agentidp.dev). Point the SDKs at it with:

| Variable | Used by | Default |
| --- | --- | --- |
| `AGENTIDP_REGISTRY_URL` | sdk, verify, mcp | `https://registry.agentidp.dev` |
| `AGENT_PRIVATE_KEY` | `@agentidp/sdk` | none (caller supplies PEM or JWK) |
| `AGENTIDP_API_KEY` | `@agentidp/sdk`, `@agentidp/mcp` | none (owner API key for token exchange and write tools) |
| `AGENTIDP_JWKS_URI` | `@agentidp/verify` | `{AGENTIDP_REGISTRY_URL}/.well-known/jwks.json` |
| `AGENTIDP_KEY_DIR` | `@agentidp/mcp` | `~/.agentidp/keys` |

Canonical paths are `/api/v1/...` and `/.well-known/jwks.json`. There are no bare `/v1/...` routes.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/jwks.json` | Registry signing keys (registry-issued tokens from `POST /api/v1/tokens/exchange`) |
| `GET` | `/api/v1/agents/{agent_id}/public-key` | Agent public JWK for proof verification and `cnf.jkt` |
| `PUT` | `/api/v1/agents/{agent_id}/public-key` | Register or rotate the public JWK (owner auth) |
| `POST` | `/api/v1/tokens/exchange` | Mint a registry-signed AgentIDP token (owner API key and proof JWT). `receipt` is best-effort and may be null; not every token has a receipt |
| `GET` | `/api/v1/agents/{agent_id}/status` | `{ agent_id, status, checked_at }` (`active` / `revoked` / `suspended`) |
| `GET` | `/api/v1/agents/{agent_id}` | Public lookup, including owner fields and `status` when the registry returns them |
| `GET` | `/.well-known/receipt-keys.json` | Keys that verify signed receipts. Separate from token JWKS |
| `GET` | `/api/v1/receipts/{token_id}` | Owner fetch of a stored receipt (404 if none) |

Pass `getKey` for offline verification or tests that do not call the network.

`@agentidp/verify` caches JWKS in memory (default TTL 1 hour). JWKS cache TTL is `min(configured TTL, a shorter Cache-Control max-age)`. Status / revocation cache default is 60 seconds. Status is fetched only when `checkRevocation` is true (default false); that cache TTL is `min(token remaining life, configured TTL, Cache-Control max-age)`. `rateLimit` without a `rateLimitStore` is in-memory on this process only. It does not enforce a global cap across instances.

Set `checkRevocation: true` to query agent status. Set `lookupOwner: true` to fill `verified_domain` (and `owner_id` / `owner_type`) from public lookup. Lookup does not copy an owner display name.

## Specification

Full text: [`spec/AGENTID-RFC-v0.1.0.md`](spec/AGENTID-RFC-v0.1.0.md). Test vectors: [`spec/vectors/token-exchange-v0.1.json`](spec/vectors/token-exchange-v0.1.json).

An AgentIDP token is an ES256 JWT (header `typ` `AIT+jwt`) with agent identity, integer `verification_level` 0-3, capabilities, required `aud`, and `cnf.jkt` on tokens minted by exchange. Maximum lifetime is 24 hours. A service with the issuer's public key can verify the signature without a round-trip. Resource-server DPoP (`DPoP` header, `htm`/`htu`/`ath`) is not implemented. Designed alongside RFC 8693 token exchange and RFC 9449 DPoP. Resource-server DPoP and formal profiles of these specs are on the roadmap.

| Topic | Rule |
| --- | --- |
| Verification levels | Integer 0-3: Unverified (email unconfirmed), Email (email confirmed), Domain, Organisation. Names are prose only. |
| Revocation | `@agentidp/verify` caches JWKS (default 1 hour). JWKS cache TTL is `min(configured TTL, a shorter Cache-Control max-age)`. Status cache default is 60 seconds, fetched only when `checkRevocation` is true (default false); that TTL is `min(token remaining life, configured TTL, Cache-Control max-age)`. Tokens verify against registry JWKS only (or `getKey`). |
| Delegation | Signed narrowing hops (header `typ` `AIT-DLG+jwt`) required at exchange. Unsigned JSON hops are rejected. |
| Owner identity on the token | `owner_id` and `owner_type` only. Display names come from registry lookup (`verified_domain` at Level 2+). |

JWT `typ` remains `AIT+jwt`. Proof JWTs use `AIT-POP+jwt`. Delegation hops use `AIT-DLG+jwt`. Those strings are wire identifiers. In prose this credential is an AgentIDP token.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Use [GitHub Issues](https://github.com/agentidp/agentidp/issues) and [Pull Requests](https://github.com/agentidp/agentidp/pulls).

```bash
pnpm install
pnpm test
pnpm typecheck
```

## License

Apache 2.0 ([LICENSE](LICENSE)).

## Links

- Specification: [`spec/AGENTID-RFC-v0.1.0.md`](spec/AGENTID-RFC-v0.1.0.md)
- npm publish checklist: [`docs/npm-publish.md`](docs/npm-publish.md)
- Site: [agentidp.dev](https://agentidp.dev)
- Registry: [registry.agentidp.dev](https://registry.agentidp.dev)
- GudLab: [gudlab.org](https://gudlab.org)
