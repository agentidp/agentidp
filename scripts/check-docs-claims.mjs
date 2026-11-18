#!/usr/bin/env node
/**
 * Fails if protocol docs regress on voice/accuracy guards, or if AGENTS.md
 * lists a path in this repository that does not exist.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const agentsPath = join(root, "AGENTS.md");

const EM_DASH = "\u2014";
const STALE = [
  "not live yet",
  "registry not live",
  "the host is not live",
  "tests mock these paths",
  "not on the registry until",
  "unpublished typescript",
  "no public npm",
  "no live public registry",
  "a public registry is not",
  "being published",
  "not yet published",
  "not yet on npm",
];

const OWNER_NAME_OK =
  /must not|not a protocol|omitted|omits|does not|do not|never|not required|leftover|not copy|not include|is not|without requiring|absence/i;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function listMarkdown(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) {
      continue;
    }
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      listMarkdown(full, acc);
    } else if (name.endsWith(".md") && name !== "CHANGELOG.md") {
      acc.push(full);
    }
  }
  return acc;
}

function thisRepoPathsFromAgents(text) {
  const marker = "### This repository";
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new Error("AGENTS.md is missing '### This repository'");
  }
  const rest = text.slice(start + marker.length);
  const next = rest.search(/\n### /);
  const section = next < 0 ? rest : rest.slice(0, next);
  const paths = [];
  for (const match of section.matchAll(/^- `([^`]+)`/gm)) {
    paths.push(match[1]);
  }
  if (paths.length === 0) {
    throw new Error("AGENTS.md this-repository path list is empty");
  }
  return paths;
}

function stripIgnored(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ");
}

function scanFile(file) {
  const rel = relative(root, file);
  const raw = readFileSync(file, "utf8");

  if (raw.includes(EM_DASH)) {
    const line = raw.split(/\n/).findIndex((row) => row.includes(EM_DASH)) + 1;
    fail(`${rel}:${line} contains an em dash`);
  }

  for (const phrase of STALE) {
    const idx = raw.toLowerCase().indexOf(phrase);
    if (idx >= 0) {
      const line = raw.slice(0, idx).split(/\n/).length;
      fail(`${rel}:${line} contains stale phrasing ${JSON.stringify(phrase)}`);
    }
  }

  const lines = raw.split(/\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("owner_name")) continue;
    if (OWNER_NAME_OK.test(line)) continue;
    fail(
      `${rel}:${i + 1} contains owner_name without a denial (MUST NOT / is not / omitted / ...)`,
    );
  }

  const prose = stripIgnored(raw);
  const ait = /\bAIT\b/.exec(prose);
  if (ait) {
    fail(
      `${rel} uses the AIT acronym in prose. Keep it as a wire string in code spans only.`,
    );
  }
}

const agents = readFileSync(agentsPath, "utf8");
const listed = thisRepoPathsFromAgents(agents);
for (const path of listed) {
  const full = join(root, path);
  if (!existsSync(full)) {
    fail(`AGENTS.md lists missing path: ${path}`);
  }
}

const docs = listMarkdown(root);
docs.push(join(root, ".github/pull_request_template.md"));
for (const file of docs) {
  scanFile(file);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log(`docs-claims ok (${listed.length} AGENTS.md paths, ${docs.length} markdown files)`);
