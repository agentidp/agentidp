# AgentIDP Competitive Landscape

> **Note (November 2026):** This file is a March 2026 research note kept for history. The public AgentIDP repository is a **draft specification** plus unpublished TypeScript packages. There is no public npm release and no live public registry. This document is not a product comparison and is not a claim that AgentIDP has a full-stack implementation.

*Last updated: March 2026 (banner added September 2026)*

## Market Context

The AI agent identity space is active but fragmented. There are 30+ efforts across standards bodies, commercial products, open source projects, and payment networks — but **no winner has emerged**. The market splits into distinct camps with different approaches.

---

## Competitive Map

### Standards & Protocol Specs

| Name | Backing | Status | What It Does | Limitation |
|------|---------|--------|--------------|------------|
| **MCP Auth** | Anthropic | Live spec | OAuth 2.1 for MCP tool access | Tool-access only, not general agent identity |
| **Google A2A** | Google → Linux Foundation | Live (v0.3), 50+ partners | Agent-to-agent communication + Agent Cards | Communication protocol, not an identity system |
| **AAuth** | Dick Hardt (OAuth creator) | Exploratory | Ground-up rethink: proof-of-possession, no bearer tokens | No registry, no implementation, one person's vision |
| **ANP** | Open source → W3C CG | Active | Fully decentralized DID-based identity | Requires DID infrastructure, complex for simple use cases |
| **OWASP ANS** | OWASP, in prod at GoDaddy | v1.0 | DNS-like agent naming and discovery | Naming only — no authentication or authorization |
| **Agentic JWT** (IETF) | Individual contributor | Draft | Binds agent identity to config via checksums | Extension to OAuth, not standalone |
| **Identity Assertion Grant** (IETF) | OAuth WG (adopted) | WG draft | Enterprise SSO for LLM agents | Enterprise-only, requires existing IdP |
| **SCIM Agent Extension** (IETF) | Okta | Draft | Provisions agents like SCIM users | Provisioning only, no runtime auth |

### Commercial Products

| Name | Pricing | What It Does | Limitation |
|------|---------|--------------|------------|
| **Auth0 for AI** (Okta) | Commercial | Extends existing OAuth M2M for agents | Retrofit, not agent-native. Proprietary. Lock-in. |
| **Descope** | Commercial ($53M raised) | Purpose-built agent IAM, MCP-native | Proprietary platform. Vendor lock-in. Can't become a standard. |
| **Stytch** | Commercial | OAuth provider for MCP servers | Product, not a protocol. Limited to MCP. |
| **CyberArk** | Enterprise | PAM-style privileged access for agents | Enterprise-only. Heavy. Governance, not identity. |
| **Astrix** (→ CrowdStrike) | Enterprise | NHI discovery and posture management | Discovery/security, not identity issuance |
| **Cloudflare Agents** | Platform | OAuth 2.1 infra for MCP at the edge | Infrastructure, not an identity standard |

### Payments / Commerce

| Name | Backing | What It Does | Limitation |
|------|---------|--------------|------------|
| **Visa TAP** | Visa | Crypto-signed agent identity per transaction | Payment-only. Visa-centric. |
| **Mastercard Agent Pay** | Mastercard | Agentic Tokens on tokenization infra | Payment-only. Mastercard-centric. |
| **Trulioo KYA** | Trulioo ($475M) | "KYC for agents" — Digital Agent Passport | Payment/commerce-focused. Proprietary. |
| **Google AP2** | Google, 60+ partners | Cryptographic Mandates for agent commerce | Payment-specific. |
| **OpenAI ACP** | OpenAI + Stripe | Agent-to-merchant purchases | Commerce-only. OpenAI ecosystem. |

### Open Source / Community

| Name | Status | What It Does | Limitation |
|------|--------|--------------|------------|
| **AIP** | Active, Show HN | Zero-trust proxy for MCP, RSA signing | Proxy/middleware, not a full identity system |
| **Auth Agent** | Open source | OIDC provider for browser agents | Browser agents only. Tiny community. |
| **HUMAN Verified** | Demo | RFC 9421 signatures + ANS | Reference demo, not a product or protocol |
| **ERC-8004** | Live, 49K agents | On-chain identity + reputation (NFT-based) | Requires blockchain. Crypto-native audience only. |
| **AgentFacts** | Show HN | Merkle-tree audit trails | Audit only, not identity or auth |

### Infrastructure

| Name | Status | What It Does | Limitation |
|------|--------|--------------|------------|
| **SPIFFE/SPIRE** | CNCF graduated | X.509 workload identity | Infrastructure-level. Not agent-specific. Complex. |

---

## Where AgentIDP Sits

AgentIDP is positioned as an **open protocol** that can sit next to a registry and commercial services. As of this draft, the spec and in-repo SDKs exist; a public registry and npm packages are not live. No current competitor is treated as a finished stack here.

