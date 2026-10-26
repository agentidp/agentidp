import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import { AgentAuth, decodeAitClaims, MAX_TOKEN_LIFETIME_SECONDS } from "../src/index.js";
import { generateAgentKey } from "./helpers.js";

describe("AgentAuth", () => {
  it("requires agentId and privateKey", () => {
    expect(() => new AgentAuth({ agentId: "", privateKey: "x" })).toThrow(
      /agentId/,
    );
    expect(
      () => new AgentAuth({ agentId: "ag_1", privateKey: "" }),
    ).toThrow(/privateKey/);
  });

  it("mints an ES256 AIT from a JWK private key", async () => {
    const keys = await generateAgentKey("ag-test-kid");
    const auth = new AgentAuth({
      agentId: "ag_7xK9m2nP4qRtL8",
      privateKey: keys.privateJwk,
      registryUrl: "https://registry.agentidp.dev",
      agentName: "AcmeBookingAgent",
      ownerId: "own_T1mR4xBq9",
      ownerName: "Acme Inc",
      ownerType: "org",
      verificationLevel: "domain",
    });

    const token = await auth.getToken({
      audience: "https://api.example.com",
      capabilities: ["form:submit", "calendar:read"],
    });

    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe("AIT+jwt");
    expect(header.kid).toBe("ag-test-kid");

    const payload = decodeAitClaims(token);
    expect(payload.agent_id).toBe("ag_7xK9m2nP4qRtL8");
    expect(payload.sub).toBe("ag_7xK9m2nP4qRtL8");
    expect(payload.aud).toBe("https://api.example.com");
    expect(payload.iss).toBe("https://registry.agentidp.dev");
    expect(payload.owner_name).toBe("Acme Inc");
    expect(payload.owner_id).toBe("own_T1mR4xBq9");
    expect(payload.owner_type).toBe("org");
    expect(payload.verification_level).toBe("domain");
    expect(payload.capabilities).toEqual(["form:submit", "calendar:read"]);
    expect(payload.jti).toMatch(/^tok_/);
    expect(payload.exp - payload.iat).toBe(3600);

    const publicKey = await importJWK(keys.publicJwk, "ES256");
    await jwtVerify(token, publicKey, { algorithms: ["ES256"] });
  });

  it("accepts PKCS#8 PEM private keys", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_pem",
      privateKey: keys.pem,
      keyId: "pem-kid",
    });
    const token = await auth.getToken({ audience: "https://api.example.com" });
    const header = decodeProtectedHeader(token);
    expect(header.kid).toBe("pem-kid");
    const publicKey = await importJWK(keys.publicJwk, "ES256");
    await jwtVerify(token, publicKey);
  });

  it("accepts a JWK JSON string", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_json",
      privateKey: JSON.stringify(keys.privateJwk),
    });
    const token = await auth.getToken({ audience: "https://api.example.com" });
    expect(decodeJwt(token).agent_id).toBe("ag_json");
  });

  it("omits owner_name when the caller does not supply it", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_no_owner",
      privateKey: keys.privateJwk,
    });
    const token = await auth.getToken({ audience: "https://api.example.com" });
    const payload = decodeAitClaims(token);
    expect(payload.owner_name).toBeUndefined();
    expect(payload.owner_id).toBeUndefined();
  });

  it("rejects lifetimes above 24h", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_long",
      privateKey: keys.privateJwk,
    });
    await expect(
      auth.getToken({
        audience: "https://api.example.com",
        expiresInSeconds: MAX_TOKEN_LIFETIME_SECONDS + 1,
      }),
    ).rejects.toThrow(/24h/);
  });

  it("requires audience", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_aud",
      privateKey: keys.privateJwk,
    });
    await expect(
      auth.getToken({ audience: "  " }),
    ).rejects.toThrow(/audience/);
  });

  it("reads AGENTIDP_REGISTRY_URL when registryUrl is omitted", async () => {
    const keys = await generateAgentKey();
    const previous = process.env.AGENTIDP_REGISTRY_URL;
    process.env.AGENTIDP_REGISTRY_URL = "https://registry.example.test";
    try {
      const auth = new AgentAuth({
        agentId: "ag_env",
        privateKey: keys.privateJwk,
      });
      const token = await auth.getToken({ audience: "https://api.example.com" });
      expect(decodeAitClaims(token).iss).toBe("https://registry.example.test");
    } finally {
      if (previous === undefined) delete process.env.AGENTIDP_REGISTRY_URL;
      else process.env.AGENTIDP_REGISTRY_URL = previous;
    }
  });
});
