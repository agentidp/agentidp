# npm publish checklist

`@agentidp/sdk` and `@agentidp/verify` **0.2.1** and `@agentidp/mcp` **0.1.0** are prepared for a public npm release. Do not publish until Tim (AgentIDP) writes an explicit yes.

This file is a human checklist. Do not run `npm publish` or `pnpm publish` from CI or an agent session unless that approval is on record. Do not put OTP codes, npm tokens, or `.npmrc` auth lines in git, CI logs, or chat.

## Versions

`@agentidp/sdk` and `@agentidp/verify` are **0.2.1** (lockstep); 0.2.0 is on npm and was cut before the rotation proof (sdk) and the issuer and key-fallback fixes (verify). `@agentidp/mcp` is **0.1.0**, its first release, and depends on both. They implement spec v0.2 and the registry `/api/v1/` contract. JWT `typ` strings stay `AIT+jwt`, `AIT-POP+jwt`, and `AIT-DLG+jwt`. Both are `"type": "module"`; from CommonJS use `const { AgentAuth } = await import("@agentidp/sdk")`.

The RFC file in-tree is still `spec/AGENTID-RFC-v0.1.0.md`. Do not publish `0.1.0`; that workspace cut was never released.

Tarball contents are enforced by `pnpm test:pack` and the `pack.test.ts` files: `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`, and `package.json` only. Spec vectors, tests, `.env`, and JWK private members are excluded.

## Preconditions

- [ ] Written approval from Tim to publish
- [ ] This release change is on `main`
- [ ] You own or have publish rights on the `@agentidp` npm org (`npm org ls agentidp`)
- [ ] 2FA is enabled on the npm account that will publish
- [ ] You are logged in as that account (`npm whoami`)
- [ ] `pnpm install && pnpm build && pnpm typecheck && pnpm test && pnpm test:pack` is green
- [ ] `sdk` and `verify` have `"version": "0.2.1"`, `mcp` has `"version": "0.1.0"`, and none has `"private": true`
- [ ] Each package has `"publishConfig": { "access": "public" }`
- [ ] No `.npmrc` with tokens is committed

## Dry run (safe)

From the repo root, after `pnpm build`:

```bash
pnpm --filter @agentidp/sdk pack --dry-run
pnpm --filter @agentidp/verify pack --dry-run
pnpm test:pack
```

Confirm each tarball includes `dist/index.js`, `dist/index.d.ts`, `README.md`, `CHANGELOG.md`, and `LICENSE`, and does not include `spec/vectors`, `tests`, or `.env`.

## Publish (human, after approval)

From a clean checkout of `main`, with 2FA available. Publish with provenance so the npm page can show the GitHub repo:

```bash
pnpm --filter @agentidp/sdk publish --access public --provenance
pnpm --filter @agentidp/verify publish --access public --provenance
pnpm --filter @agentidp/mcp publish --access public --provenance
```

Publish `mcp` last and with `pnpm`, not `npm`: `pnpm publish` rewrites its `workspace:^` dependencies to the `sdk` and `verify` versions just published; `npm publish` would ship them unresolved.

Or, from each package directory after `pnpm build`:

```bash
npm publish --access public --provenance
```

`--provenance` needs an npm CLI that supports it and an identity npm can verify (interactive 2FA publish from a repo remote, or a trusted publisher). If provenance is unavailable in that shell, stop and use a GitHub Actions trusted publisher later. Do not publish without access `public`.

Do not put OTP codes, npm tokens, or `.npmrc` auth lines in git, CI logs, or chat.

## After publish

- `npm view @agentidp/sdk version` and `npm view @agentidp/verify version` should show `0.2.1`, and `npm view @agentidp/mcp version` `0.1.0`
- `npx -y @agentidp/mcp` should start and wait on stdin
- Optional git tags: `sdk-v0.2.1`, `verify-v0.2.1` and `mcp-v0.1.0`
- Update site copy if it still says the packages are unpublished or still lists `0.1.0`

## What this repo must not do

- No `npm publish` / `pnpm publish` in GitHub Actions
- No npm tokens in repository files