### The Gap in the Market

```
                    OPEN PROTOCOL ←────────────→ PROPRIETARY PRODUCT
                         │                              │
     AAuth, ANP,         │                    Auth0, Descope,
     IETF drafts         │                    Stytch, CyberArk
     (specs only,        │                    (products only,
      no registry,       │                    can't become standards,
      no platform)       │                    vendor lock-in)
                         │                              │
                         │         AgentIDP              │
                         │    ┌─────────────────┐       │
                         │    │ Open spec        │       │
                         │    │ + Public registry │       │
                         │    │ + Commercial svcs │       │
                         │    └─────────────────┘       │
                         │                              │
                    (credibility,              (revenue,
                     adoption)                  sustainability)
```

---

## AgentIDP Differentiators

### 1. Full-Stack Identity System (not just a spec, not just a product)

Most competitors are **one piece of the puzzle**:

| Competitor | What they have | What they lack |
|-----------|----------------|----------------|
| AAuth | Protocol spec | No registry, no SDK, no implementation |
| IETF drafts | Spec fragments | No implementation, years from ratification |
| OWASP ANS | Naming/discovery | No authentication or authorization |
| A2A | Communication protocol | No identity system |
| Auth0/Descope | Full product | No open protocol, can't become a standard |
| SPIFFE | Infrastructure identity | Not agent-specific, complex to adopt |

**AgentIDP specifies these layers**: protocol (AgentIDP token format), a registry architecture (lookup, verification, revocation), and in-repo SDKs (agent-side and service-side). A hosted registry and npm publish are not part of this draft.

### 2. Owner Accountability as a First-Class Primitive

AgentIDP is the only protocol where **tracing an agent back to a verified, accountable human or organisation** is built into the token format and enforced by the registry.

- **Verification Levels 0–3**: 0 email unconfirmed, 1 email confirmed, 2 domain control, 3 organisation / KYB. The claim is the integer.
- Every AgentIDP token carries `owner_id`, `owner_type`, `verification_level`. It does not carry `owner_name`. Display names come from registry lookup (`verified_domain` at Level 2+).
- Services can set minimum verification requirements (e.g., "only accept agents from domain-verified owners")

**Why this matters**: When an agent spams your API or submits fraudulent data, you need to know who's behind it. OAuth tokens tell you which *app* — AgentIDP tells you which *agent* and which *accountable owner*.

Most competitors either don't address owner accountability (AAuth, SPIFFE, MCP Auth) or address it only for payments (Trulioo KYA, Visa TAP).

### 3. Delegation Chain Transparency

AgentIDP's `delegation_chain` claim is a unique protocol-level feature. When Agent A spawns Agent B which calls your API, the token shows the full chain:

```
User (john) → Agent A (orchestrator) → Agent B (form submitter) → Your Service
```

Each hop is a signed compact JWS (`AIT-DLG+jwt`) presented at token exchange. Hops MUST only narrow scopes, audience, and expiry. Unsigned v0.1 JSON hops are superseded and rejected. Owner/user hops are not specified in this version.

No other protocol in the competitive landscape has this built into the token format. Google A2A has no delegation model. Auth0's M2M tokens have no chain. AAuth's proof-of-possession is single-hop.

### 4. Service-Side Access Tiers (Dead Simple Policy Model)

AgentIDP's three-tier model gives services an immediately understandable choice:

| Tier | Meaning | Example |
|------|---------|---------|
| **Open** | Any agent, no auth needed | Public feedback form |
| **Authenticated** | Any *registered* agent | General API access |
| **Permissioned** | Only *allowlisted* agents | Partner integrations |

This is a UX innovation. Compare with Auth0's scope/permission model or SPIFFE's workload policies — AgentIDP's tiers are something a non-technical product manager can configure.

### 5. The Registry as a Network-Effect Moat

AgentIDP's registry (`registry.agentidp.dev`) is the strategic differentiator. Once agents are registered and services verify against it:

- **Switching costs rise** — agents have established identities with history
- **Network effects compound** — more agents registered = more services verify = more agents register
- **Trust accumulates** — verification levels, abuse history, and reputation build over time

This is the **DNS/SSL CA model**: the protocol is open (anyone can implement), but the registry is the business. Historical precedent:
- DNS: open protocol, ICANN + registrars = $multi-billion business
- SSL: open standard, Let's Encrypt + commercial CAs = trust infrastructure
- OAuth: open spec, Auth0 = $6.5B acquisition

No other open protocol in this space has a registry strategy. AAuth has no registry. IETF drafts don't specify one. The commercial players (Auth0, Descope) have proprietary platforms, not open registries.

### 6. Agent-Native, Not Retrofitted

