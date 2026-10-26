# Changelog

All notable changes to `@agentidp/sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-26

First workspace release, prepared for a future public npm publish. Version matches protocol draft v0.1.0 and the repo root.

### Added

- `AgentAuth` to mint ES256 Agent Identity Tokens (AIT) with a caller-held private key
- `getToken({ audience, capabilities?, expiresInSeconds? })` with a 24-hour maximum lifetime (default 1 hour)
- Optional agent and owner claims (`agent_name`, `owner_id`, `owner_name`, `owner_type`, `verification_level`)
- `decodeAitClaims` and `importPrivateKey` helpers
