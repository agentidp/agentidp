# @agentidp/sdk

Agent-side SDK for AgentIDP. Generate an agent key pair, build a proof JWT, and call `POST /api/v1/tokens/exchange`. Without an API key, mint an AgentIDP token locally with a caller-held private key.

```bash
npm install @agentidp/sdk
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

When `apiKey` or `AGENTIDP_API_KEY` is set, `getToken` signs a proof JWT (`iss`/`sub` = agent id, `aud` = the token endpoint, max 5 minutes) and POSTs it to `/api/v1/tokens/exchange`. Without an API key, `getToken` still signs locally. Local mint is not the registry path. The exchange JSON may include `receipt`. Issuing is best-effort: `receipt` may be null, and not every token has a receipt. `exchangeToken` returns `receipt` as `string | null`.

The default registry is `https://registry.agentidp.dev`. Override with `registryUrl` or `AGENTIDP_REGISTRY_URL`. Canonical paths are `/api/v1/...` and `/.well-known/jwks.json`.

Register an agent with `POST /api/v1/agents` on the registry, then `registerAgentPublicKey` / `AgentAuth.registerPublicKey` for `PUT /api/v1/agents/{id}/public-key`. To replace an existing key with an owner API key, pass `currentPrivateKey`; the SDK sends a proof JWT with `aud` from `publicKeyAudience`.

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
| `ownerId`, `ownerType`, `verificationLevel` | no | Copied onto a locally minted token when set. `verificationLevel` is an integer 0-3. |

`getToken({ audience, capabilities?, expiresInSeconds?, delegationChain? })` requires a non-empty `audience`. Maximum minted lifetime is 24 hours (default 1 hour). `capabilities` maps to exchange `scopes`. `delegationChain` is an array of compact JWS hops (header `typ` `AIT-DLG+jwt`). Each hop can only narrow scopes, audience, and expiry.

Also exported: `createProofJwt`, `publicKeyAudience`, `exchangeToken`, `registerAgentPublicKey`, `createDelegationHop`, `decodeDelegationHop`, `hopNarrows`, `isSubset`, `generateAgentKeyPair`.
