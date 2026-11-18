import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCleanPack,
  inspectExtractedPackage,
  packAndInspect,
} from "../../../scripts/tarball.mjs";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmps: string[] = [];

afterEach(() => {
  for (const tmp of tmps) rmSync(tmp, { recursive: true, force: true });
  tmps.length = 0;
});

describe("npm tarball", () => {
  it("contains only dist, README, LICENSE, CHANGELOG, and package.json", () => {
    const packed = packAndInspect(packageDir);
    tmps.push(packed.tmp);
    assertCleanPack(packed);
    expect(packed.packageJson.version).toBe("0.2.0");
    expect(packed.packageJson.engines.node).toBe(">=18");
    expect(packed.packageJson.types).toBe("./dist/index.d.ts");
    expect(packed.packageJson.exports["."].import).toBe("./dist/index.js");
    expect(packed.files).toEqual(
      expect.arrayContaining([
        "package.json",
        "README.md",
        "CHANGELOG.md",
        "LICENSE",
        "dist/index.js",
        "dist/index.d.ts",
      ]),
    );
    expect(packed.files.some((file) => file.includes("vectors"))).toBe(false);
    expect(packed.files.some((file) => file.includes("tests"))).toBe(false);
  }, 120_000);

  it("fails if a packed file has a JWK private member, tests, vectors, or .env", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentidp-hygiene-"));
    tmps.push(dir);
    mkdirSync(join(dir, "dist"));
    mkdirSync(join(dir, "tests"));
    mkdirSync(join(dir, "spec", "vectors"), { recursive: true });
    writeFileSync(join(dir, "package.json"), "{}\n");
    writeFileSync(join(dir, "dist", "ok.js"), "export {}\n");
    writeFileSync(
      join(dir, "dist", "secret.json"),
      '{"kty":"EC","d":"test-only-private"}\n',
    );
    writeFileSync(join(dir, "tests", "example.test.ts"), "export {}\n");
    writeFileSync(join(dir, "spec", "vectors", "keys.json"), "{}\n");
    writeFileSync(join(dir, ".env"), "SECRET=1\n");

    const { errors } = inspectExtractedPackage(dir);
    expect(errors.some((line) => line.includes("JWK private member"))).toBe(
      true,
    );
    expect(errors.some((line) => line.includes("tests"))).toBe(true);
    expect(errors.some((line) => line.includes("spec/vectors"))).toBe(true);
    expect(errors.some((line) => line.includes(".env"))).toBe(true);
  });
});
