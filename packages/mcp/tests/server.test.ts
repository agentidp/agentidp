import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAgentIdpServer, type FetchLike } from "../src/index.js";

const REGISTRY = "https://registry.test";
const API_KEY = "aidp_testkey_secret";

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

async function mockRegistry() {
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "reg-1", alg: "ES256", use: "sig" };
  const calls: Call[] = [];
  let createStatus = 201;

  const sign = (claims: Record<string, unknown>) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", typ: "AIT+jwt", kid: "reg-1" })
      .setIssuer(REGISTRY)
      .setIssuedAt()
      .setExpirationTime("1h")
      .setSubject(String(claims.agent_id))
      .sign(privateKey);

  const fetch: FetchLike = async (input, init) => {
    const path = input.replace(REGISTRY, "");
    const method = init?.method ?? "GET";
    const body = init?.body
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : undefined;
    calls.push({ method, path, headers: init?.headers ?? {}, body });
    const reply = (status: number, json: unknown) => ({
      ok: status < 400,
      status,
      json: async () => json,
    });

    if (path === "/.well-known/jwks.json") return reply(200, { keys: [jwk] });
    if (method === "POST" && path === "/api/v1/agents") {
      if (createStatus !== 201) {
        return reply(createStatus, { error: "Free tier limited to 5 active agents." });
      }
      return reply(201, {
        agent_id: "ag_new123",
        agent_name: body?.name,
        kid: "ag_new123-2026-11-19",
        status: "active",
      });
    }
    if (method === "PUT" && path === "/api/v1/agents/ag_new123/public-key") {
      return reply(200, { ok: true });
    }
    if (method === "POST" && path === "/api/v1/tokens/exchange") {
      return reply(200, {
        token: await sign({ agent_id: body?.agent_id, aud: body?.aud }),
        token_type: "AIT+jwt",
        token_id: "ait_1",
        expires_at: "2026-11-19T13:00:00.000Z",
        agent_id: body?.agent_id,
        kid: "reg-1",
      });
    }
    if (path === "/api/v1/agents/ag_known") {
      return reply(200, { agent_id: "ag_known", status: "active" });
    }
    if (path === "/api/v1/agents/ag_known/status") {
      return reply(200, { agent_id: "ag_known", status: "active" });
    }
    return reply(404, { error: "AID-004", message: "Agent not found" });
  };

  return {
    fetch,
    calls,
    sign,
    failCreate(status: number) {
      createStatus = status;
    },
  };
}

let keyDir: string;

beforeEach(async () => {
  keyDir = await mkdtemp(join(tmpdir(), "agentidp-mcp-"));
});

afterEach(async () => {
  await rm(keyDir, { recursive: true, force: true });
});

async function connect(options: { apiKey?: string; fetch: FetchLike }) {
  const server = createAgentIdpServer({
    registryUrl: REGISTRY,
    keyDir,
    ...options,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0]?.text ?? "";
    return { isError: result.isError === true, text };
  };
  return { client, call };
}

const keyFiles = async () =>
  (await readdir(keyDir)).filter((name) => name !== ".gitignore").sort();

