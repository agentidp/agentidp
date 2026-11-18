# AgentIDP

Not affiliated with AgentMail's AgentID (agentid.com).

Open protocol for agent identity, authentication and access control. A service that verifies an AgentIDP token can answer:

1. Which agent is this?
2. Who is accountable for it?
3. What is it permitted to do?

OAuth covers user-to-app delegation. OpenID Connect covers user identity federation. AgentIDP covers agent-to-service identity.

## TypeScript packages

This repository holds the protocol text and the TypeScript packages the site documents:

| Package | Path | Version | Role |
| --- | --- | --- | --- |
| [`@agentidp/sdk`](packages/sdk) | `packages/sdk` | `0.2.0` | Agent-side: generate a key, build a proof JWT, call token exchange |
| [`@agentidp/verify`](packages/verify) | `packages/verify` | `0.2.0` | Service-side: verify an AgentIDP token and protect an HTTP route |

Both packages are prepared for a public npm publish as `0.2.0`. They are not on the registry until a maintainer runs [docs/npm-publish.md](docs/npm-publish.md).

After that publish:

```bash
npm i @agentidp/sdk
npm i @agentidp/verify
```

Until then, clone this repo and install from the workspace or a local path:

```bash
git clone https://github.com/agentidp/agentidp.git
cd agentidp
pnpm install
pnpm build
pnpm test
```

From another project, after `pnpm build` in this repo:

```bash
pnpm add @agentidp/sdk@file:../agentidp/packages/sdk
pnpm add @agentidp/verify@file:../agentidp/packages/verify
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

When `apiKey` is set, `getToken` builds a proof JWT and calls `POST /api/v1/tokens/exchange`. Without it, `AgentAuth` still signs locally with the agent private key (PEM or JWK). Pass optional owner fields at construct time when you want them on a locally minted token. `verificationLevel` is an integer 0–3. Do not pass a name string.

```ts
const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: process.env.AGENT_PRIVATE_KEY,
  ownerId: "own_T1mR4xBq9",
  ownerType: "org",
  verificationLevel: 2,
});
```

`owner_name` is not a protocol claim. The SDK does not require it and does not invent one. Owner display info comes from registry lookup; for Level 2+ the protocol field is `verified_domain`.

### Service middleware

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
    console.log(req.agent.agent_id, req.agent.owner_id);
  },
);
```

`req.agent` carries `agent_id` and `owner_id` when those claims are on the token. `owner_name` is not required. Use `verifyAgentToken(token, options)` outside Express.

## Live registry

The default issuer is `https://registry.agentidp.dev`. Point the SDKs at a running registry with:

| Variable | Used by | Default |
| --- | --- | --- |
| `AGENTIDP_REGISTRY_URL` | both packages | `https://registry.agentidp.dev` |
| `AGENT_PRIVATE_KEY` | `@agentidp/sdk` | none (caller supplies PEM or JWK) |
| `AGENTIDP_API_KEY` | `@agentidp/sdk` | none (owner API key for token exchange) |
| `AGENTIDP_JWKS_URI` | `@agentidp/verify` | `{AGENTIDP_REGISTRY_URL}/.well-known/jwks.json` |

Registry contract locked to `/api/v1/` plus well-known JWKS (`agentidp/registry` main, Connor). The host is not live yet. There are no bare `/v1/...` routes.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/jwks.json` | Registry signing keys (registry-issued tokens from `POST /api/v1/tokens/exchange`) |
| `GET` | `/api/v1/agents/{agent_id}/public-key` | Agent public JWK for proof verification and `cnf.jkt` |
| `PUT` | `/api/v1/agents/{agent_id}/public-key` | Register or rotate the public JWK (owner auth) |
| `POST` | `/api/v1/tokens/exchange` | Mint a registry-signed AgentIDP token (owner API key and proof JWT) |
| `GET` | `/api/v1/agents/{agent_id}/status` | `{ agent_id, status, checked_at }` (`active` / `revoked` / `suspended`) |
| `GET` | `/api/v1/agents/{agent_id}` | Public lookup, including owner fields and `status` when the registry returns them |

Pass `getKey` in tests or offline verification. Tests mock JWKS and status so CI does not need a live registry.

Key cache is in memory (default TTL 1 hour; honour a shorter `Cache-Control` `max-age`). JWKS cache recommendation is 1 hour in the spec and in this verifier. Revocation cache default is 60 seconds. Freshness is `min(token remaining life, cache TTL, Cache-Control max-age)`. Revocation is not immediate on the cached path. `rateLimit` without a `rateLimitStore` is in-memory on this process only. It does not enforce a global cap across instances.

Set `checkRevocation: true` when a registry is reachable. Set `lookupOwner: true` to fill `verified_domain` (and `owner_id` / `owner_type`) from public lookup. Lookup does not copy `owner_name`.

## Specification

Full text: [`spec/AGENTID-RFC-v0.1.0.md`](spec/AGENTID-RFC-v0.1.0.md). Test vectors: [`spec/vectors/token-exchange-v0.1.json`](spec/vectors/token-exchange-v0.1.json).

An AgentIDP token is an ES256 JWT (`typ: AIT+jwt`) with agent identity, integer `verification_level` 0–3, capabilities, required `aud`, and `cnf.jkt` on tokens minted by exchange. Maximum lifetime is 24 hours. A service with the issuer's public key can verify the signature without a round-trip. Resource-server DPoP (`DPoP` header, `htm`/`htu`/`ath`) is not implemented. Related IETF drafts (RFC 8693, RFC 9421, Web Bot Auth, WIMSE, AAuth) are related work, not profiles of this spec.

| Topic | v0.1 rule |
| --- | --- |
| Verification levels | Integer 0–3: Unverified (email unconfirmed), Email (email confirmed), Domain, Organisation. Names are prose only. |
| Revocation | Not immediate on the offline path. Effective latency is `min(remaining token TTL, verifier cache TTL)`. JWKS cache recommendation: 1 hour. |
| Delegation | Signed narrowing hops (`AIT-DLG+jwt`) required at exchange. Unsigned v0.1 JSON hops are superseded and rejected. |
| Owner identity on the token | `owner_id` and `owner_type` only. Display names come from registry lookup (`verified_domain` at Level 2+). |

Earlier drafts used a three-letter token name that collides with the OAuth WG Agent Intent Token. JWT `typ` remains `AIT+jwt`. Proof JWTs use `AIT-POP+jwt`. Delegation hops use `AIT-DLG+jwt`. Those strings are wire identifiers.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Use [GitHub Issues](https://github.com/agentidp/agentidp/issues) and [Pull Requests](https://github.com/agentidp/agentidp/pulls).

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
- GudLab: [gudlab.org](https://gudlab.org)
