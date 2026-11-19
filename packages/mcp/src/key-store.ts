import { randomBytes } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Agent private keys live in files, never in tool results: a tool returns the
 * path, so the key does not enter the model's conversation.
 */

const AGENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function assertAgentId(agentId: string): string {
  // Also keeps agent ids safe to use as a file name.
  if (!AGENT_ID.test(agentId)) {
    throw new Error("agent_id may only contain letters, digits, _ and -");
  }
  return agentId;
}

export function keyPath(keyDir: string, agentId: string): string {
  return join(resolve(keyDir), `${assertAgentId(agentId)}.private.jwk.json`);
}

async function ensureKeyDir(keyDir: string): Promise<string> {
  const dir = resolve(keyDir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // Keep the directory out of version control wherever it is created.
  await writeFile(join(dir, ".gitignore"), "*\n", { flag: "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
  return dir;
}

/**
 * Write the key before the registry is called, so a registered agent can
 * never end up without its key on disk. `commit` moves it into place.
 */
export async function stagePrivateKey(
  keyDir: string,
  privateJwk: unknown,
): Promise<{
  commit(agentId: string): Promise<string>;
  discard(): Promise<void>;
}> {
  const dir = await ensureKeyDir(keyDir);
  const staged = join(dir, `pending-${randomBytes(8).toString("hex")}.json`);
  // wx: never overwrite. 0600: readable by this user only.
  const handle = await open(staged, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(privateJwk, null, 2)}\n`);
  } finally {
    await handle.close();
  }

  return {
    async commit(agentId) {
      const target = keyPath(dir, agentId);
      const existing = await stat(target).catch(() => null);
      if (existing) {
        // Keep the replaced key: a rotation that half-failed is recoverable.
        await rename(target, `${target}.replaced-${Date.now()}`);
      }
      await rename(staged, target);
      return target;
    },
    async discard() {
      await rm(staged, { force: true });
    },
  };
}

/** Read a private JWK as a string for the SDK. Never include it in errors. */
export async function readPrivateKey(path: string): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`No private key file at ${path}`);
  }
  try {
    const parsed = JSON.parse(raw) as { kty?: unknown; d?: unknown };
    if (typeof parsed.kty !== "string" || typeof parsed.d !== "string") {
      throw new Error("not a private JWK");
    }
  } catch {
    throw new Error(`${path} is not a private JWK file`);
  }
  return raw;
}
