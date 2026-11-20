import { describe, expect, it, vi } from "vitest";

import { AgentAuth } from "../../sdk/src/index.js";
import { agentIdChallenge, agentIdMiddleware, AgentIdError } from "../src/index.js";
import { generateAgentKey } from "../../sdk/tests/helpers.js";

function fakeRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

const AUDIENCE = "https://gudcal.example";

describe("401 discovery challenge", () => {
  it("tells an agent with no token where to get one, without an error code", async () => {
    const res = fakeRes();
    await agentIdMiddleware({ audience: AUDIENCE })({ headers: {} }, res, vi.fn());

    expect(res.statusCode).toBe(401);
    expect(res.headers["WWW-Authenticate"]).toBe(
      `Bearer realm="agentidp", registry="https://registry.agentidp.dev", audience="${AUDIENCE}"`,
    );
  });

  it("adds invalid_token when a bad token was sent", async () => {
    const res = fakeRes();
    await agentIdMiddleware({ audience: AUDIENCE, registryUrl: "https://reg.example/" })(
      { headers: { authorization: "Bearer not.a.jwt" } },
      res,
      vi.fn(),
    );

    expect(res.statusCode).toBe(401);
    const header = res.headers["WWW-Authenticate"];
    expect(header).toMatch(
      /^Bearer realm="agentidp", registry="https:\/\/reg\.example", audience="https:\/\/gudcal\.example", error="invalid_token", error_description="[^"]+"$/,
    );
  });

  it("is not sent on a 403", async () => {
    const keys = await generateAgentKey();
    const token = await new AgentAuth({
      agentId: "ag_7xK9m2nP4qRtL8",
      privateKey: keys.privateJwk,
      verificationLevel: 1,
    }).getToken({ audience: AUDIENCE });

    const res = fakeRes();
    await agentIdMiddleware({
      audience: AUDIENCE,
      minVerificationLevel: 2,
      getKey: () => keys.publicJwk,
    })({ headers: { authorization: `Bearer ${token}` } }, res, vi.fn());

    expect(res.statusCode).toBe(403);
    expect(res.headers["WWW-Authenticate"]).toBeUndefined();
  });

  it("keeps header values safe and leaves out the registry for a custom getKey", () => {
    const header = agentIdChallenge(
      { audience: ['https://a.example/"x"\r\n', "https://b.example"], getKey: () => undefined },
      new AgentIdError("AID-001", 'bad "quote" \\ ünicode'),
    );
    expect(header).toBe(
      'Bearer realm="agentidp", audience="https://a.example/x", error="invalid_token", error_description="AgentIDP token signature verification failed: bad quote  nicode"',
    );
  });
});
