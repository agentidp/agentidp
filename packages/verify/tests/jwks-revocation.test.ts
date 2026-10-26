import { describe, expect, it } from "vitest";

import { AgentIdError, verifyAgentToken } from "../src/index.js";
import { cacheTtlMs } from "../src/jwks.js";
import {
  lookupRoute,
  publicKeyRoute,
  REGISTRY,
  revokedPublicKeyRoute,
  statusRoute,
  jwksRoute,
} from "./fixtures/registry-contract.js";
import { generatePair, jsonFetch, signAit } from "./helpers.js";

describe("cacheTtlMs", () => {
  it("caps Cache-Control max-age at the configured TTL", () => {
    expect(cacheTtlMs(3600, "public, max-age=86400")).toBe(3600_000);
    expect(cacheTtlMs(3600, "public, max-age=60")).toBe(60_000);
    expect(cacheTtlMs(3600)).toBe(3600_000);
  });
});

describe("JWKS fetch and cache", () => {
  it("verifies from /.well-known/jwks.json and reuses the cache", async () => {
    const pair = await generatePair("jwks-kid");
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_jwks", aud: "https://api.example.com" },
      pair.kid,
    );
    const calls: string[] = [];
    const fetchImpl = jsonFetch(jwksRoute([pair.publicJwk]), calls);

    const first = await verifyAgentToken(token, {
      registryUrl: REGISTRY,
      fetch: fetchImpl,
    });
    const second = await verifyAgentToken(token, {
      registryUrl: REGISTRY,
      fetch: fetchImpl,
    });

    expect(first.agent_id).toBe("ag_jwks");
    expect(second.agent_id).toBe("ag_jwks");
    expect(calls.filter((url) => url.endsWith("/.well-known/jwks.json"))).toHaveLength(1);
  });

  it("refetches JWKS after the cache TTL expires", async () => {
    const pair = await generatePair("expire-kid");
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_expire", aud: "https://api.example.com" },
      pair.kid,
    );
    const calls: string[] = [];
    const fetchImpl = jsonFetch(jwksRoute([pair.publicJwk]), calls);
    const t0 = Date.now();

    await verifyAgentToken(token, {
      registryUrl: REGISTRY,
      fetch: fetchImpl,
      keyCacheTtlSeconds: 2,
      now: () => new Date(t0),
    });
    await verifyAgentToken(token, {
      registryUrl: REGISTRY,
      fetch: fetchImpl,
      keyCacheTtlSeconds: 2,
      now: () => new Date(t0 + 2500),
    });

    expect(calls.filter((url) => url.endsWith("/.well-known/jwks.json"))).toHaveLength(2);
  });

  it("honours a shorter Cache-Control max-age on JWKS", async () => {
    const pair = await generatePair("cc-kid");
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_cc", aud: "https://api.example.com" },
      pair.kid,
    );
    const calls: string[] = [];
    const fetchImpl = jsonFetch(
      jwksRoute([pair.publicJwk], "public, max-age=1"),
      calls,
    );
    const t0 = Date.now();

    await verifyAgentToken(token, {
      registryUrl: REGISTRY,
      fetch: fetchImpl,
      keyCacheTtlSeconds: 3600,
      now: () => new Date(t0),
    });
    await verifyAgentToken(token, {
      registryUrl: REGISTRY,
      fetch: fetchImpl,
      keyCacheTtlSeconds: 3600,
      now: () => new Date(t0 + 1500),
    });

    expect(calls.filter((url) => url.endsWith("/.well-known/jwks.json"))).toHaveLength(2);
  });

  it("refetches once on kid miss then fails if the kid is still absent", async () => {
    const pair = await generatePair("missing-kid");
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_miss", aud: "https://api.example.com" },
      pair.kid,
    );
    const calls: string[] = [];
    const fetchImpl = jsonFetch(jwksRoute([]), calls);

    await expect(
      verifyAgentToken(token, {
        registryUrl: REGISTRY,
        fetch: fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "AID-001" });

    expect(calls.filter((url) => url.endsWith("/.well-known/jwks.json")).length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to /api/v1/agents/{id}/public-key for agent-signed tokens", async () => {
    const pair = await generatePair("agent-kid");
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_self", aud: "https://api.example.com" },
      pair.kid,
    );
    const calls: string[] = [];
    const agent = await verifyAgentToken(token, {
      registryUrl: REGISTRY,
      fetch: jsonFetch(
        {
          ...jwksRoute([]),
          ...publicKeyRoute("ag_self", pair.publicJwk),
        },
        calls,
      ),
    });
    expect(agent.agent_id).toBe("ag_self");
    expect(calls.some((url) => url.includes("/v1/") && !url.includes("/api/v1/"))).toBe(false);
    expect(calls).toContain(`${REGISTRY}/api/v1/agents/ag_self/public-key`);
  });
});

