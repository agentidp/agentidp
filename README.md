# AgentID Protocol

Draft specification for **agent identity tokens** (signed JWTs). This repository is protocol text under Apache 2.0. It is **not** a product, SDK, or hosted registry.

It describes a way for a service to answer:

1. Which agent is this?
2. Who is accountable for it?
3. What is it permitted to do?

OAuth covers user-to-app delegation. OpenID Connect covers user identity federation. This draft covers **agent-to-service identity** as specification text only.

## Status

**v0.1.0 draft** — open for review on the document in `spec/`.

This repo does **not** currently include:

- a public `@agentidp/sdk` or `@agentidp/verify` package
- a public registry at `registry.agentidp.dev`
- a working product loop

Code samples in the spec are illustrative. Do not treat package names or hostnames as live services.

## How the draft works

The spec defines an **Agent Identity Token (AIT)**: a signed JWT with agent identity, owner verification, capabilities, and an optional delegation chain. A service that has the issuer's public key can verify the token without a round-trip.

A registry (lookup, keys, revocation) is specified as an architecture. No public instance ships with this draft.

Full text: [`spec/AGENTID-RFC-v0.1.0.md`](spec/AGENTID-RFC-v0.1.0.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Use [GitHub Issues](https://github.com/agentidp/agentidp/issues) for spec comments and [Pull Requests](https://github.com/agentidp/agentidp/pulls) for concrete edits to `spec/`.

This is the wrong repo for registry implementation, SDK work, or positioning against other identity drafts.

## Roadmap

| Version | Status | Focus |
|---------|--------|-------|
| v0.1.0 | Draft (this repo) | AIT format, verification levels, access tiers, delegation, registry shape |
| Later | Not started | SDKs and a hosted registry stay out of this repository until the draft is reviewed |

## License

- **Protocol specification:** Apache 2.0 ([LICENSE](LICENSE))
- **A hosted registry, if one exists later:** MAY be commercial. None is public in this draft.

## Links

- Specification: [`spec/AGENTID-RFC-v0.1.0.md`](spec/AGENTID-RFC-v0.1.0.md)
- GudLab: [gudlab.org](https://gudlab.org)
