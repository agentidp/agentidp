import { describe, expect, it } from "vitest";

import { AgentAuth } from "../../sdk/src/index.js";
import {
  AgentIdError,
  parseVerificationLevel,
  verifyAgentToken,
} from "../src/index.js";
import { generatePair, jsonFetch, signAit } from "./helpers.js";
import { generateAgentKey } from "../../sdk/tests/helpers.js";

describe("parseVerificationLevel", () => {
  it("maps integers 0–3 and numeric strings", () => {
    expect(parseVerificationLevel(0)).toBe(0);
    expect(parseVerificationLevel(1)).toBe(1);
    expect(parseVerificationLevel(2)).toBe(2);
    expect(parseVerificationLevel(3)).toBe(3);
    expect(parseVerificationLevel("2")).toBe(2);
    expect(parseVerificationLevel(undefined)).toBe(0);
  });

  it("does not treat name strings as the claim value", () => {
    expect(parseVerificationLevel("domain")).toBe(0);
    expect(parseVerificationLevel("email")).toBe(0);
    expect(parseVerificationLevel("unverified")).toBe(0);
    expect(parseVerificationLevel("organisation")).toBe(0);
  });
});

describe("verifyAgentToken", () => {
  it("accepts a token minted by AgentAuth without owner_name", async () => {
    const keys = await generateAgentKey("sdk-kid");
    const auth = new AgentAuth({
      agentId: "ag_7xK9m2nP4qRtL8",
      privateKey: keys.privateJwk,
      ownerId: "own_T1mR4xBq9",
      ownerType: "org",
      verificationLevel: 2,
    });
    const token = await auth.getToken({ audience: "https://api.example.com" });

    const agent = await verifyAgentToken(token, {
      getKey: () => keys.publicJwk,
      audience: "https://api.example.com",
      minVerificationLevel: 2,
    });

    expect(agent.agent_id).toBe("ag_7xK9m2nP4qRtL8");
    expect(agent.owner_name).toBeUndefined();
    expect(agent.owner_id).toBe("own_T1mR4xBq9");
    expect(agent.verificationLevel).toBe(2);
    expect(agent.verification_level).toBe(2);
  });

  it("leaves owner_name undefined when the AgentIDP token has no owner_name", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      {
        agent_id: "ag_opaque",
        iss: "https://registry.agentidp.dev",
        aud: "https://api.example.com",
      },
      pair.kid,
    );

    const agent = await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      audience: "https://api.example.com",
    });
    expect(agent.owner_name).toBeUndefined();
    expect(agent.agent_id).toBe("ag_opaque");
  });

  it("rejects a bad signature", async () => {
    const good = await generatePair("good");
    const other = await generatePair("other");
    const token = await signAit(
      good.privateKey,
      { agent_id: "ag_bad", aud: "https://api.example.com" },
      good.kid,
    );
    await expect(
      verifyAgentToken(token, { getKey: () => other.publicJwk }),
    ).rejects.toBeInstanceOf(AgentIdError);
    await expect(
      verifyAgentToken(token, { getKey: () => other.publicJwk }),
    ).rejects.toMatchObject({ code: "AID-001" });
  });

  it("rejects an expired token", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_exp", aud: "https://api.example.com" },
      pair.kid,
      1,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        now: () => new Date(Date.now() + 120_000),
        clockToleranceSeconds: 0,
      }),
    ).rejects.toMatchObject({ code: "AID-002" });
  });

  it("rejects a wrong audience when required", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_aud", aud: "https://api.example.com" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        audience: "https://other.example.com",
      }),
    ).rejects.toMatchObject({ code: "AID-001" });
  });

  it("rejects verification below the minimum", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      {
        agent_id: "ag_lvl",
        aud: "https://api.example.com",
        verification_level: 1,
      },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        minVerificationLevel: 2,
      }),
    ).rejects.toMatchObject({ code: "AID-005" });
  });

  it("enforces the permissioned allowlist", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_out", owner_id: "own_x", aud: "https://api.example.com" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        accessTier: "permissioned",
        allowlist: ["ag_allowed"],
      }),
    ).rejects.toMatchObject({ code: "AID-008" });

    const ok = await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      accessTier: "permissioned",
      allowlist: ["own_x"],
    });
    expect(ok.agent_id).toBe("ag_out");
  });

  it("resolves keys from the registry JWKS fixture", async () => {
    const pair = await generatePair("jwks-kid");
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_jwks", aud: "https://api.example.com" },
      pair.kid,
    );
    const agent = await verifyAgentToken(token, {
      registryUrl: "https://registry.test",
      fetch: jsonFetch({
        "https://registry.test/.well-known/jwks.json": {
          body: { keys: [pair.publicJwk] },
        },
      }),
    });
    expect(agent.agent_id).toBe("ag_jwks");
  });

  it("falls back to /api/v1/agents/{id}/public-key for agent-signed tokens", async () => {
    const pair = await generatePair("agent-kid");
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_self", aud: "https://api.example.com" },
      pair.kid,
    );
    const agent = await verifyAgentToken(token, {
      registryUrl: "https://registry.test",
      fetch: jsonFetch({
        "https://registry.test/.well-known/jwks.json": { body: { keys: [] } },
        "https://registry.test/api/v1/agents/ag_self/public-key": {
          body: pair.publicJwk,
        },
      }),
    });
    expect(agent.agent_id).toBe("ag_self");
  });

  it("rejects revoked agents when checkRevocation is on", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_rev", aud: "https://api.example.com" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        checkRevocation: true,
        registryUrl: "https://registry.test",
        fetch: jsonFetch({
          "https://registry.test/api/v1/agents/ag_rev/status": {
            body: { agent_id: "ag_rev", status: "revoked" },
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "AID-003" });
  });

  it("fills verified_domain from optional lookup and leaves owner_name unset", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_lookup", aud: "https://api.example.com" },
      pair.kid,
    );
    const agent = await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      lookupOwner: true,
      registryUrl: "https://registry.test",
      fetch: jsonFetch({
        "https://registry.test/api/v1/agents/ag_lookup": {
          body: {
            agent_id: "ag_lookup",
            owner: {
              owner_id: "own_look",
              owner_name: "Looked Up Org",
              owner_type: "org",
              verification_level: 2,
              verified_domain: "look.example",
            },
          },
        },
      }),
    });
    expect(agent.owner_name).toBeUndefined();
    expect(agent.owner_id).toBe("own_look");
    expect(agent.verified_domain).toBe("look.example");
    expect(agent.verification_level).toBe(2);
  });

  it("tolerates a leftover owner_name claim without requiring it", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      {
        agent_id: "ag_legacy_name",
        aud: "https://api.example.com",
        owner_name: "Leftover Name",
        verification_level: 2,
      },
      pair.kid,
    );
    const agent = await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      audience: "https://api.example.com",
    });
    expect(agent.owner_name).toBe("Leftover Name");
    expect(agent.verification_level).toBe(2);
  });
});
