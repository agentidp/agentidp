# Changelog

All notable changes to `@agentidp/verify` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-26

First workspace release, prepared for a future public npm publish. Version matches protocol draft v0.1.0 and the repo root.

### Added

- `verifyAgentToken` to check an AgentIDP token (signature, `typ`, lifetime, audience, access tier)
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
