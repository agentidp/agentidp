import { calculateJwkThumbprint } from "jose";
import { describe, expect, it } from "vitest";

import { AgentIdError, verifyAgentToken } from "../src/index.js";
import { generatePair, signAit } from "./helpers.js";

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