describe("revocation status", () => {
  it("accepts an active agent when checkRevocation is on", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_ok", aud: "https://api.example.com" },
      pair.kid,
    );
    const agent = await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      checkRevocation: true,
      registryUrl: REGISTRY,
      fetch: jsonFetch(statusRoute("ag_ok", "active")),
    });
    expect(agent.agent_id).toBe("ag_ok");
  });

  it("rejects a revoked agent with AID-003", async () => {
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
        registryUrl: REGISTRY,
        fetch: jsonFetch(statusRoute("ag_rev", "revoked")),
      }),
    ).rejects.toMatchObject({ code: "AID-003" });
  });

  it("rejects a suspended agent with AID-004", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_sus", aud: "https://api.example.com" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        checkRevocation: true,
        registryUrl: REGISTRY,
        fetch: jsonFetch(statusRoute("ag_sus", "suspended")),
      }),
    ).rejects.toMatchObject({ code: "AID-004" });
  });

  it("uses lookup status when /status is missing", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_look", aud: "https://api.example.com" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        checkRevocation: true,
        registryUrl: REGISTRY,
        fetch: jsonFetch(lookupRoute("ag_look", "revoked")),
      }),
    ).rejects.toMatchObject({ code: "AID-003" });
  });

  it("fails closed when status is unavailable", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_down", aud: "https://api.example.com" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        checkRevocation: true,
        registryUrl: REGISTRY,
        fetch: jsonFetch({}),
      }),
    ).rejects.toMatchObject({ code: "AID-001" });
  });

  it("fails closed when the registry fetch throws", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_net", aud: "https://api.example.com" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        getKey: () => pair.publicJwk,
        checkRevocation: true,
        registryUrl: REGISTRY,
        fetch: async () => {
          throw new Error("network down");
        },
      }),
    ).rejects.toMatchObject({ code: "AID-001" });
  });

  it("treats a revoked public-key response as AID-003", async () => {
    const pair = await generatePair("rev-key");
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_pkrev", aud: "https://api.example.com" },
      pair.kid,
    );
    await expect(
      verifyAgentToken(token, {
        registryUrl: REGISTRY,
        fetch: jsonFetch({
          ...jwksRoute([]),
          ...revokedPublicKeyRoute("ag_pkrev"),
        }),
      }),
    ).rejects.toMatchObject({ code: "AID-003" });
  });

  it("keeps revocation freshness at min(token remaining life, cache TTL)", async () => {
    const pair = await generatePair();
    const token = await signAit(
      pair.privateKey,
      { agent_id: "ag_fresh", aud: "https://api.example.com" },
      pair.kid,
      30,
    );
    const calls: string[] = [];
    const fetchImpl = jsonFetch(statusRoute("ag_fresh", "active"), calls);
    const t0 = Date.now();

    await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      checkRevocation: true,
      registryUrl: REGISTRY,
      revocationCacheTtlSeconds: 60,
      fetch: fetchImpl,
      now: () => new Date(t0),
    });
    await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      checkRevocation: true,
      registryUrl: REGISTRY,
      revocationCacheTtlSeconds: 60,
      fetch: fetchImpl,
      now: () => new Date(t0 + 10_000),
    });
    await verifyAgentToken(token, {
      getKey: () => pair.publicJwk,
      checkRevocation: true,
      registryUrl: REGISTRY,
      revocationCacheTtlSeconds: 60,
      fetch: fetchImpl,
      now: () => new Date(t0 + 31_000),
      clockToleranceSeconds: 60,
    });

    const statusCalls = calls.filter((url) => url.endsWith("/status"));
    expect(statusCalls).toHaveLength(2);
  });
});
