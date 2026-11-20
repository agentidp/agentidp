import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { assertCleanPack, packAndInspect } from "../../../scripts/tarball.mjs";

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
    expect(packed.packageJson.version).toBe("0.3.0");
    expect(packed.packageJson.engines.node).toBe(">=18");
    expect(packed.packageJson.types).toBe("./dist/index.d.ts");
    expect(packed.packageJson.exports["."].import).toBe("./dist/index.js");
    expect(packed.packageJson.dependencies?.["@agentidp/sdk"]).toBeUndefined();
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
});
