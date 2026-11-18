# @agentidp/sdk

Agent-side SDK for AgentIDP. Generate an agent key pair, build a proof JWT, and call `POST /api/v1/tokens/exchange`. Without an API key, mint an AgentIDP token locally with a caller-held private key.

Prepared for a public npm publish as `@agentidp/sdk` `0.2.0`. The package is not on the registry until a maintainer runs the [publish checklist](../../docs/npm-publish.md). Until then, install from this workspace.

```bash
npm i @agentidp/sdk
```

```ts
import { AgentAuth, generateAgentKeyPair } from "@agentidp/sdk";

const keys = await generateAgentKeyPair(); // ES256 by default; `{ alg: "EdDSA" }` is allowed
// PUT keys.publicJwk to /api/v1/agents/{id}/public-key. Keep keys.privateJwk.

const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: keys.privateJwk,
  apiKey: process.env.AGENTIDP_API_KEY,
});

const token = await auth.getToken({
  audience: "https://api.example.com",
});
```

When `apiKey` or `AGENTIDP_API_KEY` is set, `getToken` signs a proof JWT (`iss`/`sub` = agent id, `aud` = the token endpoint, max 5 minutes) and POSTs it to `/api/v1/tokens/exchange`. Without an API key, `getToken` still signs locally. Local mint is not the registry path.

## Constructor

| Field | Required | Notes |
| --- | --- | --- |
| `agentId` | yes | Globally unique agent id (`ag_…`) |
| `privateKey` | yes | PKCS#8 PEM, SEC1 PEM, JWK JSON string, or JWK object. Generated locally; the registry stores only the public JWK. |
| `apiKey` | for exchange | Owner API key (`aidp_…`). Also read from `AGENTIDP_API_KEY`. |
| `registryUrl` | no | Registry origin. Default: `AGENTIDP_REGISTRY_URL` or `https://registry.agentidp.dev` |
| `fetch` | no | Injected fetch for tests |
| `keyId` | no | JWT `kid`. Falls back to the JWK `kid`, then `agentId` |
| `agentName`, `agentVersion`, `agentDescription` | no | Copied onto a locally minted token when set |
| `ownerId`, `ownerType`, `verificationLevel` | no | Copied onto a locally minted token when set. `verificationLevel` is an integer 0–3. `owner_name` is not a protocol claim and is omitted unless the caller passes `ownerName` for local mint. |

`getToken({ audience, capabilities?, expiresInSeconds?, delegationChain? })` requires a non-empty `audience`. Maximum minted lifetime is 24 hours (default 1 hour). `capabilities` maps to exchange `scopes`.
