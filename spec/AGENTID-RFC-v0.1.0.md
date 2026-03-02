# AgentID Protocol Specification

**Open Specification for Agent Identity, Authentication & Access Control**

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Status** | Draft |
| **Date** | March 2026 |
| **Authors** | Tim Uzua (Creator & Lead Author) |
| **Published by** | GudLab \| gudlab.org |
| **License** | Apache 2.0 (Protocol) / Commercial (Registry Services) |

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

The AgentID Protocol defines an open standard for establishing, verifying, and managing the identity of autonomous AI agents operating across the internet. As AI agents increasingly interact with web services, APIs, and each other on behalf of humans and organisations, the industry lacks a universal mechanism to answer three fundamental questions:

- **Which agent is this?**
- **Who is accountable for it?**
- **What is it permitted to do?**

AgentID addresses this gap by providing a lightweight, cryptographically secure identity layer purpose-built for the agentic era. It draws on proven patterns from OAuth 2.0, OpenID Connect, X.509, and SPIFFE, but adapts them to the unique requirements of non-human autonomous actors that operate at machine speed, chain together in delegation hierarchies, and act on behalf of principals who may not be present at the time of action.

This specification defines:

- (a) the **Agent Identity Token (AIT)** format
- (b) the **Agent Registration and Verification** process
- (c) the **Agent Registry** architecture
- (d) **Access control and delegation** mechanisms
- (e) the **Technical architecture** for implementing compliant services

### Design Principles

**Open protocol, proprietary services.** The specification is Apache 2.0 licensed and anyone can implement it. The reference registry and commercial tooling are operated by GudLab. Network effects and trust accumulation create the moat, not protocol lock-in.

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

### 3.1 Agent Identity Token (AIT)

The Agent Identity Token is a signed JSON Web Token (JWT) conforming to [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519), with a custom claim set designed for agent identification. The token is self-contained: any service with access to the issuer's public key can verify the token without contacting the registry.

#### 3.1.1 Token Structure

**Header**

