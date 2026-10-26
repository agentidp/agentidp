# @agentidp/sdk

Agent-side SDK for AgentIDP. Mint ES256 Agent Identity Tokens (AIT) with a caller-held private key.

This package lives in the `agentidp/agentidp` workspace. It is not published to npm yet. The public name stays `@agentidp/sdk` and will be used when publish is approved.

```ts
import { AgentAuth } from "@agentidp/sdk";

const auth = new AgentAuth({
  agentId: "ag_7xK9m2nP4qRtL8",
  privateKey: process.env.AGENT_PRIVATE_KEY,
});

const token = await auth.getToken({
  audience: "https://api.example.com",
});
```

## Constructor

| Field | Required | Notes |
| --- | --- | --- |
| `agentId` | yes | Globally unique agent id (`ag_…`) |
| `privateKey` | yes | PKCS#8 PEM, SEC1 PEM, JWK JSON string, or JWK object. Matches the `agent_secret` the registry returns once at registration. |
| `registryUrl` | no | Issuer (`iss`). Default: `AGENTIDP_REGISTRY_URL` or `https://registry.agentidp.dev` |
| `keyId` | no | JWT `kid`. Falls back to the JWK `kid`, then `agentId` |
| `agentName`, `agentVersion`, `agentDescription` | no | Copied onto the token when set |
| `ownerId`, `ownerName`, `ownerType`, `verificationLevel` | no | Copied onto the token when set. `owner_name` is omitted when `ownerName` is not supplied |

`getToken({ audience, capabilities?, expiresInSeconds? })` signs locally. No network call is made. Maximum lifetime is 24 hours (default 1 hour).
