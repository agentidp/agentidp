import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

const PRIVATE_JWK_D = /"d"\s*:/;

const ALLOWED_ROOT = new Set([
  "package.json",
  "README.md",
  "readme.md",
  "CHANGELOG.md",
  "LICENSE",
  "LICENSE.md",
]);

function posix(rel) {
  return rel.replaceAll("\\", "/");
}

export function isAllowedTarballPath(rel) {
  const n = posix(rel);
  if (ALLOWED_ROOT.has(n)) return true;
  return n === "dist" || n.startsWith("dist/");
}

export function forbiddenTarballReason(rel) {
  const n = posix(rel).toLowerCase();
  const parts = n.split("/");
  if (parts.includes("tests")) {
    return "tests";
  }
  if (parts.includes("vectors") || parts.includes("spec")) {
    return "spec/vectors";
  }
  if (parts.includes(".env") || n === ".env" || n.startsWith(".env.")) {
    return ".env";
  }
  if (n.includes(".test.")) {
    return "tests";
  }
  if (!isAllowedTarballPath(rel)) {
    return `not in allowlist: ${posix(rel)}`;
  }
  return null;
}

export function walkFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, base, out);
    else out.push(relative(base, p));
  }
  return out;
}

export function packPackage(packageDir, destDir) {
  const json = execFileSync("npm", ["pack", "--json", "--pack-destination", destDir], {
    cwd: packageDir,
    encoding: "utf8",
  });
  const parsed = JSON.parse(json);
  const info = Array.isArray(parsed) ? parsed[0] : parsed;
  const filename = basename(info.filename);
  return {
    filename,
    tarball: join(destDir, filename),
    listedFiles: (info.files ?? []).map((file) => file.path),
  };
}

export function extractTarball(tarball, destDir) {
  execFileSync("tar", ["-xzf", tarball, "-C", destDir]);
  return join(destDir, "package");
}

export function inspectExtractedPackage(extractedDir) {
  const files = walkFiles(extractedDir).map(posix).sort();
  const errors = [];

  for (const rel of files) {
    const forbidden = forbiddenTarballReason(rel);
    if (forbidden) {
      errors.push(`${rel}: excluded path (${forbidden})`);
    }
    const content = readFileSync(join(extractedDir, rel), "utf8");
    if (PRIVATE_JWK_D.test(content)) {
      errors.push(`${rel}: contains a JWK private member`);
    }
  }

  return { files, errors };
}

export function packAndInspect(packageDir) {
  const tmp = mkdtempSync(join(tmpdir(), "agentidp-pack-"));
  try {
    const packed = packPackage(packageDir, tmp);
    const extracted = extractTarball(packed.tarball, tmp);
    const inspected = inspectExtractedPackage(extracted);
    const pkg = JSON.parse(readFileSync(join(extracted, "package.json"), "utf8"));
    return {
      tmp,
      tarball: packed.tarball,
      filename: packed.filename,
      listedFiles: packed.listedFiles,
      files: inspected.files,
      errors: inspected.errors,
      packageJson: pkg,
    };
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

export function assertCleanPack(result) {
  if (result.errors.length > 0) {
    throw new Error(
      `tarball ${result.filename} failed hygiene:\n${result.errors.join("\n")}`,
    );
  }
}
