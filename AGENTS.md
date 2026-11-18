# Agent and maintainer rules

This file is for anyone (human or agent) who changes behaviour in this repository, in `agentidp/registry`, or in the protocol text.

## Claims sync

If you change behaviour in `agentidp/registry`, in `packages/sdk`, `packages/verify`, or `packages/mcp`, or in `spec/`, update the matching claims in README, the spec, COMPETITIVE-LANDSCAPE, and the site copy **in the same change** (or the same PR set). Say so in the PR description.

Site copy lives in `agentidp/agentidp.dev` (this repository has no landing-page HTML). Registry behaviour lives in `agentidp/registry`.

## House rules

- Never commit secrets, `.env` files, `.npmrc` tokens, or npm credentials.
- Open a pull request. Do not push directly to `main`.
- Do not run `npm publish` / `pnpm publish`, and do not deploy, without written approval.
- Ship tests with every behaviour change. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test`.
- JWT `typ` wire strings stay `AIT+jwt`, `AIT-POP+jwt`, and `AIT-DLG+jwt`. In prose the credential is an **AgentIDP token**. Do not use the three-letter acronym in prose.
- `verification_level` is the integer 0-3. Names (Unverified, Email, Domain, Organisation) are prose only.
- Do not put an owner display name on the bearer token.
- Describe revocation exactly as `@agentidp/verify` implements it (JWKS cache, status cache, TTLs, freshness). Tokens verify against registry JWKS only, or a caller-supplied `getKey`. Do not claim an agent-public-key verify fallback.

## Claims checklist mapped to code

| Claim | Source of truth in code | Docs that must match |
| --- | --- | --- |
| Verification levels 0-3 | `packages/verify/src/levels.ts`; `packages/sdk/src/types.ts`; `packages/sdk/src/agent-auth.ts`; agentidp/registry `prisma/schema.prisma` (`User.verificationLevel`); agentidp/registry `actions/verify-domain.ts`; agentidp/registry `lib/crypto-types.ts` | `spec/AGENTID-RFC-v0.1.0.md` §3.2; `README.md`; `COMPETITIVE-LANDSCAPE.md`; `packages/sdk/README.md`; `packages/verify/README.md`; agentidp/agentidp.dev `v4/index.html` |
| Token claims (`sub`, `aud`, `scope`/`capabilities`, `cnf.jkt`, `jti`, `exp`, `delegation_chain`) | `packages/sdk/src/types.ts`; `packages/sdk/src/agent-auth.ts`; `packages/verify/src/verify.ts`; `packages/verify/src/types.ts`; `spec/vectors/token-exchange-v0.1.json`; agentidp/registry `app/api/v1/tokens/exchange/route.ts`; agentidp/registry `lib/crypto-types.ts` | `spec/AGENTID-RFC-v0.1.0.md` §3.1, §3.6; `README.md`; `packages/sdk/README.md`; `packages/verify/README.md`; agentidp/agentidp.dev `v4/index.html` |
| Exchange rules (proof JWT, `jti` replay, scope subset, narrowing delegation) | `packages/sdk/src/proof.ts`; `packages/sdk/src/exchange.ts`; `packages/sdk/src/delegation.ts`; `packages/sdk/src/policy.ts`; agentidp/registry `app/api/v1/tokens/exchange/route.ts`; agentidp/registry `lib/agent-proof.ts`; agentidp/registry `lib/token-policy.ts`; agentidp/registry `lib/delegation.ts`; agentidp/registry `lib/replay-store.ts`; agentidp/registry `docs/token-exchange.md` | `spec/AGENTID-RFC-v0.1.0.md` §3.5, §3.6; `README.md`; `packages/sdk/README.md`; `spec/vectors/README.md` |
| Revocation and status freshness | `packages/verify/src/jwks.ts`; `packages/verify/src/cache.ts`; `packages/verify/src/types.ts`; `packages/verify/src/verify.ts`; agentidp/registry `app/api/v1/agents/[agent_id]/status/route.ts`. JWKS cache default 3600s; status cache default 60s; freshness `min(token remaining life, TTL, Cache-Control max-age)`; `checkRevocation` default false. | `spec/AGENTID-RFC-v0.1.0.md` §4.3; `README.md`; `packages/verify/README.md` |
| JWKS and key rotation | `packages/verify/src/jwks.ts` (JWKS only; no agent-public-key fallback); `packages/verify/src/registry.ts`; `packages/sdk/src/exchange.ts`; `packages/sdk/src/proof.ts` (`publicKeyAudience`); `packages/sdk/src/agent-auth.ts` (`registerPublicKey`); agentidp/registry `app/.well-known/jwks.json/route.ts`; agentidp/registry `lib/registry-keys.ts`; agentidp/registry `app/api/v1/agents/[agent_id]/public-key/route.ts` | `spec/AGENTID-RFC-v0.1.0.md` §3.1.2, §4.1; `README.md`; `packages/verify/README.md`; `packages/sdk/README.md` |
| DPoP / RFC 9449 | `packages/verify/src/verify.ts` (`cnf.jkt` check only); `packages/sdk/src/types.ts` (`Confirmation`); agentidp/registry `app/api/v1/tokens/exchange/route.ts` (binds `cnf.jkt`). Resource-server DPoP (`DPoP` header, `htm`/`htu`/`ath`) is not implemented. | `spec/AGENTID-RFC-v0.1.0.md` §3.6.5, §3.7; `README.md`; `COMPETITIVE-LANDSCAPE.md`; `packages/verify/README.md` |
| SDK / verify / mcp package API and versions | `packages/sdk/src/index.ts`; `packages/sdk/package.json`; `packages/verify/src/index.ts`; `packages/verify/package.json`; `packages/verify/src/middleware.ts`; `packages/mcp/src/index.ts`; `packages/mcp/src/cli.ts`; `packages/mcp/package.json` | `README.md`; `packages/sdk/README.md`; `packages/verify/README.md`; `packages/mcp/README.md`; `docs/npm-publish.md`; agentidp/agentidp.dev `v4/index.html` |
| MCP server tools, stdio, and key store | `packages/mcp/src/index.ts` (`lookup_agent`, `agent_status`, `verify_token`, `register_agent`, `rotate_agent_key`, `mint_token`; `createAgentIdpServer`); `packages/mcp/src/cli.ts`; `packages/mcp/src/key-store.ts` (`~/.agentidp/keys`); `packages/mcp/package.json` (`bin` `agentidp-mcp`) | `README.md`; `packages/mcp/README.md`; `docs/npm-publish.md` |
| Registry live URL and canonical paths | `packages/sdk/src/types.ts` (`DEFAULT_REGISTRY_URL`); `packages/verify/src/types.ts`; `packages/verify/src/registry.ts`; `packages/sdk/src/proof.ts`; `packages/sdk/src/exchange.ts`; agentidp/registry `app/api/v1/tokens/exchange/route.ts`; agentidp/registry `app/.well-known/jwks.json/route.ts`; agentidp/registry `app/api/v1/agents/[agent_id]/route.ts`; agentidp/registry `app/api/v1/agents/[agent_id]/status/route.ts`; agentidp/registry `app/api/v1/agents/[agent_id]/public-key/route.ts` | `README.md`; `packages/sdk/README.md`; `packages/verify/README.md`; `spec/AGENTID-RFC-v0.1.0.md` §4.1; `COMPETITIVE-LANDSCAPE.md` |
| Owner email verification and sign-in rules | agentidp/registry `lib/require-verified-owner.ts`; agentidp/registry `lib/email-verification.ts`; agentidp/registry `lib/unverified-account.ts`; agentidp/registry `docs/email-verification.md`; agentidp/registry `auth.ts`; agentidp/registry `actions/register.ts` | `spec/AGENTID-RFC-v0.1.0.md` §3.2, §3.3; `README.md` |
| Standards line | `packages/verify/src/verify.ts` (`cnf.jkt` only); agentidp/registry `docs/token-exchange.md` | Exactly this sentence wherever a standards relationship is stated, in `spec/AGENTID-RFC-v0.1.0.md` §3.7, `README.md`, `COMPETITIVE-LANDSCAPE.md`, `packages/verify/README.md`: "Designed alongside RFC 8693 token exchange and RFC 9449 DPoP. Resource-server DPoP and formal profiles of these specs are on the roadmap." |

## Path index

### This repository

The docs-claims check fails if any of these paths are missing:

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `COMPETITIVE-LANDSCAPE.md`
- `docs/npm-publish.md`
- `spec/AGENTID-RFC-v0.1.0.md`
- `spec/vectors/README.md`
- `spec/vectors/token-exchange-v0.1.json`
- `packages/sdk/README.md`
- `packages/sdk/package.json`
- `packages/sdk/src/index.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk/src/agent-auth.ts`
- `packages/sdk/src/proof.ts`
- `packages/sdk/src/exchange.ts`
- `packages/sdk/src/delegation.ts`
- `packages/sdk/src/policy.ts`
- `packages/verify/README.md`
- `packages/verify/package.json`
- `packages/verify/src/index.ts`
- `packages/verify/src/types.ts`
- `packages/verify/src/levels.ts`
- `packages/verify/src/verify.ts`
- `packages/verify/src/jwks.ts`
- `packages/verify/src/cache.ts`
- `packages/verify/src/registry.ts`
- `packages/verify/src/middleware.ts`
- `packages/mcp/README.md`
- `packages/mcp/package.json`
- `packages/mcp/src/index.ts`
- `packages/mcp/src/cli.ts`
- `packages/mcp/src/key-store.ts`
- `.github/pull_request_template.md`

### agentidp/registry (sibling)

Verified against `agentidp/registry` `main`. A sibling PR must keep these paths in sync with the claims above:

- `prisma/schema.prisma`
- `lib/crypto-types.ts`
- `lib/token-policy.ts`
- `lib/delegation.ts`
- `lib/agent-proof.ts`
- `lib/replay-store.ts`
- `lib/registry-keys.ts`
- `lib/require-verified-owner.ts`
- `lib/email-verification.ts`
- `lib/unverified-account.ts`
- `actions/verify-domain.ts`
- `actions/register.ts`
- `auth.ts`
- `app/api/v1/tokens/exchange/route.ts`
- `app/.well-known/jwks.json/route.ts`
- `app/api/v1/agents/[agent_id]/route.ts`
- `app/api/v1/agents/[agent_id]/status/route.ts`
- `app/api/v1/agents/[agent_id]/public-key/route.ts`
- `docs/token-exchange.md`
- `docs/email-verification.md`

### agentidp/agentidp.dev (sibling, site copy)

This repository has no site HTML. Matching claims belong in:

- `v4/index.html`
- `README.md`
