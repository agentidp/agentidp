import { describe, expect, it, vi } from "vitest";

import { AgentAuth } from "../../sdk/src/index.js";
import { agentIdMiddleware, MemoryRateLimitStore } from "../src/index.js";
import { generateAgentKey } from "../../sdk/tests/helpers.js";

interface FakeRes {
  statusCode: number;
  body: unknown;
  status(code: number): FakeRes;
  json(body: unknown): FakeRes;
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

describe("agentIdMiddleware", () => {
  it("attaches req.agent.owner_name for the site sample", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_7xK9m2nP4qRtL8",
      privateKey: keys.privateJwk,
      ownerName: "Acme Inc",
      ownerId: "own_T1mR4xBq9",
      ownerType: "org",
      verificationLevel: "domain",
    });
    const token = await auth.getToken({ audience: "https://api.example.com" });

    const middleware = agentIdMiddleware({
      accessTier: "authenticated",
      minVerificationLevel: 2,
      audience: "https://api.example.com",
      getKey: () => keys.publicJwk,
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
    };
    const res = fakeRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req).toHaveProperty("agent");
    expect(req.agent?.owner_name).toBe("Acme Inc");
    expect(req.agent?.agent_id).toBe("ag_7xK9m2nP4qRtL8");
  });

  it("lets open-tier requests through without a token", async () => {
    const middleware = agentIdMiddleware({ accessTier: "open" });
    const req = { headers: {} };
    const res = fakeRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("returns AID-001 when authenticated requests omit the token", async () => {
    const middleware = agentIdMiddleware({ accessTier: "authenticated" });
    const req = { headers: {} };
    const res = fakeRes();
    const next = vi.fn();
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: "AID-001" });
  });

  it("rate-limits in memory and does not pretend the store is global", async () => {
    const keys = await generateAgentKey();
    const auth = new AgentAuth({
      agentId: "ag_rl",
      privateKey: keys.privateJwk,
      verificationLevel: 2,
    });
    const token = await auth.getToken({ audience: "https://api.example.com" });
    const store = new MemoryRateLimitStore();
    const middleware = agentIdMiddleware({
      accessTier: "authenticated",
      getKey: () => keys.publicJwk,
      rateLimit: { requestsPerHour: 2, scope: "agent_id" },
      rateLimitStore: store,
    });

    for (let i = 0; i < 2; i += 1) {
      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = fakeRes();
      const next = vi.fn();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    }

    const blocked = { headers: { authorization: `Bearer ${token}` } };
    const res = fakeRes();
    const next = vi.fn();
    await middleware(blocked, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ error: "AID-007" });
  });
});
