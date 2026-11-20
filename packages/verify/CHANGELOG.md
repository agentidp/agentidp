# Changelog

All notable changes to `@agentidp/verify` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-20

### Added

- 401 responses from `agentIdMiddleware` carry a `WWW-Authenticate: Bearer realm="agentidp", registry="…", audience="…"` challenge (spec §3.4.3), so an agent without a token can find where to get one. A refused token adds `error="invalid_token"`.
- `agentIdChallenge(options, error?)` builds the same header for code that calls `verifyAgentToken` directly.

## [0.2.1] - 2026-11-20

Upgrade from 0.2.0: that version accepts tokens it should refuse. These changes were listed under 0.2.0 but landed after it was published.

### Breaking

- `exp` is required. `iss` must equal `registryUrl` when keys come from the registry JWKS (override with `issuer`).

### Security

- Removed the fallback that verified a token against the agent's own registered public key when its `kid` was not in the registry JWKS. Any registered agent could sign its own claims. Only registry JWKS keys (or a caller-supplied `getKey`) verify tokens now.
- A token that names a `kid` verifies only against that `kid`, even when the JWKS holds a single key.

## [0.2.0] - 2026-11-18

Lockstep npm cut with `@agentidp/sdk`. Implements spec v0.2 and the registry `/api/v1/` contract. JWT `typ` stays `AIT+jwt`. Verifiers also accept `agentidp+jwt` as an alias. 0.1.0 was never published.

### Added

- When `cnf.jkt` is present, format checks (RFC 7638 SHA-256 thumbprint) and optional consistency with `confirmationJwk` / `expectedJkt`.
- `aud` required by default. Missing `aud` is `AID-011`. Set `requireAudience: false` for tokens minted before this rule.

### Breaking

- Tokens without `aud` fail unless `requireAudience: false`.
- The `audience` option is required. Without it verification fails with `AID-011`, unless `requireAudience: false`.

This verifier does not check a DPoP proof on resource-server requests (`DPoP` header, `htm`/`htu`/`ath`).

## [0.1.0] - 2026-10-26

First workspace release, prepared for a future public npm publish. Version matches protocol draft v0.1.0 and the repo root.

### Added

- `verifyAgentToken` to check an AgentIDP token (signature, `typ`, lifetime, audience, access tier)
- `AID-001` / `AID-002` messages say AgentIDP token (error codes and JWT `typ` unchanged)
- `agentIdMiddleware` for Connect/Express-style HTTP protection
- Optional registry JWKS, public-key, status, and owner lookup
- In-memory key/status cache and optional process-local rate limit
- `AgentIdError` codes (`AID-001` through `AID-011`, plus `AID-013`, `AID-014`, `AID-016`, `AID-017`)
- Registry wire `typ` is `AIT+jwt`. Verifiers also accept `agentidp+jwt` as an alias.
- When `cnf.jkt` is present, format checks and optional consistency with `confirmationJwk` / `expectedJkt`
- `lookupOwner` fills `verified_domain` from public lookup. It does not copy `owner_name`.

### Changed

- `aud` is required by default (`requireAudience` defaults to `true`). Missing `aud` is `AID-011`. Set `requireAudience: false` for tokens minted before this rule.
- Error messages name the credential an AgentIDP token.
- `verification_level` on `VerifiedAgent` is the integer 0–3. Name strings are not the claim format.
- `owner_name` is optional. Absence is accepted. Display names come from `verified_domain` on registry lookup.

### Breaking

- Tokens without `aud` fail unless `requireAudience: false`.
- `AgentIdError` message strings no longer use the old three-letter token acronym.
