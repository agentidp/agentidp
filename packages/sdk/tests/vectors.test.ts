import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { importJWK, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import {
  AGENTIDP_PROOF_TYP,
  decodeDelegationHop,
  hopNarrows,
  isSubset,
  tokenExchangeAudience,
} from "../src/index.js";

interface VectorFile {
  registry_url: string;
  proof_audience: string;
  resource_audience: string;
  acting_agent_id: string;
  registered_capabilities: string[];
  clock: { iat: number };
  keys: {
    warning: string;
    acting_agent: {
      public_jwk: Record<string, unknown>;
      jkt: string;
    };
  };
  cases: Array<{
    name: string;
    expect: string;
    error?: string;
    proof?: string;
    now?: number;
    exchange_request: {
      agent_id: string;
      aud: string;
      scopes?: string[];
      proof: string;
      delegation_chain?: string[];
    };
  }>;
}

const vectorsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../spec/vectors/token-exchange-v0.1.json",
);
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as VectorFile;

describe("token-exchange test vectors", () => {
  it("labels keys as test-only", () => {
    expect(vectors.keys.warning).toMatch(/TEST ONLY/i);
  });

  it("valid_proof verifies against the test-only agent key", async () => {
    const vector = vectors.cases.find((item) => item.name === "valid_proof");
    expect(vector).toBeDefined();
    const publicKey = await importJWK(
      vectors.keys.acting_agent.public_jwk as never,
      "ES256",
    );
    const { payload, protectedHeader } = await jwtVerify(
      vector!.proof!,
      publicKey,
      {
        issuer: vectors.acting_agent_id,
        subject: vectors.acting_agent_id,
        audience: vectors.proof_audience,
        currentDate: new Date(vectors.clock.iat * 1000),
        typ: AGENTIDP_PROOF_TYP,
      },
    );
    expect(protectedHeader.typ).toBe(AGENTIDP_PROOF_TYP);
    expect(payload.aud).toBe(
      tokenExchangeAudience(vectors.registry_url),
    );
    expect(typeof payload.jti).toBe("string");
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(
      300,
    );
  });

  it("wrong_audience uses an aud that is not the token endpoint", async () => {
    const vector = vectors.cases.find((item) => item.name === "wrong_audience");
    expect(vector?.error).toBe("AID-013");
    const publicKey = await importJWK(
      vectors.keys.acting_agent.public_jwk as never,
      "ES256",
    );
    await expect(
      jwtVerify(vector!.proof!, publicKey, {
        audience: vectors.proof_audience,
        currentDate: new Date(vectors.clock.iat * 1000),
      }),
    ).rejects.toMatchObject({ code: "ERR_JWT_CLAIM_VALIDATION_FAILED" });
  });

  it("expired_proof fails at the vector clock", async () => {
    const vector = vectors.cases.find((item) => item.name === "expired_proof");
    expect(vector?.error).toBe("AID-013");
    const publicKey = await importJWK(
      vectors.keys.acting_agent.public_jwk as never,
      "ES256",
    );
    await expect(
      jwtVerify(vector!.proof!, publicKey, {
        currentDate: new Date((vector!.now ?? vectors.clock.iat) * 1000),
        clockTolerance: 0,
      }),
    ).rejects.toMatchObject({ code: "ERR_JWT_EXPIRED" });
  });

  it("replayed_jti is rejected the second time", () => {
    const vector = vectors.cases.find((item) => item.name === "replayed_jti");
    expect(vector?.error).toBe("AID-010");
    const payload = JSON.parse(
      Buffer.from(vector!.proof!.split(".")[1]!, "base64url").toString("utf8"),
    ) as { jti: string };
    const seen = new Set<string>();
    expect(seen.has(payload.jti)).toBe(false);
    seen.add(payload.jti);
    expect(seen.has(payload.jti)).toBe(true);
  });

  it("scope_outside_capabilities is not a subset of registered capabilities", () => {
    const vector = vectors.cases.find(
      (item) => item.name === "scope_outside_capabilities",
    );
    expect(vector?.error).toBe("AID-014");
    expect(
      isSubset(
        vector!.exchange_request.scopes ?? [],
        vectors.registered_capabilities,
      ),
    ).toBe(false);
  });

  it("widening_delegation_hop fails hopNarrows", () => {
    const vector = vectors.cases.find(
      (item) => item.name === "widening_delegation_hop",
    );
    expect(vector?.error).toBe("AID-009");
    const hops = vector!.exchange_request.delegation_chain ?? [];
    expect(hops).toHaveLength(2);
    const hop0 = decodeDelegationHop(hops[0]!);
    const hop1 = decodeDelegationHop(hops[1]!);
    expect(
      hopNarrows(
        { scopes: hop1.scopes, aud: hop1.aud, exp: hop1.exp },
        { scopes: hop0.scopes, aud: hop0.aud, exp: hop0.exp },
      ),
    ).toBe(false);
  });
});
