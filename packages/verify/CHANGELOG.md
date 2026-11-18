# Changelog

All notable changes to `@agentidp/verify` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-18

Lockstep npm cut with `@agentidp/sdk`. Implements spec v0.2 and the registry `/api/v1/` contract. JWT `typ` stays `AIT+jwt`. Verifiers also accept `agentidp+jwt` as an alias. 0.1.0 was never published.

### Added

- When `cnf.jkt` is present, format checks (RFC 7638 SHA-256 thumbprint) and optional consistency with `confirmationJwk` / `expectedJkt`.
- `aud` required by default. Missing `aud` is `AID-011`. Set `requireAudience: false` for tokens minted before this rule.

### Breaking

- Tokens without `aud` fail unless `requireAudience: false`.

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

### Changed

- `aud` is required by default (`requireAudience` defaults to `true`). Missing `aud` is `AID-011`. Set `requireAudience: false` for tokens minted before this rule.
- Error messages name the credential an AgentIDP token.

### Breaking

- Tokens without `aud` fail unless `requireAudience: false`.
- `AgentIdError` message strings no longer use the old three-letter token acronym.
