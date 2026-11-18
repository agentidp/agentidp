import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { importJWK, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import { AGENTIDP_TOKEN_TYP, verifyAgentToken } from "../src/index.js";

interface VectorFile {
  clock: { iat: number };
  resource_audience: string;
  keys: {
    warning: string;
    acting_agent: {
      public_jwk: Record<string, unknown>;
      jkt: string;
    };
    registry: { public_jwk: Record<string, unknown> };
  };
  minted_token_example: {
    token: string;
    cnf: { jkt: string };
  };
}

const vectorsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../spec/vectors/token-exchange-v0.1.json",
);
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as VectorFile;

describe("token-exchange minted token vector", () => {
  it("verifies cnf.jkt against the test-only agent public JWK", async () => {
    expect(vectors.keys.warning).toMatch(/TEST ONLY/i);
    const registryKey = await importJWK(
      vectors.keys.registry.public_jwk as never,
      "ES256",
    );
    const { payload, protectedHeader } = await jwtVerify(
      vectors.minted_token_example.token,
      registryKey,
      {
        currentDate: new Date(vectors.clock.iat * 1000),
        audience: vectors.resource_audience,
        typ: AGENTIDP_TOKEN_TYP,
      },
    );
    expect(protectedHeader.typ).toBe(AGENTIDP_TOKEN_TYP);
    expect(payload.cnf).toEqual({ jkt: vectors.keys.acting_agent.jkt });
    expect(payload.verification_level).toBe(2);
    expect(payload.owner_name).toBeUndefined();

    const agent = await verifyAgentToken(vectors.minted_token_example.token, {
      getKey: () => vectors.keys.registry.public_jwk as never,
      audience: vectors.resource_audience,
      confirmationJwk: vectors.keys.acting_agent.public_jwk as never,
      now: () => new Date(vectors.clock.iat * 1000),
    });
    expect(agent.cnf?.jkt).toBe(vectors.keys.acting_agent.jkt);
    expect(agent.aud).toBe(vectors.resource_audience);
    expect(agent.verification_level).toBe(2);
    expect(agent.owner_name).toBeUndefined();
  });
});