Auth0, Stytch, and Descope are **retrofitting existing OAuth infrastructure** for agents. They model agents as "machine-to-machine clients" or "OAuth apps" — concepts designed for a different era.

AgentIDP is designed from scratch for autonomous agents:
- Agents are first-class identities, not OAuth client IDs
- The AgentIDP token carries agent-specific claims (capabilities, delegation, version)
- Registration is agent-centric (register an agent, not an OAuth app)
- Rate limiting is per-agent, not per-client

### 7. Reference Implementation from Day One

A form-service pattern is described in the spec as a hypothetical integration. This repository does not ship a live form product.

---

## Competitive Risks

### Threats to watch:

| Threat | Risk Level | Mitigation |
|--------|-----------|------------|
| **Auth0/Okta adopts an open agent identity standard** | High | Move fast. Their installed base is massive. |
| **IETF ratifies a competing spec** (Agentic JWT, SCIM Agent) | Medium | Engage with IETF, submit AgentIDP as an I-D, co-author with existing draft authors |
| **Google A2A adds identity layer** | High | A2A has 50+ partners. If they add an identity system, it could dominate. Position AgentIDP as complementary. |
| **MCP Auth evolves into full agent identity** | Medium | MCP Auth is tool-access only today. If Anthropic expands scope, they have distribution. |
| **Dick Hardt's AAuth gains momentum** | Medium | AAuth is from the OAuth creator. If it gets IETF traction, it has credibility. Partner or differentiate. |
| **ERC-8004 captures the decentralised crowd** | Low | Different audience (crypto-native). AgentIDP targets mainstream developers. |

### What won't compete:
- **Payment protocols** (Visa TAP, Mastercard) — payment-specific, not general-purpose
- **Enterprise governance** (CyberArk, Astrix) — management layer, not identity issuance
- **OWASP ANS** — complementary (naming), not competitive (auth)

---

## Open Source: Does It Improve Chances?

**Yes. Overwhelmingly.**

### Every winner in identity/auth was open:

| Standard | Open? | Outcome |
|----------|-------|---------|
| OAuth 2.0 | Open spec | Universal adoption |
| OpenID Connect | Open spec | Universal adoption |
| SPIFFE/SPIRE | CNCF open source | De facto workload identity standard |
| Let's Encrypt | Open + free | 300M+ certificates, killed the commercial CA market for basic certs |
| MCP | Open spec | Dominant agent-tool protocol |
| Google A2A | Apache 2.0 → Linux Foundation | 50+ partners in months |

### Every closed approach struggles to become a standard:

Auth0, Descope, Stytch — successful *products* but will never be *standards*. No one builds their protocol on a competitor's proprietary platform.

### Why open source specifically helps AgentIDP:

1. **Trust** — Services won't depend on a proprietary identity registry. Open protocol means they can always switch registries or run their own.
2. **Adoption speed** — Developers adopt open tools faster. No procurement, no vendor approval.
3. **Contributor ecosystem** — Security researchers audit it. Framework maintainers integrate it. The protocol gets better.
4. **Standards body path** — IETF and W3C only consider open specifications. You can't submit a proprietary protocol.
5. **Partnership leverage** — LangChain, CrewAI, AutoGen will integrate an open protocol. They won't integrate a proprietary one.

### The business model still works:

Open source protocol ≠ no revenue. The model is:

```
OPEN (free)                    COMMERCIAL (paid)
─────────────                  ──────────────────
Protocol spec (Apache 2.0)     Reference registry (registry.agentidp.dev)
Agent SDK (@agentidp/sdk)       Pro/Enterprise tiers
Service SDK (@agentidp/verify)  Dashboard & analytics
                               KYB verification service
                               SLA & support
                               Service-side verification pricing
```

This is exactly how it works for:
- **Redis** — open source, Redis Labs sells managed service
- **Auth0** — open source libraries, sold platform for $6.5B
- **Cloudflare** — open protocols (HTTP, DNS), sells the infrastructure
- **HashiCorp** — Vault/Terraform open source, sells cloud platform
- **Let's Encrypt** — free certs, funded by sponsorship + ecosystem

---

## Strategic Positioning Summary

**AgentIDP is an open identity protocol for AI agents.** A hosted registry and commercial services, if offered later, are out of scope for this draft.

It is not:
- An OAuth extension (it is purpose-built for agents)
- A proprietary product (the protocol is open)
- A claim of RFC 8693, RFC 9449 resource-server DPoP, RFC 9421, Web Bot Auth, WIMSE, or AAuth compatibility
- Payment-specific
- Enterprise-only

It is:
- An open spec, with in-repo SDKs that are not yet on npm
- Owner-accountable: every agent traces to an `owner_id` with integer verification level 0–3
- Delegation-transparent: signed narrowing hops at exchange
- Open protocol; a hosted registry, if offered later, MAY be commercial
