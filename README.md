# AgentIDP

Open protocol for agent identity, authentication and access control. A service that verifies an Agent Identity Token (AIT) can answer:

1. Which agent is this?
2. Who is accountable for it?
3. What is it permitted to do?

OAuth covers user-to-app delegation. OpenID Connect covers user identity federation. AgentIDP covers agent-to-service identity.

## TypeScript packages

This repository holds the protocol text and the TypeScript packages the site documents:

| Package | Path | Role |
| --- | --- | --- |
| [`@agentidp/sdk`](packages/sdk) | `packages/sdk` | Agent-side: mint an AIT with a caller-held private key |
| [`@agentidp/verify`](packages/verify) | `packages/verify` | Service-side: verify an AIT and protect an HTTP route |

The packages are named `@agentidp/sdk` and `@agentidp/verify`. They live in this repo today. They are not published to npm yet; publish waits on approval. Install from the workspace or a local path.

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
import { AgentAuth } from "@agentidp/sdk";

const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: process.env.AGENT_PRIVATE_KEY,
});

const token = await auth.getToken({
  audience: "https://api.example.com",
});

await fetch("https://api.example.com/submit", {
  headers: { Authorization: `Bearer ${token}` },
});
```

`AgentAuth` signs locally with the agent private key (PEM or JWK). Pass optional owner fields at construct time when you want them on the token:

```ts
const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: process.env.AGENT_PRIVATE_KEY,
  ownerId: "own_T1mR4xBq9",
  ownerName: "Acme Inc",
  ownerType: "org",
  verificationLevel: "domain",
});
```

If you omit `ownerName`, the minted AIT has no `owner_name` claim. The SDK does not invent one.

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
    console.log(req.agent.owner_name);
  },
);
```

`req.agent` carries `agent_id` and, when present on the token, `owner_name` plus the other owner claims. Use `verifyAgentToken(token, options)` outside Express.

## Live registry

The default issuer is `https://registry.agentidp.dev`. Point the SDKs at a running registry with:

| Variable | Used by | Default |
| --- | --- | --- |
| `AGENTIDP_REGISTRY_URL` | both packages | `https://registry.agentidp.dev` |
| `AGENT_PRIVATE_KEY` | `@agentidp/sdk` | none (caller supplies PEM or JWK) |
| `AGENTIDP_JWKS_URI` | `@agentidp/verify` | `{AGENTIDP_REGISTRY_URL}/.well-known/jwks.json` |

Registry contract (from `agentidp/registry` on main). `@agentidp/verify` tries the Next.js `/api/v1/...` path first, then spec `/v1/...`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/jwks.json` | Registry signing keys (registry-issued tokens from `POST /api/v1/tokens/exchange`) |
| `GET` | `/api/v1/agents/{agent_id}/public-key` | Agent public JWK for agent-signed AITs. Spec alias: `/v1/agents/{agent_id}/public-key` |
| `GET` | `/api/v1/agents/{agent_id}/status` | `{ agent_id, status, checked_at }` (`active` / `revoked` / `suspended`) |
| `GET` | `/api/v1/agents/{agent_id}` | Public lookup, including owner fields and `status` when the registry returns them |

Pass `getKey` in tests or offline verification. Tests mock JWKS and status so CI does not need a live registry.

Key cache is in memory (default TTL 1 hour; honour a shorter `Cache-Control` `max-age`). Revocation cache default is 60 seconds. Freshness is `min(token remaining life, cache TTL, Cache-Control max-age)`. `rateLimit` without a `rateLimitStore` is in-memory on this process only. It does not enforce a global cap across instances.

Set `checkRevocation: true` when a registry is reachable. Set `lookupOwner: true` if you want `owner_name` filled from public lookup when the token omitted it.

## Specification

Full text: [`spec/AGENTID-RFC-v0.1.0.md`](spec/AGENTID-RFC-v0.1.0.md).

An AIT is an ES256 JWT (`typ: AIT+jwt`) with agent identity, owner verification, capabilities, and an optional delegation chain. Maximum lifetime is 24 hours. A service with the issuer's public key can verify the token without a round-trip.

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
- Site: [agentidp.dev](https://agentidp.dev)
- GudLab: [gudlab.org](https://gudlab.org)
