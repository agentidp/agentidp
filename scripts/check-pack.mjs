import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertCleanPack,
  packAndInspect,
} from "./tarball.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const packages = [
  { name: "@agentidp/sdk", dir: join(root, "packages/sdk") },
  { name: "@agentidp/verify", dir: join(root, "packages/verify") },
];

function expectEqual(label, value, expected) {
  if (value !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
    );
  }
}

function write(dir, name, body) {
  writeFileSync(join(dir, name), body);
}

const results = [];
for (const item of packages) {
  const result = packAndInspect(item.dir);
  try {
    assertCleanPack(result);
    const pkg = result.packageJson;
    const exported = pkg.exports?.["."];
    expectEqual(`${item.name} version`, pkg.version, "0.2.0");
    expectEqual(`${item.name} type`, pkg.type, "module");
    expectEqual(`${item.name} engines.node`, pkg.engines?.node, ">=18");
    expectEqual(`${item.name} types`, pkg.types, "./dist/index.d.ts");
    expectEqual(`${item.name} main`, pkg.main, "./dist/index.js");
    expectEqual(`${item.name} exports.types`, exported?.types, "./dist/index.d.ts");
    expectEqual(`${item.name} exports.import`, exported?.import, "./dist/index.js");
    if (result.packageJson.dependencies?.["@agentidp/sdk"]) {
      throw new Error(`${item.name} must not publish a runtime dep on @agentidp/sdk`);
    }
    console.log(`${item.name} tarball ${result.filename}`);
    for (const file of result.files) console.log(`  ${file}`);
    results.push(result);
  } catch (error) {
    for (const packed of results) {
      rmSync(packed.tmp, { recursive: true, force: true });
    }
    rmSync(result.tmp, { recursive: true, force: true });
    throw error;
  }
}

const consumer = mkdtempSync(join(tmpdir(), "agentidp-consumer-"));
try {
  write(
    consumer,
    "package.json",
    JSON.stringify(
      {
        name: "agentidp-pack-consumer",
        private: true,
        type: "module",
        engines: { node: ">=18" },
      },
      null,
      2,
    ),
  );

  execFileSync(
    "npm",
    ["install", "--ignore-scripts", ...results.map((item) => item.tarball)],
    { cwd: consumer, stdio: "inherit" },
  );

  write(
    consumer,
    "esm.mjs",
    `import { AgentAuth, generateAgentKeyPair, AGENTIDP_TOKEN_TYP, AGENTIDP_PROOF_TYP, AGENTIDP_DELEGATION_TYP } from "@agentidp/sdk";
import { verifyAgentToken, AGENTIDP_TOKEN_TYP as VERIFY_TYP } from "@agentidp/verify";

if (AGENTIDP_TOKEN_TYP !== "AIT+jwt") throw new Error("sdk typ");
if (AGENTIDP_PROOF_TYP !== "AIT-POP+jwt") throw new Error("proof typ");
if (AGENTIDP_DELEGATION_TYP !== "AIT-DLG+jwt") throw new Error("delegation typ");
if (VERIFY_TYP !== "AIT+jwt") throw new Error("verify typ");

const keys = await generateAgentKeyPair();
const auth = new AgentAuth({ agentId: "ag_pack_esm", privateKey: keys.privateJwk });
const token = await auth.getToken({ audience: "https://api.example.com" });
const agent = await verifyAgentToken(token, {
  getKey: () => keys.publicJwk,
  audience: "https://api.example.com",
});
if (agent.agent_id !== "ag_pack_esm") throw new Error("esm agent_id");
console.log("esm import ok");
`,
  );

  write(
    consumer,
    "cjs.cjs",
    `"use strict";
(async () => {
  const sdk = await import("@agentidp/sdk");
  const verify = await import("@agentidp/verify");
  if (sdk.AGENTIDP_TOKEN_TYP !== "AIT+jwt") throw new Error("cjs sdk typ");
  const keys = await sdk.generateAgentKeyPair();
  const auth = new sdk.AgentAuth({ agentId: "ag_pack_cjs", privateKey: keys.privateJwk });
  const token = await auth.getToken({ audience: "https://api.example.com" });
  const agent = await verify.verifyAgentToken(token, {
    getKey: () => keys.publicJwk,
    audience: "https://api.example.com",
  });
  if (agent.agent_id !== "ag_pack_cjs") throw new Error("cjs agent_id");
  console.log("cjs import ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
  );

  write(
    consumer,
    "consumer.ts",
    `import { AgentAuth, generateAgentKeyPair, AGENTIDP_TOKEN_TYP } from "@agentidp/sdk";
import { verifyAgentToken, agentIdMiddleware } from "@agentidp/verify";

export async function check(): Promise<string> {
  const keys = await generateAgentKeyPair();
  const auth = new AgentAuth({ agentId: "ag_pack_ts", privateKey: keys.privateJwk });
  const token = await auth.getToken({ audience: "https://api.example.com" });
  const agent = await verifyAgentToken(token, {
    getKey: () => keys.publicJwk,
    audience: "https://api.example.com",
  });
  void agentIdMiddleware;
  return AGENTIDP_TOKEN_TYP + agent.agent_id;
}
`,
  );

  write(
    consumer,
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "Node16",
          moduleResolution: "Node16",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: [],
        },
        files: ["consumer.ts"],
      },
      null,
      2,
    ),
  );

  execFileSync(process.execPath, ["esm.mjs"], { cwd: consumer, stdio: "inherit" });
  execFileSync(process.execPath, ["cjs.cjs"], { cwd: consumer, stdio: "inherit" });

  const tsc = require.resolve("typescript/bin/tsc", {
    paths: [join(root, "packages/sdk")],
  });
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.json"], {
    cwd: consumer,
    stdio: "inherit",
  });
  console.log("types ok");
} finally {
  rmSync(consumer, { recursive: true, force: true });
  for (const result of results) {
    rmSync(result.tmp, { recursive: true, force: true });
  }
}
