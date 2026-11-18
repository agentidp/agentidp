import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import {
  AGENTIDP_PROOF_TYP,
  AgentAuth,
  TokenExchangeError,
  assertPublicJwk,
  createProofJwt,
  generateAgentKeyPair,
  tokenExchangeAudience,
} from "../src/index.js";
import { generateAgentKey } from "./helpers.js";

describe("generateAgentKeyPair", () => {
  it("generates an ES256 pair and strips private members from publicJwk", async () => {
    const pair = await generateAgentKeyPair({ kid: "ag-key" });
    expect(pair.alg).toBe("ES256");
    expect(pair.publicJwk.kty).toBe("EC");
    expect(pair.publicJwk.d).toBeUndefined();
    expect(pair.privateJwk.d).toBeTruthy();
    expect(() => assertPublicJwk(pair.privateJwk)).toThrow(/private fields/);
    expect(() => assertPublicJwk(pair.publicJwk)).not.toThrow();
  });

  it("generates an EdDSA pair", async () => {
    const pair = await generateAgentKeyPair({ alg: "EdDSA" });
    expect(pair.alg).toBe("EdDSA");
    expect(pair.publicJwk.kty).toBe("OKP");
    expect(pair.publicJwk.crv).toBe("Ed25519");
    expect(pair.publicJwk.d).toBeUndefined();
  });
});

describe("createProofJwt", () => {
  it("signs iss/sub = agent id, aud = token endpoint, typ proof, lifetime <= 5 min", async () => {
    const keys = await generateAgentKey("proof-kid");
    const proof = await createProofJwt({
      agentId: "ag_7xK9m2nP4qRtL8",
      privateKey: keys.privateJwk,
      registryUrl: "https://registry.agentidp.dev",
      jti: "pop_fixed",
    });

    const header = decodeProtectedHeader(proof);
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe(AGENTIDP_PROOF_TYP);

    const payload = decodeJwt(proof);
    expect(payload.iss).toBe("ag_7xK9m2nP4qRtL8");
    expect(payload.sub).toBe("ag_7xK9m2nP4qRtL8");
    expect(payload.aud).toBe(
      tokenExchangeAudience("https://registry.agentidp.dev"),
    );
    expect(payload.jti).toBe("pop_fixed");
    expect(payload.exp! - payload.iat!).toBe(60);

    const publicKey = await importJWK(keys.publicJwk, "ES256");
    await jwtVerify(proof, publicKey, {
      audience: tokenExchangeAudience("https://registry.agentidp.dev"),
    });
  });

  it("rejects proof lifetimes above 5 minutes", async () => {
    const keys = await generateAgentKey();
    await expect(
      createProofJwt({
        agentId: "ag_long",
        privateKey: keys.privateJwk,
        registryUrl: "https://registry.agentidp.dev",
        lifetimeSeconds: 301,
      }),
    ).rejects.toThrow(/300/);
  });
});

describe("AgentAuth exchange", () => {
  it("posts proof + aud to /api/v1/tokens/exchange when apiKey is set", async () => {
    const keys = await generateAgentKey();
    const calls: { url: string; init?: { method?: string; body?: string; headers?: Record<string, string> } }[] =
      [];
    const auth = new AgentAuth({
      agentId: "ag_7xK9m2nP4qRtL8",
      privateKey: keys.privateJwk,
      registryUrl: "https://registry.test",
      apiKey: "aidp_test_secret",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            token: "header.payload.sig",
            token_type: "agentidp+jwt",
            token_id: "tok_1",
            expires_at: "2026-11-18T17:00:00.000Z",
            agent_id: "ag_7xK9m2nP4qRtL8",
            kid: "registry-kid",
          }),
        };
      },
    });

    const token = await auth.getToken({
      audience: "https://api.example.com",
      capabilities: ["calendar:read"],
    });

    expect(token).toBe("header.payload.sig");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://registry.test/api/v1/tokens/exchange",
    );
    expect(calls[0]!.init?.headers?.Authorization).toBe(
      "Bearer aidp_test_secret",
    );
    const body = JSON.parse(calls[0]!.init!.body!) as {
      agent_id: string;
      aud: string;
      proof: string;
      scopes: string[];
    };
    expect(body.agent_id).toBe("ag_7xK9m2nP4qRtL8");
    expect(body.aud).toBe("https://api.example.com");
    expect(body.scopes).toEqual(["calendar:read"]);
    expect(body.proof.split(".")).toHaveLength(3);

    const proofPayload = decodeJwt(body.proof);
    expect(proofPayload.iss).toBe("ag_7xK9m2nP4qRtL8");
    expect(proofPayload.aud).toBe(
      "https://registry.test/api/v1/tokens/exchange",
    );
  });

  it("surfaces AID-013 from the registry", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_err",
      privateKey: keys.privateJwk,
      registryUrl: "https://registry.test",
      apiKey: "aidp_test_secret",
      fetch: async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          error: "AID-013",
          message: "Agent proof JWT failed verification",
        }),
      }),
    });

    await expect(
      auth.getToken({ audience: "https://api.example.com" }),
    ).rejects.toMatchObject({
      name: "TokenExchangeError",
      code: "AID-013",
      status: 401,
    });
    await expect(
      auth.getToken({ audience: "https://api.example.com" }),
    ).rejects.toBeInstanceOf(TokenExchangeError);
  });

  it("mints locally when apiKey is omitted", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_local",
      privateKey: keys.privateJwk,
    });
    const token = await auth.getToken({ audience: "https://api.example.com" });
    expect(decodeJwt(token).agent_id).toBe("ag_local");
  });
});
