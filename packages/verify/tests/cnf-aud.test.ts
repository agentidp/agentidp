import { calculateJwkThumbprint, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { AgentIdError, AGENTIDP_TOKEN_TYP_ALIAS, verifyAgentToken } from "../src/index.js";
import { generatePair, signAit } from "./helpers.js";

describe("typ alias", () => {
  it("accepts agentidp+jwt as a verifier alias for AIT+jwt", async () => {
    const pair = await generatePair();
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      agent_id: "ag_alias",
      aud: "https://api.example.com",
    })
      .setProtectedHeader({
        alg: "ES256",
        typ: AGENTIDP_TOKEN_TYP_ALIAS,
        kid: pair.kid,
      })
      .setSubject("ag_alias")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(pair.privateKey);

    const agent = await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      audience: "https://api.example.com",
    });
    expect(agent.agent_id).toBe("ag_alias");
  });
});

describe("required aud", () => {
  it("rejects a token with no aud (AID-011)", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_noaud" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, { getKey: () => pair.publicJwk }),
    ).rejects.toMatchObject({ code: "AID-011" });
  });

  it("allows missing aud only when requireAudience is false", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_legacy" },
      pair.kid,
    );
    const agent = await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      requireAudience: false,
    });
    expect(agent.agent_id).toBe("ag_legacy");
  });
});

describe("cnf.jkt", () => {
  it("accepts a well-formed cnf.jkt and exposes it", async () => {
    const pair = await generatePair();
    const jkt = await calculateJwkThumbprint(pair.publicJwk, "sha256");
    const token = await signAit(
      pair.privateKey,
      {
        agent_id: "ag_cnf",
        aud: "https://api.example.com",
        cnf: { jkt },
      },
      pair.kid,
    );
    const agent = await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      audience: "https://api.example.com",
      confirmationJwk: pair.publicJwk,
    });
    expect(agent.cnf).toEqual({ jkt });
  });

  it("rejects cnf.jkt that does not match confirmationJwk", async () => {
    const pair = await generatePair();
    const other = await generatePair("other");
    const jkt = await calculateJwkThumbprint(other.publicJwk, "sha256");
    const token = await signAit(
      pair.privateKey,
      {
        agent_id: "ag_badcnf",
        aud: "https://api.example.com",
        cnf: { jkt },
      },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        confirmationJwk: pair.publicJwk,
      }),
    ).rejects.toMatchObject({ code: "AID-001" });
  });

  it("rejects a malformed cnf.jkt", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      {
        agent_id: "ag_malformed",
        aud: "https://api.example.com",
        cnf: { jkt: "not-a-thumbprint" },
      },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, { getKey: () => pair.publicJwk }),
    ).rejects.toBeInstanceOf(AgentIdError);
  });
});
