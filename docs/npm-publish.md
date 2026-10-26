# npm publish checklist

`@agentidp/sdk` and `@agentidp/verify` are prepared for a public npm release. Do not publish until Tim (AgentIDP) writes an explicit yes.

This file is a human checklist. Do not run `npm publish` or `pnpm publish` from CI or an agent session unless that approval is on record.

## Versions

Both packages are **0.1.0**, matching the protocol draft (`spec/AGENTID-RFC-v0.1.0.md`) and the repo root `package.json`. Keep them in lockstep for this first public release.

[PR #6](https://github.com/agentidp/agentidp/pull/6) (JWKS + revocation) does not change `package.json` or publish metadata. Merge it before the first publish only if that verifier behavior should be in the 0.1.0 tarball. Otherwise publish from `main` after this readiness PR lands.

## Preconditions

- [ ] Written approval from Tim to publish
- [ ] This readiness change is on `main`
- [ ] `pnpm install && pnpm build && pnpm test && pnpm typecheck` is green
- [ ] Each package `package.json` has no `"private": true`
- [ ] Each package has `"publishConfig": { "access": "public" }`
- [ ] You are logged in as an `@agentidp` org member (`npm whoami`)
- [ ] No `.npmrc` with tokens is committed

## Dry run (safe)

From the repo root, after `pnpm build`:

```bash
pnpm --filter @agentidp/sdk pack --dry-run
pnpm --filter @agentidp/verify pack --dry-run
```

Confirm each tarball includes `dist/index.js`, `dist/index.d.ts`, `README.md`, `CHANGELOG.md`, and `LICENSE`.

## Publish (human, after approval)

From the repo root:

```bash
pnpm --filter @agentidp/sdk publish --access public
pnpm --filter @agentidp/verify publish --access public
```

Or, from each package directory after `pnpm build`:

```bash
npm publish --access public
```

Do not put OTP codes, npm tokens, or `.npmrc` auth lines in git, CI logs, or chat.

## After publish

- `npm view @agentidp/sdk version` and `npm view @agentidp/verify version` should show `0.1.0`
- Optional git tags: `sdk-v0.1.0` and `verify-v0.1.0`
- Update site copy if it still says the packages are unpublished

## What this repo must not do

- No `npm publish` / `pnpm publish` in GitHub Actions
- No npm tokens in repository files
