# Changelog

All notable changes to `@agentidp/sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-18

Lockstep npm cut with `@agentidp/verify`. Implements spec v0.2 and the registry `/api/v1/` contract. JWT `typ` strings stay `AIT+jwt` (minted AgentIDP token), `AIT-POP+jwt` (proof), and `AIT-DLG+jwt` (delegation hop). 0.1.0 was never published.

### Added

- Key rotation proof: `registerPublicKey({ currentPrivateKey })` and `registerAgentPublicKey({ proof })` send the proof the registry now requires to replace an existing key with an API key. `publicKeyAudience` and a `createProofJwt` `audience` option build it.
- Agent-held key: `generateAgentKeyPair` (ES256 or EdDSA). Register only the public JWK (`assertPublicJwk`, `toPublicJwk`).
- Proof JWT: `createProofJwt` / `AgentAuth.createProofJwt` (`iss`/`sub` = agent id, `aud` = the token endpoint, max 5 minutes).
- Token exchange: `exchangeToken` / `AgentAuth.exchangeToken` for `POST /api/v1/tokens/exchange`.
- `registerAgentPublicKey` / `AgentAuth.registerPublicKey`.
- Signed delegation hops: `createDelegationHop`, `decodeDelegationHop`, `hopNarrows`, `isSubset`.

### Changed

- When `apiKey` or `AGENTIDP_API_KEY` is set, `getToken` builds a proof JWT and calls token exchange instead of signing locally. Omit the API key to keep local mint. Local mint is not the registry path.

### Breaking

- Callers that passed `apiKey` expecting local mint now hit the registry.

## [0.1.0] - 2026-10-26

First workspace release, prepared for a future public npm publish. Version matches protocol draft v0.1.0 and the repo root.

### Added

- `AgentAuth` to mint ES256 AgentIDP tokens with a caller-held private key
- `getToken({ audience, capabilities?, expiresInSeconds? })` with a 24-hour maximum lifetime (default 1 hour)
- Optional agent and owner claims (`agent_name`, `owner_id`, `owner_type`, integer `verification_level` 0–3). `owner_name` is not a protocol claim and is omitted unless the caller supplies it for local mint.
- `decodeAitClaims` and `importPrivateKey` helpers
- `generateAgentKeyPair` (ES256 or EdDSA). Register only the public JWK
- `createProofJwt` and `AgentAuth.createProofJwt` (iss/sub = agent id, aud = token endpoint, max 5 minutes)
- `exchangeToken` / `AgentAuth.exchangeToken` for `POST /api/v1/tokens/exchange`
- `registerAgentPublicKey` / `AgentAuth.registerPublicKey`
- `createDelegationHop` for signed compact JWS hops
- `isSubset` and `hopNarrows` client-side copies of the mint rules

### Changed

- When `apiKey` or `AGENTIDP_API_KEY` is set, `getToken` calls token exchange with a proof JWT instead of signing locally. Without an API key, `getToken` still signs locally. Local mint is not the registry path.
- Proof, hop, and minted-token JWT `typ` values match the registry wire identifiers: `AIT-POP+jwt`, `AIT-DLG+jwt`, and `AIT+jwt`. The human-readable name is AgentIDP token.
- `verificationLevel` is an integer 0–3. Name strings such as `"domain"` are not accepted.

### Breaking

- Callers that passed `apiKey` expecting local mint now hit the registry. Omit `apiKey` to keep local mint.
- `getToken` lifetime errors now say "AgentIDP token" rather than the old three-letter acronym.