```json
{
  "alg": "ES256",
  "typ": "AIT+jwt",
  "kid": "gudlab-2026-03-01"
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
  "agent_name": "SonalBookingAgent",
  "agent_version": "1.2.0",
  "agent_description": "Handles calendar bookings",

  // ── Owner Claims ──
  "owner_id": "own_T1mR4xBq9",
  "owner_type": "org",
  "owner_name": "Sonal AI Ltd",
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
  "aud": "https://api.gudform.com",
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
| `owner_id` | REQUIRED | Owner reference |
| `owner_type` | REQUIRED | `"person"` or `"org"` |
| `owner_name` | REQUIRED | Owner display name |
| `verification_level` | REQUIRED | See Section 3.2 |
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

Agent key pairs are generated during registration and the public key is published in the Agent Registry. Services verify tokens by fetching the public key via the registry's JWKS endpoint, with aggressive caching (RECOMMENDED TTL: 24 hours).

#### 3.1.3 Token Lifetime

AIT tokens MUST have a maximum lifetime of 24 hours. For high-security contexts, a lifetime of 1 hour or less is RECOMMENDED. Short-lived tokens limit the blast radius of key compromise. Agents MUST implement automatic token refresh using their private key.

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

1. Owner signs up at the AgentID Registry (`registry.agentidp.dev`) with email and password or SSO.
2. Owner completes verification to their desired level (email, domain DNS, or KYB document submission).
3. Registry issues an `owner_id` and an owner API key for agent management operations.

**Phase 2: Agent Registration**

1. Owner calls `POST /v1/agents` with agent name, description, and declared capabilities.
2. Registry generates a key pair (ES256), stores the public key, and returns the `agent_id`, `agent_secret` (private key in JWK format), and the `kid`.
3. Agent uses the private key to self-sign AIT tokens for authentication. The agent secret never leaves the owner's infrastructure after initial provisioning.

> **Security Note:** The agent's private key is generated server-side during registration and delivered once. Owners SHOULD immediately store it in a secrets manager. The registry does NOT retain the private key. If lost, the agent must be re-registered with a new key pair. Future versions of the spec may support client-side key generation with CSR upload.

### 3.4 Service-Side Access Control

Services consuming AgentID tokens implement access policies based on the claims present in the AIT. The protocol defines three standard access tiers that services MAY adopt:

#### 3.4.1 Access Tiers

| Tier | Description | Rate Limiting | Use Case |
|------|-------------|---------------|----------|
| **Open** | Any agent may access. No AIT required. | IP-based only | Public forms, read-only APIs, open data |
| **Authenticated** | Valid AIT from any registered agent required. Token signature and revocation status verified. | Per `agent_id` | General-purpose APIs, standard forms |
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

A critical feature of the AgentID protocol is transparent delegation. When Agent A instructs Agent B to perform an action, or when a human user authorises an agent to act on their behalf, the delegation chain is encoded in the AIT so that the receiving service can inspect the full provenance of the request.

#### 3.5.1 Delegation Chain Structure

The `delegation_chain` claim is an ordered array of delegation objects, from the original principal (index 0) to the most recent delegator. Each entry records who delegated, when, and with what scope restrictions.

```json
{
  "delegation_chain": [
    {
      "principal_type": "user",
      "principal_id": "usr_tim_abc",
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

Each link in the delegation chain MUST have scopes that are equal to or a strict subset of the previous link's scopes. A delegate cannot grant more permissions than it received. This is enforced by both the issuing agent (when constructing the token) and the verifying service (when validating claims).

---

## 4. Agent Registry Architecture

The Agent Registry is the central trust anchor of the AgentID ecosystem. It stores agent public keys, owner verification records, revocation status, and provides APIs for registration, lookup, and verification.

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
| `GET` | `/v1/agents/{agent_id}/status` | Revocation check (real-time) |
| `POST` | `/v1/tokens/exchange` | Exchange owner credentials for AIT |

### 4.2 Agent Lookup Response

When a service queries the registry for an agent, it receives the following public information:

```http
GET /v1/agents/ag_7xK9m2nP4qRtL8
```

```json
{
  "agent_id": "ag_7xK9m2nP4qRtL8",
  "agent_name": "SonalBookingAgent",
  "agent_version": "1.2.0",
  "status": "active",
  "owner": {
    "owner_id": "own_T1mR4xBq9",
    "owner_name": "Sonal AI Ltd",
    "owner_type": "org",
    "verification_level": 2,
    "verified_domain": "sonal.ai"
  },
  "capabilities": ["form:submit", "calendar:read", "calendar:write"],
  "registered_at": "2026-02-15T08:30:00Z",
  "public_key_url": "/v1/agents/ag_7xK9m2nP4qRtL8/public-key",
  "abuse_contact": "security@sonal.ai"
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

The AgentID platform consists of four primary components:

| Component | Description |
|-----------|-------------|
| **Registry Service** | Source of truth for agent identities, public keys, and owner verification status. Globally distributed with regional read replicas. |
| **Auth Service** | Handles owner authentication, agent token exchange, and SDK endpoints for obtaining fresh AITs. |
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

1. Owner registers at `registry.agentidp.dev`, provides email, verifies to Level 2 (domain DNS TXT record).
2. Owner creates agent: `POST /v1/agents` with name, capabilities. Registry generates ES256 key pair, returns `agent_id` + private key JWK.
3. Owner deploys agent with private key stored in secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault).
4. Agent needs to submit a GudForm: Agent constructs an AIT JWT, self-signs with its private key, includes target audience claim.
5. Agent calls `POST /forms/{form_id}/submit` with `Authorization: Bearer <AIT>`.
6. GudForm verifies:
   - (a) JWT signature against cached public key from registry JWKS
   - (b) Token expiry
   - (c) Agent status via registry
   - (d) Access tier policy
   - (e) Rate limit check by `agent_id`
7. Submission accepted or rejected with appropriate HTTP status and AgentID-specific error codes.

### 5.4 SDK Design

AgentID will ship SDKs for both sides of the interaction:

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
  audience: "https://api.gudform.com"
});

// Use it
const res = await fetch("https://api.gudform.com/forms/xyz/submit", {
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

Every AIT includes a unique `jti` (JWT ID) claim. Services SHOULD maintain a `jti` cache (e.g., Redis with TTL matching token expiry) and reject tokens with previously seen `jti` values. For stateless verification, the short token lifetime (1 hour RECOMMENDED) provides an acceptable trade-off.

### 6.3 Abuse Mitigation

- **Automated abuse detection:** The registry monitors for anomalous patterns (sudden spike in agent registrations from one owner, agents hitting diverse services at unusual rates) and can auto-suspend agents pending review.
- **Abuse reporting API:** Services can report abusive `agent_id`s to the registry, triggering investigation and potential revocation.
- **Graduated response:** Warning → temporary suspension → permanent revocation → owner-level ban.

### 6.4 Privacy

The Agent Registry stores owner identity information subject to GDPR, UK GDPR, and equivalent regulations. Owner personal data is not exposed via the public agent lookup API unless the owner opts in.

The minimum public disclosure is: `owner_type`, `verification_level`, and (for Level 2+) `verified_domain`. Owner name and contact details are available only to the registry operator for abuse resolution.

---

## 7. Integration Patterns

### 7.1 GudForm (Reference Implementation)

GudForm is the first service to implement AgentID natively. Form creators configure the access tier per form via the GudForm dashboard. When an agent submits a form, GudForm verifies the AIT, applies rate limits, logs the submission with agent provenance, and provides the form owner with an audit trail showing which agents submitted what data and on whose behalf.

### 7.2 MCP Servers

Model Context Protocol (MCP) servers can adopt AgentID to authenticate the AI models connecting to them. When an MCP client presents an AIT, the server can verify the agent's identity and apply tool-level access policies. This is a natural fit since MCP already defines a tool interface but lacks a standardised identity layer.

### 7.3 Multi-Agent Orchestration

Orchestration frameworks like CrewAI and AutoGen can use the delegation chain feature to propagate identity through multi-agent workflows. The orchestrator agent includes its own identity in the delegation chain when dispatching tasks to sub-agents, creating a full audit trail from the original human instruction to the final service interaction.

### 7.4 Existing OAuth Services

AgentID is designed to complement, not replace, OAuth. For services that already use OAuth for user authentication, AgentID adds the agent identity layer. A typical pattern is:

1. The user grants an OAuth token to the agent (user delegation).
2. The agent includes the OAuth grant reference in the AIT delegation chain.
3. The service verifies both the agent's identity (AgentID) and the user's authorisation (OAuth).

---

## 8. Governance & Ecosystem

### 8.1 Open Specification

The AgentID Protocol Specification is released under the **Apache 2.0** licence. Anyone may implement a compliant registry, SDK, or verification service.

The specification is maintained in a public GitHub repository with an RFC-style change process. Major version changes require community review and a minimum 90-day comment period.

### 8.2 Reference Registry

The reference registry at `registry.agentidp.dev` is operated by GudLab. It serves as the default trust anchor for the ecosystem. Additional registries may operate as federated trust providers, cross-signing agent identities in a model similar to SSL certificate authorities. The federation protocol is specified in a companion document (planned for v0.2.0).

### 8.3 Commercial Model

| | Free | Pro | Enterprise |
|---|---|---|---|
| **Agents** | 5 | 50 | Unlimited |
| **Verification** | Email (Level 1) | Domain (Level 2) | KYB (Level 3) |
| **Registry Lookups** | 1,000/month | 50,000/month | Custom SLA |
| **Dashboard** | Basic | Full analytics | Custom + SSO |
| **Support** | Community | Email | Dedicated + SLA |
| **Audit Logs** | 7 days | 90 days | 1 year + export |
| **Price** | Free | £49/mo | Custom |

**Service-side pricing:** Services verifying agents pay based on monthly verification volume (first 10,000 free, then £0.001 per verification), similar to Twilio Verify pricing.

---

## 9. Roadmap

| Version | Target | Milestones |
|---------|--------|------------|
| **v0.1.0** | Q2 2026 | Spec draft, reference SDK (JS/Python), GudForm integration, registry MVP |
| **v0.2.0** | Q3 2026 | Registry federation protocol, delegation chain v2, CLI tooling, agent discovery API |
| **v0.3.0** | Q4 2026 | MCP server integration guide, CrewAI/AutoGen adapters, rate limiting standard |
| **v1.0.0** | Q1 2027 | Stable spec release, SOC 2 compliance for registry, enterprise dashboard, formal audit |

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
com.gudform.template:create
ai.sonal.memory:export
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
| **Delegation Chain** | The ordered sequence of principals and agents through which authority was delegated, from the original authoriser to the acting agent. |
| **Registry** | The service that stores agent identities, public keys, and verification records. |
| **Scope Attenuation** | The principle that each link in a delegation chain can only have equal or fewer permissions than the previous link. |
| **Verification Level** | A numeric indicator (0–3) of the rigour of identity verification performed on an agent's owner. |

---

*End of Specification — AgentID Protocol v0.1.0 Draft*
