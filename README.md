# AgentID Protocol

**The identity layer for AI agents.**

AgentID is an open protocol for establishing, verifying, and managing the identity of autonomous AI agents. It answers three questions that no existing standard addresses:

1. **Which agent is this?**
2. **Who is accountable for it?**
3. **What is it permitted to do?**

OAuth solved user-to-app delegation. OpenID Connect solved user identity federation. AgentID solves **agent-to-service identity** — the missing layer for the agentic era.

## The Problem

As AI agents increasingly interact with APIs, forms, booking systems, and each other, services have no standardised way to:

- Verify which agent is making a request
- Trace an agent back to an accountable owner
- Enforce per-agent rate limits and access policies
- Inspect delegation chains in multi-agent workflows

The result: unattributable abuse, impersonation, and a fragmented ecosystem of ad-hoc solutions.

## How It Works

AgentID introduces the **Agent Identity Token (AIT)** — a signed JWT carrying agent identity, owner verification, capabilities, and delegation chain. Any service can verify it cryptographically without a round-trip to a central authority.

```
┌──────────────┐         ┌─────────────────────┐         ┌──────────────┐
│  Agent Owner  │────────▶│  AgentIDP Registry   │◀────────│   Service    │
│              │ register │ registry.agentidp.dev │ verify  │  (e.g. API)  │
└──────────────┘         └─────────────────────┘         └──────────────┘
                                   │                            ▲
                              key pair                          │
                                   ▼                            │
                          ┌──────────────┐    AIT Bearer Token  │
                          │    Agent      │─────────────────────▶│
                          └──────────────┘
```

### Quick Example

**Agent side** — get a token and authenticate:

```typescript
import { AgentAuth } from "@agentidp/sdk";

const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: process.env.AGENT_PRIVATE_KEY,
  registryUrl: "https://registry.agentidp.dev",
});

const token = await auth.getToken({
  audience: "https://api.example.com"
});
```

**Service side** — verify incoming agent requests:

```typescript
import { agentIdMiddleware } from "@agentidp/verify";

app.post('/api/submit',
  agentIdMiddleware({
    accessTier: "authenticated",
    minVerificationLevel: 2,
  }),
  (req, res) => {
    console.log(req.agent.agent_id, req.agent.owner_name);
  }
);
```

## Key Features

- **Agent Identity Token (AIT)** — ES256-signed JWT with agent/owner/capability claims
- **Owner Verification Levels** — 4 tiers from email to full KYB (Know Your Business)
- **Access Tiers** — Open, Authenticated, Permissioned — services choose per endpoint
- **Delegation Chains** — transparent multi-hop delegation with scope attenuation
- **Revocation** — real-time agent revocation via registry
- **Framework Agnostic** — works with LangChain, CrewAI, AutoGen, MCP, or custom agents

## Specification

The full protocol specification is in [`spec/AGENTID-RFC-v0.1.0.md`](spec/AGENTID-RFC-v0.1.0.md).

## Status

This is a **v0.1.0 Draft Specification** — open for community review and feedback.

We're actively seeking input from:
- Agent framework developers (MCP, LangChain, CrewAI, AutoGen)
- API and SaaS providers dealing with agent traffic
- Security researchers and protocol designers
- Anyone building in the agentic ecosystem

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to participate. We welcome:

- Comments and feedback via [GitHub Issues](../../issues)
- Protocol improvement proposals via [Pull Requests](../../pulls)
- Integration examples and use cases
- Security reviews

## Roadmap

| Version | Target | Focus |
|---------|--------|-------|
| v0.1.0 | Q2 2026 | Spec draft, reference SDK (JS/Python), registry MVP |
| v0.2.0 | Q3 2026 | Registry federation, delegation chain v2, CLI tooling |
| v0.3.0 | Q4 2026 | MCP integration guide, framework adapters |
| v1.0.0 | Q1 2027 | Stable spec, SOC 2 compliance, formal audit |

## License

- **Protocol Specification:** Apache 2.0
- **Registry Services:** Commercial (operated by [GudLab](https://gudlab.org))

## Links

- Specification: [`spec/AGENTID-RFC-v0.1.0.md`](spec/AGENTID-RFC-v0.1.0.md)
- Registry: `registry.agentidp.dev` (coming soon)
- GudLab: [gudlab.org](https://gudlab.org)
