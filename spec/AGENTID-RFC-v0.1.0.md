# AgentID Protocol Specification

**Open Specification for Agent Identity, Authentication & Access Control**

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Status** | Draft specification (not a product) |
| **Date** | 18 November 2026 |
| **Authors** | Timchosen Uzua |
| **Published by** | GudLab \| gudlab.org |
| **License** | Apache 2.0 (this specification) |

> This document is a **draft protocol specification**. It is not an SDK, a hosted registry, or a product. Code samples and hostnames below are illustrative.

> The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Protocol Specification](#3-protocol-specification)
    - 3.6 [Token Exchange](#36-token-exchange)
    - 3.7 [Related IETF work](#37-related-ietf-work)
4. [Agent Registry Architecture](#4-agent-registry-architecture)
5. [Technical Architecture](#5-technical-architecture)
6. [Security Considerations](#6-security-considerations)
7. [Integration Patterns](#7-integration-patterns)
8. [Governance & Ecosystem](#8-governance--ecosystem)
9. [Roadmap](#9-roadmap)
10. [Appendix](#10-appendix)

---

## 1. Executive Summary

The AgentID Protocol defines an open standard for establishing, verifying, and managing the identity of autonomous AI agents operating across the internet. As AI agents increasingly interact with web services, APIs, and each other on behalf of humans and organisations, the industry lacks a universal mechanism to answer three fundamental questions:

- **Which agent is this?**
- **Who is accountable for it?**
- **What is it permitted to do?**

This draft specifies a lightweight, cryptographically verifiable identity layer for those agents. It draws on patterns from OAuth 2.0, OpenID Connect, X.509, and SPIFFE, adapted for non-human actors that operate at machine speed, chain together in delegation hierarchies, and act on behalf of principals who may not be present at the time of action.

This specification defines:

- (a) the **AgentIDP token** format
- (b) the **Agent Registration and Verification** process
- (c) the **Agent Registry** architecture
- (d) **Access control and delegation** mechanisms, including token exchange
- (e) the **Technical architecture** for implementing compliant services

### Design Principles

**Open specification.** This document is Apache 2.0. Anyone MAY implement a compliant registry or verifier. This repository does not ship an SDK and does not operate a public registry. A hosted registry, if one is offered later, MAY be commercial; that is out of scope for this draft.

---

## 2. Problem Statement

### 2.1 The Identity Gap

Today's internet authentication was designed for humans interacting with services through browsers. OAuth lets a user grant an application limited access to their resources. OpenID Connect lets a user prove their identity across services. Neither protocol was designed for autonomous software agents that:

- Operate independently
- Chain together in multi-step workflows
- Make decisions without a human in the loop

The result is a proliferation of ad-hoc solutions: raw API keys with no ownership tracing, OAuth tokens repurposed beyond their design intent, and proprietary agent authentication schemes that fragment the ecosystem.

### 2.2 Threat Model

Without a standardised agent identity layer, services face the following threats:

| Threat | Description |
|--------|-------------|
| **Unattributable abuse** | An anonymous agent submits 100,000 spam entries to a form, books fake appointments, or scrapes content. The service has no way to trace the actor or hold anyone accountable. |
| **Impersonation** | A malicious agent claims to act on behalf of a reputable organisation without any verifiable proof. |
| **Privilege escalation** | An agent granted read access to a calendar exploits loose controls to write or delete entries. |
| **Delegation opacity** | Agent A spawns Agent B which spawns Agent C. A service receiving a request from Agent C has no visibility into the delegation chain or the original authorising principal. |
| **Rate-limit evasion** | Without stable agent identity, rate limiting falls back to IP addresses, which agents trivially rotate. |

### 2.3 Requirements

The protocol MUST satisfy the following requirements:

1. **Verifiable identity** — A service MUST be able to cryptographically verify an agent's identity without a synchronous call to a central authority.
2. **Owner accountability** — Every agent identity MUST be traceable to a verified human or organisational owner.
3. **Granular access control** — Services MUST be able to define policies based on agent identity, owner identity, verification level, and declared capabilities.
4. **Delegation transparency** — When an agent acts on behalf of another agent or a human, the full chain of delegation MUST be inspectable.
5. **Revocability** — Compromised or abusive agent identities MUST be revocable in real time.
6. **Interoperability** — The protocol MUST work across agent frameworks (LangChain, CrewAI, AutoGen, MCP, custom), programming languages, and deployment models.
7. **Performance** — Token verification MUST be possible offline (no round-trip) using cached public keys, with registry lookups reserved for enhanced checks.

---

## 3. Protocol Specification

### 3.1 AgentIDP token

An AgentIDP token is a signed JSON Web Token (JWT) conforming to [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519), with a claim set designed for agent identification. Registry-issued tokens are self-contained: any service with access to the issuer's public key can verify the token without contacting the registry for the signature check.

This document names the credential an **AgentIDP token**. JWT `typ` values `AIT+jwt`, `AIT-POP+jwt`, and `AIT-DLG+jwt` are wire identifiers kept for compatibility with the registry. The AIT acronym is retired in prose.

#### 3.1.1 Token Structure

**Header**

```json
{
  "alg": "ES256",
  "typ": "AIT+jwt",
  "kid": "agentidp-2026-03-01"
}
```

| Field | Status | Description |
|-------|--------|-------------|
| `alg` | REQUIRED | ECDSA P-256 for registry-issued tokens |
| `typ` | REQUIRED | `AIT+jwt` (wire identifier; the credential is an AgentIDP token) |
| `kid` | REQUIRED | Key ID for rotation |

**Payload (Claims)**

```json
{
  // ── Identity Claims ──
  "agent_id": "ag_7xK9m2nP4qRtL8",
  "agent_name": "AcmeBookingAgent",
  "agent_version": "1.2.0",
  "agent_description": "Handles calendar bookings",

  // ── Owner Claims ──
  "owner_id": "own_T1mR4xBq9",
  "owner_type": "org",
  "owner_name": "Acme Inc",
  "verification_level": "domain",

  // ── Capability Claims ──
  "capabilities": [
    "form:submit",
    "calendar:read",
    "calendar:write"
  ],

  // ── Delegation Claims ──
  "delegation_chain": [
    {
      "principal_type": "user",
      "principal_id": "usr_abc123",
      "granted_at": "2026-03-01T10:00:00Z",
      "scopes": ["calendar:read"]
    }
  ],

  // ── Standard JWT Claims ──
  "iss": "https://registry.agentidp.dev",
  "sub": "ag_7xK9m2nP4qRtL8",
  "aud": "https://api.example.com",
  "iat": 1740000000,
  "exp": 1740003600,
  "jti": "tok_unique_nonce_123",
  "cnf": {
    "jkt": "ZvM2EutclQ8FLC0Oh07tG8bYwYOwx2jLHbl5bQrRyp0"
  }
}
```

| Claim | Status | Description |
|-------|--------|-------------|
| `agent_id` | REQUIRED | Globally unique agent identifier |
| `agent_name` | REQUIRED | Human-readable name |
| `agent_version` | RECOMMENDED | Semantic version |
| `agent_description` | OPTIONAL | Description of agent purpose |
| `owner_id` | REQUIRED | Owner reference |
| `owner_type` | REQUIRED | `"person"` or `"org"` |
| `owner_name` | REQUIRED | Owner display name |
| `verification_level` | REQUIRED | See Section 3.2 |
| `capabilities` | OPTIONAL | Declared capabilities |
| `delegation_chain` | OPTIONAL | See Section 3.5 |
| `iss` | REQUIRED | Registry URL |
| `sub` | REQUIRED | Same as `agent_id` |
| `aud` | REQUIRED | Target service URI. Tokens minted by Section 3.6 MUST include `aud`. |
| `iat` | REQUIRED | Issued at |
| `exp` | REQUIRED | Expiry (max 24h lifetime) |
| `jti` | REQUIRED | Unique token ID for replay prevention |
| `cnf` | REQUIRED for tokens minted by Section 3.6 | Confirmation method. See Section 3.6.5. |

#### 3.1.2 Cryptographic Requirements

Registry-issued AgentIDP tokens MUST be signed using **ES256** (ECDSA with P-256 curve and SHA-256). RSA-based algorithms are excluded for registry-issued tokens to keep token sizes small.

Agent key pairs are generated by the agent (or its operator), not by the registry. Only the public JWK is registered. Services verify registry-issued tokens by fetching the registry signing keys via the JWKS endpoint, with aggressive caching (RECOMMENDED TTL: 24 hours). Agent proof JWTs (Section 3.6.2) MAY use ES256 or EdDSA (Ed25519).

#### 3.1.3 Token Lifetime

AgentIDP tokens MUST have a maximum lifetime of 24 hours. For high-security contexts, a lifetime of 1 hour or less is RECOMMENDED. Short-lived tokens limit the blast radius of key compromise. Agents MUST refresh by repeating token exchange (Section 3.6) with a new proof JWT. The owner API key alone MUST NOT mint a token.

### 3.2 Owner Verification Levels

The AgentID protocol defines four verification levels, each providing increasing assurance about the agent owner's identity. Services can set minimum verification requirements per endpoint or form.

| Level | Name | Verification Method | Use Case |
|-------|------|---------------------|----------|
| 0 | **Unverified** | Email address confirmed only | Testing, development, open forms |
| 1 | **Email** | Email + phone verification | Low-risk public services |
| 2 | **Domain** | DNS TXT record or hosted file at owner's domain | Business APIs, partner integrations |
| 3 | **Organisation** | KYB: company registration, legal entity verification | Financial services, healthcare, regulated industries |

### 3.3 Agent Registration Flow

Agent registration is a two-phase process: owner verification (performed once) followed by agent creation (performed per agent). A single verified owner can register multiple agents.

**Phase 1: Owner Registration**

1. Owner signs up at an AgentID-compliant registry. This draft uses `registry.agentidp.dev` as an example hostname; it is not a public service in this version.
2. Owner completes verification to their desired level (email, domain DNS, or KYB document submission).
3. Registry issues an `owner_id` and an owner API key for agent management operations.

**Phase 2: Agent Registration**

1. The agent (or its operator) generates an ES256 (P-256) or EdDSA (Ed25519) key pair locally.
2. Owner calls `POST /api/v1/agents` with agent name, description, declared capabilities, and `public_key` (public JWK only). The registry MUST NOT generate or return an agent private key.
3. The registry stores the public JWK and returns the `agent_id`. A later `PUT /api/v1/agents/{agent_id}/public-key` registers or rotates the public JWK.
4. The agent proves possession of the matching private key at token exchange (Section 3.6). The private key MUST NOT be sent to the registry.

> **Security Note:** The agent's private key MUST be generated client-side. The registry MUST reject JWKs that include private members (`d`, RSA factors, oct `k`) with `AID-017`. If no usable public JWK is registered, token exchange MUST fail with `AID-016`. There is no owner-key-only fallback.

### 3.4 Service-Side Access Control

Services consuming AgentIDP tokens implement access policies based on the claims present in the token. The protocol defines three standard access tiers that services MAY adopt:

#### 3.4.1 Access Tiers

| Tier | Description | Rate Limiting | Use Case |
|------|-------------|---------------|----------|
| **Open** | Any agent may access. No AgentIDP token required. | IP-based only | Public forms, read-only APIs, open data |
| **Authenticated** | Valid AgentIDP token from any registered agent required. Token signature and revocation status verified. | Per `agent_id` | General-purpose APIs, standard forms |
| **Permissioned** | Valid AgentIDP token required AND `agent_id` or `owner_id` must be on an explicit allowlist. | Per `agent_id` | Partner integrations, sensitive data, high-value transactions |

#### 3.4.2 Policy Expression

Services define policies as a set of rules evaluated against AgentIDP token claims. The protocol RECOMMENDS the following policy structure:

```json
{
  "resource": "/forms/application-form",
  "access_tier": "authenticated",
  "min_verification_level": 2,
  "required_capabilities": ["form:submit"],
  "rate_limit": {
    "requests_per_hour": 100,
    "scope": "agent_id"
  },
  "allowlist": null,
  "denylist": ["ag_known_bad_actor"]
}
```

### 3.5 Delegation Chain

A critical feature of the AgentID protocol is transparent delegation. When Agent A instructs Agent B to perform an action, or when a human user authorises an agent to act on their behalf, the delegation chain is presented at token exchange and MAY be copied onto the minted AgentIDP token so that the receiving service can inspect provenance.

#### 3.5.1 Delegation Chain Structure

On `POST /api/v1/tokens/exchange`, `delegation_chain` is an ordered array of **compact JWS** hops, from the first delegating agent (index 0) to the hop whose `sub` is the acting agent. Unsigned JSON objects MUST be rejected (`AID-009`). Owner/user hops (`principal_type: user`) are not accepted in this version; they require owner signing keys that this draft does not specify.

Each hop MUST be signed by the **delegating** agent's registered key (`alg` `ES256` or `EdDSA`). The JWT `typ` SHOULD be `AIT-DLG+jwt` (wire identifier). If `typ` is present, it MUST be `AIT-DLG+jwt` or `JWT`.

| Claim | Rule |
|-------|------|
| `iss` | Delegating `agent_id` |
| `sub` | Delegate `agent_id` |
| `aud` | Granted audience |
| `scopes` or `scope` | Granted scopes (array or space-delimited string) |
| `exp` | Unix seconds; MUST NOT be later than the previous hop |
| `jti` | Unique hop id |

Hop `i` `iss` MUST equal hop `i-1` `sub`. The last hop `sub` MUST equal the acting `agent_id`. Depth MUST be at most 8.

Historical documents showed unsigned delegation objects on the token. That form MUST NOT be accepted at exchange.

#### 3.5.2 Scope Attenuation

Each hop MUST only narrow. Hop `i` scopes MUST be an exact, case-sensitive subset of hop `i-1` scopes. Hop `i` `aud` values MUST be a subset of hop `i-1` `aud`. Hop `i` `exp` MUST NOT be later than hop `i-1` `exp`. Requested exchange scopes MUST be a subset of the last hop, and the request `aud` MUST be included in the last hop `aud`. The minted token `exp` MUST NOT exceed the last hop `exp`. A widening hop MUST be rejected with `AID-009`.

### 3.6 Token Exchange

This section is normative for `POST /api/v1/tokens/exchange`. A hosted registry that mints AgentIDP tokens MUST implement these rules. The owner API key authenticates the owner. It is not sufficient on its own.

Test vectors for the cases below live in [`vectors/token-exchange-v0.1.json`](vectors/token-exchange-v0.1.json). The keys in that file are labelled **TEST ONLY** and MUST NOT be used outside tests.

#### 3.6.1 Request

```
POST /api/v1/tokens/exchange
Authorization: Bearer aidp_<keyId>_<secret>
Content-Type: application/json
```

```json
{
  "agent_id": "ag_7xK9m2nP4qRt",
  "aud": "https://api.example.com",
  "lifetime": 3600,
  "scopes": ["calendar:read"],
  "proof": "<compact AIT-POP+jwt>",
  "delegation_chain": ["<compact AIT-DLG+jwt>"]
}
```

| Field | Required | Rule |
|-------|----------|------|
| `agent_id` | MUST | Starts with `ag_` and belongs to the authenticated owner |
| `aud` | MUST | Target service URI. `audience` MAY be accepted as an alias. Missing or empty is `AID-011` |
| `proof` | MUST | Compact JWT signed by the agent's registered key. Missing or invalid is `AID-013` |
| `scopes` | OPTIONAL | Exact, case-sensitive subset of registered `capabilities`. Duplicates fail. Wildcards MUST NOT match. Omit to mint the full registered set. Extra values are `AID-014` |
| `lifetime` | OPTIONAL | Seconds, 60–86400. Default 3600 |
| `delegation_chain` | OPTIONAL | Array of compact JWS hops (Section 3.5). Unsigned objects are `AID-009` |

The owner API key MUST authorise `tokens:exchange` for that agent. A stolen owner key MUST NOT mint a token without the agent private key.

#### 3.6.2 Proof JWT

The proof JWT proves possession of the agent's registered private key.

| Item | Rule |
|------|------|
| Compact form | MUST be a three-part JWS |
| `alg` | MUST be `ES256` or `EdDSA`, matching the registered public JWK |
| `typ` | SHOULD be `AIT-POP+jwt` (wire identifier). If present, MUST be `AIT-POP+jwt` or `JWT` |
| `iss`, `sub` | MUST equal `agent_id` |
| `aud` | MUST be `{registry origin}/api/v1/tokens/exchange`. Implementations SHOULD also accept `{registry origin}/v1/tokens/exchange` as an alias |
| `iat`, `exp` | MUST be present. `exp - iat` MUST be greater than 0 and MUST NOT exceed 300 seconds |
| Clock skew | SHOULD allow 60 seconds |
| `jti` | MUST be unique. Reuse is `AID-010` |

Wrong key, wrong `aud`, expired proof, or `iat` too far in the future MUST be `AID-013`.

#### 3.6.3 Public JWK registration

Agents MUST generate their own key pair and register **only** the public JWK:

```
POST /api/v1/agents
{ "name": "Calendar Agent", "capabilities": ["calendar:read"], "public_key": { "kty": "EC", "crv": "P-256", "x": "...", "y": "...", "alg": "ES256" } }

PUT /api/v1/agents/{agent_id}/public-key
{ "public_key": { ... } }
```

Private members (`d`, RSA `p`/`q`/`dp`/`dq`/`qi`, oct `k`) MUST be rejected with `AID-017`. Supported algorithms: ES256 (P-256) and EdDSA (Ed25519). No registered public JWK is `AID-016`. The registry MUST NOT mint from the owner API key alone.

#### 3.6.4 Response

```json
{
  "token": "<compact AgentIDP token>",
  "token_type": "AIT+jwt",
  "token_id": "tok_...",
  "expires_at": "2026-11-18T17:00:00.000Z",
  "agent_id": "ag_7xK9m2nP4qRt",
  "kid": "agentidp-2026-11-16-x540"
}
```

The minted token MUST be signed by the registry (`alg=ES256`, `kid` from `/.well-known/jwks.json`). `iss` MUST be the registry origin. `aud` MUST be the requested audience. `capabilities` MUST be the granted subset. Header `typ` MUST be `AIT+jwt`. `token_type` MUST be `AIT+jwt`. These strings are wire identifiers; the credential is an AgentIDP token.

#### 3.6.5 Confirmation (`cnf.jkt`)

Minted tokens MUST include a confirmation claim as in [RFC 7800](https://www.rfc-editor.org/rfc/rfc7800.html) and [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html) Section 6:

```json
"cnf": { "jkt": "<base64url SHA-256 JWK thumbprint of the agent public key>" }
```

`jkt` MUST be the SHA-256 JWK thumbprint of the agent's registered public JWK computed per [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638.html). Resource-server Demonstrating Proof of Possession (the `DPoP` HTTP header, `htm` / `htu` / `ath`) is **not** specified here and is **not** required of verifiers in this version. A verifier MUST accept `cnf` when present. When a confirmation JWK is supplied, the verifier MUST check that `cnf.jkt` matches that JWK's thumbprint. Implementations MUST NOT claim that DPoP at resource servers is implemented solely because `cnf.jkt` is present.

#### 3.6.6 Replay

The registry MUST record each proof `jti` until the proof expires (implementations MAY add the clock-skew window). The registry MUST record each minted token `jti` until that token expires. Presenting a recorded `jti` again MUST return `AID-010`. If the replay store cannot complete the write, the registry MUST fail closed (HTTP 503). Implementations SHOULD prefer a replicated cache and MAY fall back to durable storage. This document does not require a particular vendor.

#### 3.6.7 Error codes

| Code | HTTP | When |
|------|------|------|
| `AID-013` | 401 | Missing, expired, future `iat`, wrong `aud`, or proof not signed by the registered agent key |
| `AID-016` | 400 | No registered public JWK |
| `AID-017` | 400 | `public_key` contains private fields or is not ES256/EdDSA |
| `AID-010` | 400 | Proof `jti` or minted token `jti` reused |
| `AID-011` | 400 | Missing `aud` / `audience` |
| `AID-014` | 403 | Requested scope is not a subset of registered capabilities |
| `AID-009` | 400 | Unsigned hop, widening hop, over-depth chain (max 8), or hop not signed by the delegating agent's key |
| `AID-003` / `AID-004` | 403 | Agent revoked / suspended |
| `AID-007` | 429 | Rate limit |
| *(503)* | 503 | Replay store down (fail closed) or registry signing key unavailable |

### 3.7 Related IETF work

This protocol borrows patterns. It is not a profile of the documents below unless a sentence in this section says so.

**[RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html) OAuth 2.0 Token Exchange.** AgentIDP token exchange is a JSON `POST` that returns a new token given owner authentication and an agent proof. It does **not** use `application/x-www-form-urlencoded`, `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `subject_token`, or `actor_token`. Implementations MUST NOT claim RFC 8693 compatibility. A later revision MAY add a form-encoded alias; this version does not.

**[RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html) DPoP and [RFC 7800](https://www.rfc-editor.org/rfc/rfc7800.html) confirmation.** Minted tokens carry `cnf.jkt` so a later DPoP verifier can bind the token to the agent key. This specification does not require resource servers to verify a DPoP proof JWT. Sender-constrained use at resource servers is out of scope.

**[RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html) HTTP Message Signatures.** AgentIDP tokens are JWTs presented in `Authorization`. This specification does not define `Signature-Input` or `Signature` headers and does not implement RFC 9421.

**IETF Web Bot Auth** (HTTP Message Signatures for automated traffic, e.g. `draft-meunier-webbotauth-httpsig-protocol`). Web Bot Auth identifies automated HTTP clients with RFC 9421 signatures. AgentIDP identifies agents, owners, and capabilities with a registry-issued JWT. The two can be used together. This specification does not implement Web Bot Auth.

**WIMSE** (Workload Identity in Multi-System Environments). WIMSE defines workload identifiers and HTTP-signature credentials for workloads. AgentIDP agents are not WIMSE workloads in this version. No WIMSE identifier is required.

**AAuth** (agent authorization grant drafts, e.g. `draft-rosenberg-oauth-aauth`). AAuth extends OAuth for agent grants. AgentIDP is a separate protocol. This specification does not implement an AAuth grant and does not claim compatibility.

---

## 4. Agent Registry Architecture

The Agent Registry is specified as the trust anchor: it stores agent public keys, owner verification records, revocation status, and provides APIs for registration, lookup, and verification. A public instance is not part of this draft.

### 4.1 Registry API

The registry exposes a RESTful API with the following core endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/owners` | Register a new owner account |
| `POST` | `/api/v1/owners/{id}/verify` | Submit verification evidence |
| `POST` | `/api/v1/agents` | Register a new agent (owner auth and public JWK required) |
| `GET` | `/api/v1/agents/{agent_id}` | Public agent lookup |
| `GET` | `/api/v1/agents/{agent_id}/public-key` | Fetch agent's public key (JWK) |
| `PUT` | `/api/v1/agents/{agent_id}/public-key` | Register or rotate the public JWK (owner auth) |
| `DELETE` | `/api/v1/agents/{agent_id}` | Revoke an agent (owner auth required) |
| `GET` | `/.well-known/jwks.json` | Registry JWKS endpoint (registry signing keys) |
| `GET` | `/api/v1/agents/{agent_id}/status` | Revocation check (real-time) |
| `POST` | `/api/v1/tokens/exchange` | Mint an AgentIDP token (owner API key **and** agent proof JWT) |

### 4.2 Agent Lookup Response

When a service queries the registry for an agent, it receives the following public information:

```http
GET /api/v1/agents/ag_7xK9m2nP4qRtL8
```

```json
{
  "agent_id": "ag_7xK9m2nP4qRtL8",
  "agent_name": "AcmeBookingAgent",
  "agent_version": "1.2.0",
  "status": "active",
  "owner": {
    "owner_id": "own_T1mR4xBq9",
    "owner_name": "Acme Inc",
    "owner_type": "org",
    "verification_level": 2,
    "verified_domain": "acme.inc"
  },
  "capabilities": ["form:submit", "calendar:read", "calendar:write"],
  "registered_at": "2026-02-15T08:30:00Z",
  "public_key_url": "/api/v1/agents/ag_7xK9m2nP4qRtL8/public-key",
  "abuse_contact": "security@acme.inc"
}
```

### 4.3 Revocation

Agent revocation is immediate. When an owner revokes an agent (or the registry suspends one for abuse), the agent's status is set to `"revoked"` in the registry.

- Services implementing real-time revocation checks call the status endpoint.
- Services relying on cached public keys SHOULD implement a maximum cache TTL of 1 hour and MUST honour the `Cache-Control` headers returned by the registry.
- The registry publishes a Certificate Revocation List (CRL) at a well-known endpoint and supports OCSP-style stapling for high-throughput services.

---

## 5. Technical Architecture

### 5.1 System Components

A compliant deployment MAY include the following components. They are not provided by this repository:

| Component | Description |
|-----------|-------------|
| **Registry Service** | Source of truth for agent identities, public keys, and owner verification status. Globally distributed with regional read replicas. |
| **Auth Service** | Handles owner authentication, agent token exchange, and SDK endpoints for obtaining fresh AgentIDP tokens. |
| **Verification Service** | Asynchronous pipeline for processing owner verification requests (email, DNS, KYB). |
| **Dashboard & Admin Console** | Web application for owners to manage agents, view analytics, and configure policies. |

### 5.2 Data Model

```
owners
├─ owner_id          (PK, string)
├─ email             (unique, string)
├─ name              (string)
├─ type              (enum: person, org)
├─ verification_level (int: 0-3)
├─ verified_domain   (string, nullable)
├─ kyb_status        (enum: pending, approved, rejected)
└─ created_at        (timestamp)

agents
├─ agent_id          (PK, string)
├─ owner_id          (FK → owners)
├─ name              (string)
├─ description       (text)
├─ version           (string)
├─ capabilities      (string[])
├─ public_key        (JWK, jsonb)
├─ status            (enum: active, suspended, revoked)
├─ abuse_contact     (string)
└─ created_at        (timestamp)

audit_log
├─ event_id          (PK, uuid)
├─ agent_id          (FK → agents)
├─ owner_id          (FK → owners)
├─ event_type        (string)
├─ metadata          (jsonb)
└─ created_at        (timestamp)
```

### 5.3 Verification Flow

The following sequence describes the end-to-end flow from agent registration to authenticated form submission:

1. Owner registers at a compliant registry, provides email, verifies to Level 2 (domain DNS TXT record).
2. Agent generates an ES256 or EdDSA key pair. Owner creates the agent: `POST /api/v1/agents` with name, capabilities, and public JWK. Registry returns `agent_id`.
3. Owner deploys the agent with the private key stored in a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault).
4. Agent needs to submit a form: Agent signs a proof JWT and calls `POST /api/v1/tokens/exchange` with the owner API key. The registry returns a registry-signed AgentIDP token with `aud` and `cnf.jkt`.
5. Agent calls `POST /forms/{form_id}/submit` with `Authorization: Bearer <AgentIDP token>`.
6. The service verifies:
   - (a) JWT signature against cached public key from registry JWKS
   - (b) Token expiry and required `aud`
   - (c) `cnf.jkt` when present (consistency with a supplied confirmation JWK)
   - (d) Agent status via registry
   - (e) Access tier policy
   - (f) Rate limit check by `agent_id`
7. Submission accepted or rejected with appropriate HTTP status and AgentID-specific error codes.

This flow does **not** include resource-server DPoP proofs.

### 5.4 SDK Design (illustrative)

The following sketches show how an implementer *might* wrap the protocol. **`@agentidp/sdk` and `@agentidp/verify` are not published.** Treat the names as placeholders, not packages to install.

**Agent SDK** (for agent developers)

```typescript
import { AgentAuth } from "@agentidp/sdk";

const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: process.env.AGENT_PRIVATE_KEY,
  apiKey: process.env.AGENTIDP_API_KEY,
  registryUrl: "https://registry.agentidp.dev",
});

// Proof JWT + POST /api/v1/tokens/exchange
const token = await auth.getToken({
  audience: "https://api.example.com"
});

// Use it
const res = await fetch("https://api.example.com/forms/xyz/submit", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify(formData),
});
```

**Service SDK** (for API/service providers)

```typescript
import { agentIdMiddleware } from "@agentidp/verify";

app.post('/forms/:id/submit',
  agentIdMiddleware({
    registryUrl: "https://registry.agentidp.dev",
    accessTier: "authenticated",
    minVerificationLevel: 2,
    rateLimit: { requestsPerHour: 100, scope: 'agent_id' },
  }),
  (req, res) => {
    console.log(req.agent.agent_id, req.agent.owner_name);
    // Process form submission...
  }
);
```

---

## 6. Security Considerations

### 6.1 Key Management

- Agent private keys MUST be stored in hardware security modules (HSMs) or cloud secret managers in production environments.
- Key rotation is supported via the registry's key versioning. Owners can generate a new key pair for an agent without changing its `agent_id`. Both old and new keys are valid during a configurable overlap period (default: 72 hours).
- The registry's own signing keys (used for registry-issued tokens) are rotated quarterly and published via the JWKS endpoint.

### 6.2 Replay Prevention

Every AgentIDP token includes a unique `jti` (JWT ID) claim. Services SHOULD maintain a `jti` cache (e.g., Redis with TTL matching token expiry) and reject tokens with previously seen `jti` values. For stateless verification, the short token lifetime (1 hour RECOMMENDED) provides an acceptable trade-off.

### 6.3 Abuse Mitigation

- **Automated abuse detection:** The registry monitors for anomalous patterns (sudden spike in agent registrations from one owner, agents hitting diverse services at unusual rates) and can auto-suspend agents pending review.
- **Abuse reporting API:** Services can report abusive `agent_id`s to the registry, triggering investigation and potential revocation.
- **Graduated response:** Warning → temporary suspension → permanent revocation → owner-level ban.

### 6.4 Privacy

The Agent Registry stores owner identity information subject to GDPR, UK GDPR, and equivalent regulations. Owner personal data is not exposed via the public agent lookup API unless the owner opts in.

The minimum public disclosure is: `owner_type`, `verification_level`, and (for Level 2+) `verified_domain`. Owner name and contact details are available only to the registry operator for abuse resolution.

---

## 7. Integration Patterns

### 7.1 Example service (hypothetical)

The following is a **pattern**, not a shipped product. A form service could implement AgentID by letting form creators set an access tier per form. When an agent submits, the service verifies the AgentIDP token, applies rate limits, logs provenance, and shows the form owner which agents submitted data and on whose behalf.

### 7.2 MCP Servers

Model Context Protocol (MCP) servers can adopt AgentID to authenticate the AI models connecting to them. When an MCP client presents an AgentIDP token, the server can verify the agent's identity and apply tool-level access policies. This is a natural fit since MCP already defines a tool interface but lacks a standardised identity layer.

### 7.3 Multi-Agent Orchestration

Orchestration frameworks like CrewAI and AutoGen can use the delegation chain feature to propagate identity through multi-agent workflows. The orchestrator agent includes its own identity in the delegation chain when dispatching tasks to sub-agents, creating a full audit trail from the original human instruction to the final service interaction.

### 7.4 Existing OAuth Services

AgentID is designed to complement, not replace, OAuth. For services that already use OAuth for user authentication, AgentID adds the agent identity layer. A typical pattern is:

1. The user grants an OAuth token to the agent (user delegation).
2. The agent includes the OAuth grant reference in the AgentIDP token delegation chain.
3. The service verifies both the agent's identity (AgentID) and the user's authorisation (OAuth).

---

## 8. Governance & Ecosystem

### 8.1 Open Specification

The AgentID Protocol Specification is released under the **Apache 2.0** licence. Anyone may implement a compliant registry, SDK, or verification service.

The specification is maintained in a public GitHub repository with an RFC-style change process. Major version changes require community review and a minimum 90-day comment period.

### 8.2 Registry

The hostname `registry.agentidp.dev` is reserved as an example issuer (`iss`). A public registry is **not** available in this draft. Additional registries MAY operate later as federated trust providers; federation is not specified here.

### 8.3 Hosted registry (optional, later)

If a hosted registry is operated later, it MAY be commercial. This specification does **not** define prices, SKUs, or SLAs. Do not treat any table or hostname in earlier drafts as a live offering.

---

## 9. Roadmap

| Version | Status | Focus |
|---------|--------|-------|
| **v0.1.0** | Draft (this document) | AgentIDP token format, token exchange with proof JWT, `cnf.jkt`, verification levels, access tiers, signed delegation hops, registry shape |
| Later | Not started | SDKs, a hosted registry, federation, and framework adapters stay out of this repository until the draft is reviewed |

---

## 10. Appendix

### 10.1 Capability Namespace Convention

Capabilities follow a `resource:action` format with hierarchical namespacing:

```
form:submit          // Submit form data
form:read            // Read form structure/schema
calendar:read        // Read calendar events
calendar:write       // Create/update events
calendar:delete      // Delete events
email:send           // Send emails
email:read           // Read inbox
storage:read         // Read files
storage:write        // Upload/modify files
payment:initiate     // Start a payment
payment:confirm      // Confirm a payment
```

Service providers MAY define custom capabilities using reverse-domain notation:

```
com.exampleform.template:create
com.acme.memory:export
```

### 10.2 Error Codes

| Code | Name | Description |
|------|------|-------------|
| `AID-001` | `INVALID_TOKEN` | AgentIDP token signature verification failed |
| `AID-002` | `TOKEN_EXPIRED` | AgentIDP token has exceeded its `exp` claim |
| `AID-003` | `AGENT_REVOKED` | Agent has been revoked in the registry |
| `AID-004` | `AGENT_SUSPENDED` | Agent is temporarily suspended |
| `AID-005` | `INSUFFICIENT_VERIFICATION` | Owner verification level below minimum required |
| `AID-006` | `CAPABILITY_DENIED` | Agent lacks required capability for this action |
| `AID-007` | `RATE_LIMIT_EXCEEDED` | Agent has exceeded per-agent rate limit |
| `AID-008` | `NOT_ON_ALLOWLIST` | Agent not on service allowlist (permissioned tier) |
| `AID-009` | `DELEGATION_INVALID` | Delegation chain invalid (unsigned, widening, over-depth, or wrong key) |
| `AID-010` | `REPLAY_DETECTED` | Proof or token `jti` has been previously used |
| `AID-011` | `AUDIENCE_MISSING` | `aud` is required on exchange and on minted tokens |
| `AID-013` | `AGENT_PROOF_INVALID` | Agent proof JWT missing or invalid |
| `AID-014` | `SCOPE_NOT_SUBSET` | Requested scope is not a subset of registered capabilities |
| `AID-016` | `AGENT_KEY_UNREGISTERED` | No registered public JWK |
| `AID-017` | `PUBLIC_KEY_INVALID` | Public JWK invalid, unsupported, or includes private material |

### 10.3 Glossary

| Term | Definition |
|------|------------|
| **AgentIDP token** | The registry-signed JWT that an agent presents to authenticate itself. Wire `typ` is `AIT+jwt`. |
| **Proof JWT** | Short-lived JWT signed by the agent key and presented at token exchange. Wire `typ` is `AIT-POP+jwt`. |
| **Delegation hop** | Compact JWS in `delegation_chain`. Wire `typ` is `AIT-DLG+jwt`. |
| **Agent** | An autonomous software system that interacts with services on behalf of a principal (human user or another agent). |
| **Owner** | The human or organisation legally accountable for an agent's actions. |
| **Principal** | The entity on whose behalf an agent acts. May be a user, an organisation, or another agent. |
| **Delegation Chain** | The ordered sequence of signed compact JWS hops through which authority was delegated, from the first delegating agent to the acting agent. |
| **Registry** | The service that stores agent identities, public keys, and verification records, and mints AgentIDP tokens. |
| **Scope Attenuation** | The rule that each hop in a delegation chain can only have equal or fewer permissions than the previous hop, and MUST NOT extend expiry. |
| **Verification Level** | A numeric indicator (0–3) of the rigour of identity verification performed on an agent's owner. |
| **`cnf.jkt`** | SHA-256 JWK thumbprint of the agent's public key, bound on the minted token (RFC 7800 / RFC 9449). Not by itself a DPoP implementation at the resource server. |

### 10.4 Test vectors

JSON vectors for token exchange (valid proof, wrong audience, expired proof, replayed `jti`, scope outside capabilities, widening delegation hop) are in [`vectors/token-exchange-v0.1.json`](vectors/token-exchange-v0.1.json). Keys in that file are **TEST ONLY**.

---

*End of Specification — AgentID Protocol v0.1.0 Draft*
