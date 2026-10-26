# AgentIDP Protocol Specification

**Open Specification for Agent Identity, Authentication & Access Control**

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Status** | Draft specification (not a product) |
| **Date** | 26 October 2026 |
| **Authors** | Timchosen Uzua |
| **Published by** | GudLab \| gudlab.org |
| **License** | Apache 2.0 (this specification) |

> This document is a **draft protocol specification**. It is not an SDK, a hosted registry, or a product. Code samples and hostnames below are illustrative. The protocol name is **AgentIDP**. Do not shorten it to "AgentID" (that name is used by unrelated products).

> 26 October 2026 revision: one verification-level table; revocation freshness bounded by token lifetime and cache TTL; `delegation_chain` hops asserted by the presenter; owner display names removed from the bearer AIT.

> The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Protocol Specification](#3-protocol-specification)
4. [Agent Registry Architecture](#4-agent-registry-architecture)
5. [Technical Architecture](#5-technical-architecture)
6. [Security Considerations](#6-security-considerations)
7. [Integration Patterns](#7-integration-patterns)
8. [Governance & Ecosystem](#8-governance--ecosystem)
9. [Roadmap](#9-roadmap)
10. [Appendix](#10-appendix)

---

## 1. Executive Summary

The AgentIDP Protocol defines an open standard for establishing, verifying, and managing the identity of autonomous AI agents operating across the internet. As AI agents increasingly interact with web services, APIs, and each other on behalf of humans and organisations, the industry lacks a universal mechanism to answer three fundamental questions:

- **Which agent is this?**
- **Who is accountable for it?**
- **What is it permitted to do?**

This draft specifies a lightweight, cryptographically verifiable identity layer for those agents. It draws on patterns from OAuth 2.0, OpenID Connect, X.509, and SPIFFE, adapted for non-human actors that operate at machine speed, chain together in delegation hierarchies, and act on behalf of principals who may not be present at the time of action.

This specification defines:

- (a) the **Agent Identity Token (AIT)** format
- (b) the **Agent Registration and Verification** process
- (c) the **Agent Registry** architecture
- (d) **Access control and delegation** mechanisms
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
4. **Delegation transparency** — When an agent acts on behalf of another agent or a human, the claimed hops MUST be present on the token so a service can inspect them. In v0.1 those hops are asserted by the presenter; they are not separately signed (Section 3.5).
5. **Revocability** — A registry MUST be able to mark an agent revoked or suspended. A verifier that caches keys or status can learn of that change only as fast as the shorter of remaining token lifetime and its key or revocation-cache TTL (Section 4.3). This draft does not require immediate or real-time revocation on the offline path.
6. **Interoperability** — The protocol MUST work across agent frameworks (LangChain, CrewAI, AutoGen, MCP, custom), programming languages, and deployment models.
7. **Performance** — Token verification MUST be possible offline (no round-trip) using cached public keys, with registry lookups reserved for enhanced checks.

---

## 3. Protocol Specification

### 3.1 Agent Identity Token (AIT)

The Agent Identity Token is a signed JSON Web Token (JWT) conforming to [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519), with a custom claim set designed for agent identification. The token is self-contained: any service with access to the issuer's public key can verify the token without contacting the registry.

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
| `alg` | REQUIRED | ECDSA P-256 |
| `typ` | REQUIRED | Agent Identity Token |
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
  "verification_level": 2,

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
  "jti": "tok_unique_nonce_123"
}
```

| Claim | Status | Description |
|-------|--------|-------------|
| `agent_id` | REQUIRED | Globally unique agent identifier |
| `agent_name` | REQUIRED | Human-readable name |
| `agent_version` | RECOMMENDED | Semantic version |
| `agent_description` | OPTIONAL | Description of agent purpose |
| `owner_id` | REQUIRED | Opaque owner identifier. Not a display name. |
| `owner_type` | REQUIRED | `"person"` or `"org"` |
| `verification_level` | REQUIRED | Integer `0`–`3`. See Section 3.2. |

The bearer AIT MUST NOT include `owner_name` or other owner personal data (legal name, email, phone, address). A service that needs a display name obtains it from `verified_domain` (Level 2+) or an opt-in registry lookup, not from the token.
| `capabilities` | OPTIONAL | Declared capabilities |
| `delegation_chain` | OPTIONAL | See Section 3.5 |
| `iss` | REQUIRED | Registry URL |
| `sub` | REQUIRED | Same as `agent_id` |
| `aud` | RECOMMENDED | Target service |
| `iat` | REQUIRED | Issued at |
| `exp` | REQUIRED | Expiry (max 24h lifetime) |
| `jti` | REQUIRED | Unique token ID for replay prevention |

#### 3.1.2 Cryptographic Requirements

All Agent Identity Tokens MUST be signed using **ES256** (ECDSA with P-256 curve and SHA-256). This algorithm provides strong security with compact signatures, making it well-suited for high-frequency agent-to-service communication. RSA-based algorithms are explicitly excluded to keep token sizes small.

Agent key pairs are generated during registration and the public key is published in the Agent Registry. Services verify tokens by fetching the public key via the registry's JWKS endpoint. Verifiers MAY cache those keys. RECOMMENDED key-cache TTL: 1 hour. Verifiers MUST honour a shorter `Cache-Control` `max-age` from the registry. A cached key does not mean the agent is still active; see Section 4.3.

#### 3.1.3 Token Lifetime

AIT tokens MUST have a maximum lifetime of 24 hours. For high-security contexts, a lifetime of 1 hour or less is RECOMMENDED. Short-lived tokens limit the blast radius of key compromise. Agents MUST implement automatic token refresh using their private key.

### 3.2 Owner Verification Levels

AgentIDP defines exactly four owner verification levels. This table is the only definition. Level 0 is account-only (email unconfirmed). Level 1 is email confirmation. There are four levels, numbered 0–3.

`verification_level` on the AIT and in registry records MUST be the integer **Level** (`0`, `1`, `2`, or `3`). The **Name** column is for prose only. The claim value is the integer, not the name string.

| Level | Name | Meaning | Typical use |
|-------|------|---------|-------------|
| 0 | **Unverified** | Account exists. Email has not been confirmed. | Testing, development, open forms |
| 1 | **Email** | Email address confirmed. | Low-risk public services |
| 2 | **Domain** | Control of a domain proven (DNS TXT or equivalent). | Business APIs, partner integrations |
| 3 | **Organisation** | Business / KYB verification of a legal entity. | Financial services, healthcare, regulated industries |

Services MAY set a minimum `verification_level` per endpoint or form. Compare as integers: Level 2 satisfies a minimum of 2; Level 1 does not.

### 3.3 Agent Registration Flow

Agent registration is a two-phase process: owner verification (performed once) followed by agent creation (performed per agent). A single verified owner can register multiple agents.

**Phase 1: Owner Registration**

1. Owner signs up at an AgentIDP-compliant registry. This draft uses `registry.agentidp.dev` as an example hostname; it is not a public service in this version.
2. Owner completes verification to their desired level (Section 3.2): Unverified (account only), Email, Domain, or Organisation (KYB).
3. Registry issues an `owner_id` and an owner API key for agent management operations.

**Phase 2: Agent Registration**

1. Owner calls `POST /v1/agents` with agent name, description, and declared capabilities.
2. Registry generates a key pair (ES256), stores the public key, and returns the `agent_id`, `agent_secret` (private key in JWK format), and the `kid`.
3. Agent uses the private key to self-sign AIT tokens for authentication. The agent secret never leaves the owner's infrastructure after initial provisioning.

> **Security Note:** The agent's private key is generated server-side during registration and delivered once. Owners SHOULD immediately store it in a secrets manager. The registry does NOT retain the private key. If lost, the agent must be re-registered with a new key pair. Future versions of the spec may support client-side key generation with CSR upload.

### 3.4 Service-Side Access Control

Services consuming AgentIDP tokens implement access policies based on the claims present in the AIT. The protocol defines three standard access tiers that services MAY adopt:

#### 3.4.1 Access Tiers

| Tier | Description | Rate Limiting | Use Case |
|------|-------------|---------------|----------|
| **Open** | Any agent may access. No AIT required. | IP-based only | Public forms, read-only APIs, open data |
| **Authenticated** | Valid AIT from any registered agent required. Signature MUST be verified. Revocation freshness follows Section 4.3. | Per `agent_id` | General-purpose APIs, standard forms |
| **Permissioned** | Valid AIT required AND `agent_id` or `owner_id` must be on an explicit allowlist. | Per `agent_id` | Partner integrations, sensitive data, high-value transactions |

#### 3.4.2 Policy Expression

Services define policies as a set of rules evaluated against AIT claims. The protocol RECOMMENDS the following policy structure:

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

When Agent A instructs Agent B to perform an action, or when a human authorises an agent to act on their behalf, v0.1 MAY put a `delegation_chain` on the AIT so the receiving service can read the hops the presenter claims.

This is **not** a full cryptographically verified history. In v0.1 each hop is asserted by the presenting agent and is covered only by that agent's signature on the AIT. Earlier hops are not separately signed. A service that trusts `delegation_chain` is trusting the presenter's account of those hops. This is a known weakness.

v0.2 is expected to require a per-hop `AIT-DLG+jwt` signed by the delegator, with narrowing scopes, audience, and expiry. That format lives in the design note [`docs/design/token-minting.md`](https://github.com/agentidp/agentidp/blob/cursor/token-minting-design-c9a6/docs/design/token-minting.md) on [PR #3](https://github.com/agentidp/agentidp/pull/3) (the file is not on `main` as of this revision). That note is not accepted spec text. This RFC does not define signed hops.

#### 3.5.1 Delegation Chain Structure

The `delegation_chain` claim is an ordered array of unsigned JSON objects, from the claimed original principal (index 0) to the most recent claimed delegator. Each entry records who the presenter says delegated, when, and with what scope restrictions. The verifier MUST NOT treat the array as proof that those principals actually granted the hops.

```json
{
  "delegation_chain": [
    {
      "principal_type": "user",
      "principal_id": "usr_john_abc",
      "granted_at": "2026-03-01T10:00:00Z",
      "scopes": ["calendar:read", "calendar:write"],
      "evidence": "oauth2:token_exchange"
    },
    {
      "principal_type": "agent",
      "principal_id": "ag_orchestrator_1",
      "granted_at": "2026-03-01T10:00:05Z",
      "scopes": ["calendar:read"],
      "evidence": "ait:delegation"
    }
  ]
}
```

#### 3.5.2 Scope Attenuation

Each link in the delegation chain MUST have scopes that are equal to or a strict subset of the previous link's scopes. A delegate cannot grant more permissions than it received. The presenting agent SHOULD construct an attenuating chain. The verifying service MUST reject a chain that widens scopes relative to an earlier hop in the same claim (`AID-009`). Scope attenuation checks the asserted objects only; it does not authenticate the hops.

---

## 4. Agent Registry Architecture

The Agent Registry is specified as the trust anchor: it stores agent public keys, owner verification records, revocation status, and provides APIs for registration, lookup, and verification. A public instance is not part of this draft.

### 4.1 Registry API

The registry exposes a RESTful API with the following core endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/owners` | Register a new owner account |
| `POST` | `/v1/owners/{id}/verify` | Submit verification evidence |
| `POST` | `/v1/agents` | Register a new agent (owner auth required) |
| `GET` | `/v1/agents/{agent_id}` | Public agent lookup |
| `GET` | `/v1/agents/{agent_id}/public-key` | Fetch agent's public key (JWK) |
| `DELETE` | `/v1/agents/{agent_id}` | Revoke an agent (owner auth required) |
| `GET` | `/.well-known/jwks.json` | Registry JWKS endpoint |
| `GET` | `/v1/agents/{agent_id}/status` | Current agent status (`active`, `suspended`, `revoked`). Fresh at query time only. |
| `POST` | `/v1/tokens/exchange` | Exchange owner credentials for AIT |

### 4.2 Agent Lookup Response

When a service queries the registry for an agent, it receives the following public information:

```http
GET /v1/agents/ag_7xK9m2nP4qRtL8
```

```json
{
  "agent_id": "ag_7xK9m2nP4qRtL8",
  "agent_name": "AcmeBookingAgent",
  "agent_version": "1.2.0",
  "status": "active",
  "owner": {
    "owner_id": "own_T1mR4xBq9",
    "owner_type": "org",
    "verification_level": 2,
    "verified_domain": "acme.inc"
  },
  "capabilities": ["form:submit", "calendar:read", "calendar:write"],
  "registered_at": "2026-02-15T08:30:00Z",
  "public_key_url": "/v1/agents/ag_7xK9m2nP4qRtL8/public-key",
  "abuse_contact": "security@acme.inc"
}
```

### 4.3 Revocation

When an owner revokes an agent, or the registry suspends one for abuse, the registry sets that agent's status to `"revoked"` or `"suspended"`. A client that queries the registry after that write sees the new status.

This draft does **not** guarantee immediate or real-time revocation at every verifier.

A verifier that caches public keys, JWKS, or revocation/status results can learn of a revocation only as fast as the **shorter** of:

1. remaining lifetime of an AIT it already holds (`exp - now`), and
2. the TTL of its key cache or revocation/status cache.

A verifier that never calls the status endpoint, and that still accepts a previously cached key, can accept tokens from a revoked agent until those tokens expire.

| Path | What it tells you | Freshness |
|------|-------------------|-----------|
| Live `GET /v1/agents/{agent_id}/status` | Registry status at query time | Current for that request |
| Cached JWKS or agent public key | Key material only, not status | Up to the key-cache TTL (RECOMMENDED maximum 1 hour; MUST honour a shorter `Cache-Control`) |
| Token `exp` | When this AIT stops being acceptable without a new mint | At most 24 hours from `iat` (Section 3.1.3) |
| CRL or OCSP-style stapling | Optional shorter-lived status | Only if the verifier uses it |

CRL and OCSP-style stapling MAY be offered as a fresher path. Neither is required in v0.1. This draft does not claim either is deployed.

A statement that revocation is immediate or real-time is accurate only for a verifier that calls a live status endpoint (or an equivalent staple) on every decision. It is not accurate for the offline or cached-key path.

---

## 5. Technical Architecture

### 5.1 System Components

A compliant deployment MAY include the following components. They are not provided by this repository:

| Component | Description |
|-----------|-------------|
| **Registry Service** | Source of truth for agent identities, public keys, and owner verification status. Globally distributed with regional read replicas. |
| **Auth Service** | Handles owner authentication, agent token exchange, and SDK endpoints for obtaining fresh AITs. |
| **Verification Service** | Asynchronous pipeline for processing owner verification requests (email confirmation, domain control, KYB). Level 0 needs no extra evidence. |
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

1. Owner registers at a compliant registry, provides email, confirms it (Level 1), then proves domain control (Level 2, DNS TXT or equivalent).
2. Owner creates agent: `POST /v1/agents` with name, capabilities. Registry generates ES256 key pair, returns `agent_id` + private key JWK.
3. Owner deploys agent with private key stored in secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault).
4. Agent needs to submit a form: Agent constructs an AIT JWT, self-signs with its private key, includes target audience claim.
5. Agent calls `POST /forms/{form_id}/submit` with `Authorization: Bearer <AIT>`.
6. The service verifies:
   - (a) JWT signature against a public key from registry JWKS (cached or fetched)
   - (b) Token expiry
   - (c) Access tier policy, including `min_verification_level` as an integer 0–3
   - (d) Rate limit check by `agent_id`
   - (e) Optionally, current agent status via the registry (Section 4.3). Offline verification MAY skip this check; freshness is then bounded by remaining token lifetime and the key-cache TTL.
7. Submission accepted or rejected with appropriate HTTP status and AgentIDP-specific error codes.

### 5.4 SDK Design (illustrative)

The following sketches show how an implementer *might* wrap the protocol. **`@agentidp/sdk` and `@agentidp/verify` are not published.** Treat the names as placeholders, not packages to install.

**Agent SDK** (for agent developers)

```typescript
import { AgentAuth } from "@agentidp/sdk";

const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: process.env.AGENT_PRIVATE_KEY,
  registryUrl: "https://registry.agentidp.dev",
});

// Get a fresh AIT for a specific service
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
    console.log(req.agent.agent_id, req.agent.owner_id);
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

Every AIT includes a unique `jti` (JWT ID) claim. Services SHOULD maintain a `jti` cache (e.g., Redis with TTL matching token expiry) and reject tokens with previously seen `jti` values. For stateless verification, the short token lifetime (1 hour RECOMMENDED) provides an acceptable trade-off.

### 6.3 Abuse Mitigation

- **Automated abuse detection:** The registry monitors for anomalous patterns (sudden spike in agent registrations from one owner, agents hitting diverse services at unusual rates) and can auto-suspend agents pending review.
- **Abuse reporting API:** Services can report abusive `agent_id`s to the registry, triggering investigation and potential revocation.
- **Graduated response:** Warning → temporary suspension → permanent revocation → owner-level ban.

### 6.4 Privacy

The Agent Registry stores owner identity information subject to GDPR, UK GDPR, and equivalent regulations. Owner personal data is not exposed via the public agent lookup API unless the owner opts in.

The bearer AIT MUST NOT carry owner display names or other owner personal data. The minimum public disclosure on a lookup is: `owner_id`, `owner_type`, `verification_level`, and (for Level 2+) `verified_domain`. Owner name and contact details stay with the registry operator for abuse resolution unless the owner opts in to a display field. A service that wants a human-readable owner label uses `verified_domain` or that opt-in lookup, not the token.

---

## 7. Integration Patterns

### 7.1 Example service (hypothetical)

The following is a **pattern**, not a shipped product. A form service could implement AgentIDP by letting form creators set an access tier per form. When an agent submits, the service verifies the AIT, applies rate limits, logs the claimed provenance, and shows the form owner which agents submitted data and which `owner_id` they presented.

### 7.2 MCP Servers

Model Context Protocol (MCP) servers can adopt AgentIDP to authenticate the AI models connecting to them. When an MCP client presents an AIT, the server can verify the agent's identity and apply tool-level access policies. This is a natural fit since MCP already defines a tool interface but lacks a standardised identity layer.

### 7.3 Multi-Agent Orchestration

Orchestration frameworks like CrewAI and AutoGen can put claimed hops in `delegation_chain` when dispatching tasks to sub-agents. The result is an asserted trail from the claimed original instruction to the acting agent. It is not a per-hop signed history. See Section 3.5.

### 7.4 Existing OAuth Services

AgentIDP is designed to complement, not replace, OAuth. For services that already use OAuth for user authentication, AgentIDP adds the agent identity layer. A typical pattern is:

1. The user grants an OAuth token to the agent (user delegation).
2. The agent includes the OAuth grant reference in the AIT delegation chain (asserted in v0.1; see Section 3.5).
3. The service verifies both the agent's identity (AgentIDP) and the user's authorisation (OAuth).

---

## 8. Governance & Ecosystem

### 8.1 Open Specification

The AgentIDP Protocol Specification is released under the **Apache 2.0** licence. Anyone may implement a compliant registry, SDK, or verification service.

The specification is maintained in a public GitHub repository with an RFC-style change process. Major version changes require community review and a minimum 90-day comment period.

### 8.2 Registry

The hostname `registry.agentidp.dev` is reserved as an example issuer (`iss`). A public registry is **not** available in this draft. Additional registries MAY operate later as federated trust providers; federation is not specified here.

### 8.3 Hosted registry (optional, later)

If a hosted registry is operated later, it MAY be commercial. This specification does **not** define prices, SKUs, or SLAs. Do not treat any table or hostname in earlier drafts as a live offering.

---

## 9. Roadmap

| Version | Status | Focus |
|---------|--------|-------|
| **v0.1.0** | Draft (this document) | AIT format, verification levels, access tiers, asserted delegation hops, registry shape |
| v0.2 | Design note, not accepted spec | Per-hop `AIT-DLG+jwt` signatures and other minting changes. See [`docs/design/token-minting.md`](https://github.com/agentidp/agentidp/blob/cursor/token-minting-design-c9a6/docs/design/token-minting.md) on [PR #3](https://github.com/agentidp/agentidp/pull/3). |
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
| `AID-001` | `INVALID_TOKEN` | AIT signature verification failed |
| `AID-002` | `TOKEN_EXPIRED` | AIT has exceeded its `exp` claim |
| `AID-003` | `AGENT_REVOKED` | Agent has been revoked in the registry |
| `AID-004` | `AGENT_SUSPENDED` | Agent is temporarily suspended |
| `AID-005` | `INSUFFICIENT_VERIFICATION` | Owner verification level below minimum required |
| `AID-006` | `CAPABILITY_DENIED` | Agent lacks required capability for this action |
| `AID-007` | `RATE_LIMIT_EXCEEDED` | Agent has exceeded per-agent rate limit |
| `AID-008` | `NOT_ON_ALLOWLIST` | Agent not on service allowlist (permissioned tier) |
| `AID-009` | `DELEGATION_INVALID` | Delegation chain scope attenuation violated |
| `AID-010` | `REPLAY_DETECTED` | Token `jti` has been previously used |

### 10.3 Glossary

| Term | Definition |
|------|------------|
| **AIT** | Agent Identity Token. The signed JWT that an agent presents to authenticate itself. |
| **Agent** | An autonomous software system that interacts with services on behalf of a principal (human user or another agent). |
| **Owner** | The human or organisation legally accountable for an agent's actions. |
| **Principal** | The entity on whose behalf an agent acts. May be a user, an organisation, or another agent. |
| **Delegation Chain** | The ordered sequence of principals and agents through which authority was claimed to be delegated, from the original authoriser to the acting agent. In v0.1 the hops are asserted by the presenter, not separately signed. |
| **Registry** | The service that stores agent identities, public keys, and verification records. |
| **Scope Attenuation** | The principle that each link in a delegation chain can only have equal or fewer permissions than the previous link. |
| **Verification Level** | Integer 0–3 as defined in Section 3.2: Unverified, Email, Domain, Organisation. |

### 10.4 Open Issues

These items are known gaps in v0.1. They are not specified here.

1. **Per-hop signatures (required for v0.2).** Each delegation hop MUST become an `AIT-DLG+jwt` signed by the delegator, with narrowing scopes, audience, and expiry. See [`docs/design/token-minting.md`](https://github.com/agentidp/agentidp/blob/cursor/token-minting-design-c9a6/docs/design/token-minting.md) on [PR #3](https://github.com/agentidp/agentidp/pull/3). Until that lands, treat `delegation_chain` as presenter-asserted.
2. **Revocation staple profile.** If a later draft requires CRL or OCSP-style stapling, it MUST define the object, TTL, and verifier behaviour. v0.1 leaves those optional and undeployed.
3. **Owner display names.** v0.1 keeps names off the bearer AIT. A later draft MAY define an opt-in registry display field; it MUST NOT put PII back on the bearer token.

---

*End of Specification — AgentIDP Protocol v0.1.0 Draft*
