# AgentIDP Competitive Landscape

> **Note (November 2026):** March 2026 research note, updated for the live registry at [https://registry.agentidp.dev](https://registry.agentidp.dev) and the published `@agentidp/sdk`, `@agentidp/verify`, and `@agentidp/mcp` packages. Competitor facts below are a snapshot of that research. They are not a ranking.

*Last updated: November 2026*

## Market context

The AI agent identity space is active and fragmented. Efforts sit across standards bodies, commercial products, open source projects, and payment networks. The camps below have different jobs: tool access, agent-to-agent messaging, naming, provisioning, or payments.

AgentIDP is an open identity standard and protocol for AI agents, with a hosted registry, SDKs, and a dashboard.

Designed alongside RFC 8693 token exchange and RFC 9449 DPoP. Resource-server DPoP and formal profiles of these specs are on the roadmap.

## Competitive map

### Standards and protocol specs

| Name | Backing | Status | What it does | Scope |
|------|---------|--------|--------------|-------|
| **MCP Auth** | Anthropic | Live spec | OAuth 2.1 for MCP tool access | Tool access, not general agent identity |
| **Google A2A** | Google, Linux Foundation | Live (v0.3), 50+ partners | Agent-to-agent communication and Agent Cards | Communication protocol, not an identity system |
| **AAuth** | Dick Hardt | Exploratory | Proof-of-possession grant, no bearer tokens | Spec work, no registry in this snapshot |
| **ANP** | Open source, W3C CG | Active | DID-based identity | Requires DID infrastructure |
| **OWASP ANS** | OWASP, in prod at GoDaddy | v1.0 | DNS-like agent naming and discovery | Naming, not authentication |
| **Agentic JWT** (IETF) | Individual contributor | Draft | Binds agent identity to config via checksums | OAuth extension |
| **Identity Assertion Grant** (IETF) | OAuth WG (adopted) | WG draft | Enterprise SSO for LLM agents | Enterprise IdP required |
| **SCIM Agent Extension** (IETF) | Okta | Draft | Provisions agents like SCIM users | Provisioning, not runtime auth |

### Commercial products

| Name | Pricing | What it does | Scope |
|------|---------|--------------|-------|
| **Auth0 for AI** (Okta) | Commercial | Extends existing OAuth M2M for agents | Product on OAuth M2M |
| **Descope** | Commercial | Agent IAM, MCP-native | Proprietary platform |
| **Stytch** | Commercial | OAuth provider for MCP servers | MCP-focused product |
| **CyberArk** | Enterprise | Privileged access for agents | Governance / PAM |
| **Astrix** (CrowdStrike) | Enterprise | NHI discovery and posture | Discovery, not issuance |
| **Cloudflare Agents** | Platform | OAuth 2.1 infra for MCP at the edge | Infrastructure, not an identity standard |

### Payments / commerce

| Name | Backing | What it does | Scope |
|------|---------|--------------|-------|
| **Visa TAP** | Visa | Crypto-signed agent identity per transaction | Payments |
| **Mastercard Agent Pay** | Mastercard | Agentic tokens on tokenization infra | Payments |
| **Trulioo KYA** | Trulioo | Digital Agent Passport | Commerce KYC |
| **Google AP2** | Google, 60+ partners | Cryptographic mandates for agent commerce | Payments |
| **OpenAI ACP** | OpenAI + Stripe | Agent-to-merchant purchases | Commerce |

### Open source / community

| Name | Status | What it does | Scope |
|------|--------|--------------|-------|
| **AIP** | Active | Zero-trust proxy for MCP, RSA signing | Proxy / middleware |
| **Auth Agent** | Open source | OIDC provider for browser agents | Browser agents |
| **HUMAN Verified** | Demo | RFC 9421 signatures + ANS | Reference demo |
| **ERC-8004** | Live | On-chain identity and reputation | Blockchain |
| **AgentFacts** | Show HN | Merkle-tree audit trails | Audit |

### Infrastructure

| Name | Status | What it does | Scope |
|------|--------|--------------|-------|
| **SPIFFE/SPIRE** | CNCF graduated | X.509 workload identity | Workload identity, not agent-specific |

## Where AgentIDP sits

AgentIDP is an open protocol with a hosted registry (`https://registry.agentidp.dev`), published TypeScript packages (`@agentidp/sdk`, `@agentidp/verify`, `@agentidp/mcp`), and a dashboard on that registry. Spec-only efforts and proprietary IAM products occupy the other two corners of the map.

```
                    OPEN PROTOCOL                    PROPRIETARY PRODUCT
                         |                                    |
     AAuth, ANP,         |                    Auth0, Descope,
     IETF drafts         |                    Stytch, CyberArk
                         |                                    |
                         |              AgentIDP              |
                         |         open spec                  |
                         |         hosted registry            |
                         |         SDKs and dashboard         |
```

## AgentIDP today

### Layers in this stack

Protocol (AgentIDP token format), hosted registry (lookup, verification, revocation, token exchange), SDKs (agent-side and service-side), dashboard (owners, agents, keys). Agents generate their own keys. The registry stores only the public JWK.

### Owner accountability

- Verification levels 0-3: 0 email unconfirmed, 1 email confirmed, 2 domain control, 3 organisation / KYB. The claim is the integer.
- Registry-issued AgentIDP tokens carry `owner_id`, `owner_type`, and `verification_level`. Tokens minted locally with the SDK may omit them. Display names come from registry lookup (`verified_domain` at Level 2+).
- Services can set a minimum verification level (for example, domain-verified owners only).

### Delegation

When Agent A instructs Agent B to call a service, `delegation_chain` on the minted token can carry the hops. Each hop is a signed compact JWS (header `typ` `AIT-DLG+jwt`) presented at token exchange. Hops can only narrow scopes, audience, and expiry. Unsigned JSON hops are rejected. Owner/user hops are not specified in this version.

### Access tiers

| Tier | Meaning | Example |
|------|---------|---------|
| **Open** | Any agent, no auth needed | Public feedback form |
| **Authenticated** | Any registered agent | General API access |
| **Permissioned** | Allowlisted agents | Partner integrations |

Signature verify always. Status check is optional (`checkRevocation` in `@agentidp/verify`).

### Registry

The hosted registry is `https://registry.agentidp.dev`. Canonical paths are `/api/v1/...` and `/.well-known/jwks.json`. Anyone can implement a compliant registry. The protocol is Apache 2.0.

### Agent-native claims

Agents are first-class identities. The AgentIDP token carries capabilities, signed delegation hops, and integer verification level. Rate limiting in `@agentidp/verify` is per `agent_id` or `owner_id` when configured.

## Adjacent work (not substitutes)

Payment protocols (Visa TAP, Mastercard Agent Pay, AP2, ACP) are transaction-specific. Enterprise governance (CyberArk, Astrix) is a management layer. OWASP ANS is naming. Google A2A is agent-to-agent messaging. MCP Auth is tool access. AgentIDP is agent-to-service identity.

## Open source

The protocol is Apache 2.0. The TypeScript packages live in this repository. A hosted registry can be commercial. That split matches other identity infrastructure: open spec, operated trust anchor.

```
OPEN (free)                    HOSTED (registry.agentidp.dev)
─────────────                  ──────────────────
Protocol spec (Apache 2.0)     Registry, dashboard, owner verification
@agentidp/sdk
@agentidp/verify
@agentidp/mcp
```

## Positioning

**AgentIDP is an open identity standard and protocol for AI agents, with a hosted registry, SDKs, and a dashboard.**

It specifies:

- Agent-held keys and owner-verified registration
- Short-lived, registry-signed AgentIDP tokens bound to the agent key (`cnf.jkt`)
- Signed narrowing delegation at exchange
- JWKS and optional revocation status, with the cache TTLs `@agentidp/verify` actually uses

Designed alongside RFC 8693 token exchange and RFC 9449 DPoP. Resource-server DPoP and formal profiles of these specs are on the roadmap. `cnf.jkt` is key confirmation on the minted token. It is not resource-server DPoP.