describe("AgentIDP MCP server", () => {
  it("lists its tools", async () => {
    const registry = await mockRegistry();
    const { client } = await connect({ fetch: registry.fetch });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "agent_status",
      "lookup_agent",
      "mint_token",
      "register_agent",
      "rotate_agent_key",
      "verify_token",
    ]);
  });

  it("reads public records without an API key and sends no credential", async () => {
    const registry = await mockRegistry();
    const { call } = await connect({ fetch: registry.fetch });

    const lookup = await call("lookup_agent", { agent_id: "ag_known" });
    expect(lookup.isError).toBe(false);
    expect(JSON.parse(lookup.text).agent_id).toBe("ag_known");

    const status = await call("agent_status", { agent_id: "ag_known" });
    expect(JSON.parse(status.text).status).toBe("active");

    expect(registry.calls.every((c) => !c.headers.Authorization)).toBe(true);
  });

  it("passes the registry's error code through", async () => {
    const registry = await mockRegistry();
    const { call } = await connect({ fetch: registry.fetch });
    const result = await call("lookup_agent", { agent_id: "ag_missing" });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("AID-004: Agent not found");
  });

  it("refuses write tools without an API key and leaves no key file", async () => {
    const registry = await mockRegistry();
    const { call } = await connect({ fetch: registry.fetch });
    const result = await call("register_agent", { name: "Booking" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("AGENTIDP_API_KEY");
    expect(registry.calls).toHaveLength(0);
    expect(await readdir(keyDir)).toEqual([]);
  });

  it("registers an agent without ever returning or sending the private key", async () => {
    const registry = await mockRegistry();
    const { call } = await connect({ apiKey: API_KEY, fetch: registry.fetch });

    const result = await call("register_agent", {
      name: "Booking",
      capabilities: ["calendar:read"],
    });
    expect(result.isError).toBe(false);
    const out = JSON.parse(result.text);
    expect(out.agent_id).toBe("ag_new123");
    expect(out.private_key_path).toBe(join(keyDir, "ag_new123.private.jwk.json"));

    // The registry got the public half only, with the owner key.
    const create = registry.calls.find((c) => c.path === "/api/v1/agents")!;
    expect(create.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    const sent = create.body!.public_key as JWK;
    expect(sent.x).toBeTruthy();
    expect(sent.d).toBeUndefined();

    // The private half is on disk, owner-only, and absent from the tool result.
    const saved = JSON.parse(await readFile(out.private_key_path, "utf8")) as JWK;
    expect(saved.d).toBeTruthy();
    expect(saved.x).toBe(sent.x);
    expect(result.text).not.toContain(saved.d!);
    expect((await stat(out.private_key_path)).mode & 0o777).toBe(0o600);
    expect(await readFile(join(keyDir, ".gitignore"), "utf8")).toBe("*\n");
  });

  it("discards the staged key when the registry rejects the agent", async () => {
    const registry = await mockRegistry();
    registry.failCreate(403);
    const { call } = await connect({ apiKey: API_KEY, fetch: registry.fetch });
    const result = await call("register_agent", { name: "Booking" });
    expect(result.isError).toBe(true);
    expect(result.text).toBe("HTTP_403: Free tier limited to 5 active agents.");
    expect(await keyFiles()).toEqual([]);
  });

  it("mints a token with a proof signed by the agent's key file", async () => {
    const registry = await mockRegistry();
    const { call } = await connect({ apiKey: API_KEY, fetch: registry.fetch });
    await call("register_agent", { name: "Booking" });

    const minted = await call("mint_token", {
      agent_id: "ag_new123",
      audience: "https://api.example.com",
    });
    expect(minted.isError).toBe(false);
    const exchange = registry.calls.find((c) => c.path === "/api/v1/tokens/exchange")!;
    expect(exchange.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(exchange.body!.aud).toBe("https://api.example.com");
    const [header] = String(exchange.body!.proof).split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString()).typ).toBe("AIT-POP+jwt");

    // The minted token verifies through the same server.
    const token = JSON.parse(minted.text).token as string;
    const verified = await call("verify_token", {
      token,
      audience: "https://api.example.com",
    });
    expect(verified.isError).toBe(false);
    expect(JSON.parse(verified.text).agent.agent_id).toBe("ag_new123");

    const wrongAudience = await call("verify_token", {
      token,
      audience: "https://other.example.com",
    });
    expect(wrongAudience.isError).toBe(true);
    expect(wrongAudience.text).toMatch(/^AID-\d{3}: /);
  });

  it("does not mint without a key file, and says so without leaking paths' contents", async () => {
    const registry = await mockRegistry();
    const { call } = await connect({ apiKey: API_KEY, fetch: registry.fetch });
    const result = await call("mint_token", {
      agent_id: "ag_new123",
      audience: "https://api.example.com",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No private key file");
    expect(registry.calls).toHaveLength(0);
  });

  it("rotates a key with a proof from the old key and keeps the old file", async () => {
    const registry = await mockRegistry();
    const { call } = await connect({ apiKey: API_KEY, fetch: registry.fetch });
    const registered = JSON.parse(
      (await call("register_agent", { name: "Booking" })).text,
    );
    const before = JSON.parse(await readFile(registered.private_key_path, "utf8")) as JWK;

    const rotated = await call("rotate_agent_key", { agent_id: "ag_new123" });
    expect(rotated.isError).toBe(false);

    const put = registry.calls.find((c) => c.method === "PUT")!;
    expect(typeof put.body!.proof).toBe("string");
    const sent = put.body!.public_key as JWK;
    expect(sent.d).toBeUndefined();
    expect(sent.x).not.toBe(before.x);

    const after = JSON.parse(await readFile(registered.private_key_path, "utf8")) as JWK;
    expect(after.x).toBe(sent.x);
    expect(rotated.text).not.toContain(after.d!);
    const files = await keyFiles();
    expect(files).toHaveLength(2);
    expect(files.some((name) => name.includes(".replaced-"))).toBe(true);
  });

  it("replaces a planted .gitignore and refuses a symlinked key directory", async () => {
    const registry = await mockRegistry();
    await writeFile(join(keyDir, ".gitignore"), "!*\n");
    const first = await connect({ apiKey: API_KEY, fetch: registry.fetch });
    await first.call("register_agent", { name: "Booking" });
    expect(await readFile(join(keyDir, ".gitignore"), "utf8")).toBe("*\n");

    const elsewhere = await mkdtemp(join(tmpdir(), "agentidp-elsewhere-"));
    const link = join(keyDir, "link");
    await symlink(elsewhere, link);
    const server = createAgentIdpServer({
      registryUrl: REGISTRY,
      keyDir: link,
      apiKey: API_KEY,
      fetch: registry.fetch,
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    const result = await client.callTool({
      name: "register_agent",
      arguments: { name: "Booking" },
    });
    expect(result.isError).toBe(true);
    expect(await readdir(elsewhere)).toEqual([]);
    await rm(elsewhere, { recursive: true, force: true });
  });

  it("rejects agent ids that could escape the key directory", async () => {
    const registry = await mockRegistry();
    const { call } = await connect({ apiKey: API_KEY, fetch: registry.fetch });
    const result = await call("mint_token", {
      agent_id: "../../etc/passwd",
      audience: "https://api.example.com",
    });
    expect(result.isError).toBe(true);
    expect(registry.calls).toHaveLength(0);
  });
});
