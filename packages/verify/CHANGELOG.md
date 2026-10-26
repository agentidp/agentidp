# Changelog

All notable changes to `@agentidp/verify` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-26

First workspace release, prepared for a future public npm publish. Version matches protocol draft v0.1.0 and the repo root.

### Added

- `verifyAgentToken` to check an AIT (signature, `typ`, lifetime, audience, access tier)
- `agentIdMiddleware` for Connect/Express-style HTTP protection
- Optional registry JWKS, public-key, status, and owner lookup
- In-memory key/status cache and optional process-local rate limit
- `AgentIdError` codes (`AID-001` through `AID-010`)
