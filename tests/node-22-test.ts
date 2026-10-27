/**
 * [[GTC-410]] — GATHER RUNS ON NODE 22: the version Gather is built and tested on, and the one
 * Railway runs at launch (Railpack reads .nvmrc). No page, route, database or dependency changes.
 *
 * THE RULINGS THIS SUITE PINS (the founder, 27 Oct 2026)
 *   1. Gather launches on Node 22: .nvmrc, both CI files and the two skill files say 22. No change
 *      to package.json's dependencies, the lockfile or anything under src.
 *   2. Node 22, not 24, for launch (Prisma 6 supports 22). The lowest Node 22 the dependencies
 *      allow is 22.13 (a nested eslint-visitor-keys 5.0.1 asks for ^20.19.0 || ^22.13.0 || >=24).
 *   3. RAILPACK_NODE_VERSION stays unset on Railway: it is the rollback lever, so nothing tracked
 *      may set it (a repo setting would pin the version from under the lever).
 *
 * THE LAYERS
 *   N  the pins: .nvmrc reads 22; ci.yml and claude-review.yml each pin node-version '22' (every
 *      node-version line they hold, and at least one).
 *   V  the Node running this suite is 22.13 or later and below 23.
 *   L  the rollback lever stays open: package.json has no engines entry, and no tracked config
 *      file holds the text RAILPACK_NODE_VERSION.
 *   D  the version rule itself, dry-run on versions written here by hand.
 *   P  CONTROL: nothing here reached a provider (the provider trap counted no request).
 *
 * Every expected value is written here by hand, never read from the files under test. The suite
 * reads files and git only: no dev server, no database, no provider.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { installProviderTrap, trapCount } from './helpers/provider-trap';

installProviderTrap();

const ROOT = path.join(__dirname, '..');

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
  } else {
    failed++;
    reds.push(`[${layer}] ${label}`);
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);

const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

// ── The conditions ───────────────────────────────────────────────────────────
const CHECKS = {
  /** The .nvmrc text is exactly 22 (one trailing newline allowed). */
  nvmrcIs22: (text: string) => /^22\r?\n?$/.test(text),
  /** Every `node-version:` value in a workflow file, quotes removed. */
  nodeVersions: (yml: string) =>
    [...yml.matchAll(/^\s*node-version:\s*(.*?)\s*$/gm)].map((m) =>
      m[1].replace(/^['"]|['"]$/g, '')
    ),
  /** At least one node-version line, and every one of them is 22. */
  pinsOnly22: (yml: string) => {
    const v = CHECKS.nodeVersions(yml);
    return v.length > 0 && v.every((x) => x === '22');
  },
  /** 22.13.0 or later, below 23. */
  versionOk: (version: string) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
    if (!m) return false;
    const major = Number(m[1]);
    const minor = Number(m[2]);
    return major === 22 && minor >= 13;
  },
  /** package.json parses and has no top-level engines entry. */
  noEngines: (pkgText: string) => {
    try {
      const pkg = JSON.parse(pkgText);
      return pkg !== null && typeof pkg === 'object' && !('engines' in pkg);
    } catch {
      return false;
    }
  },
  /** A tracked file that configures a build, a deploy or CI. */
  isConfigFile: (rel: string) =>
    // every non-Markdown file at the repo root (package.json, .nvmrc, next.config, ...)
    (!rel.includes('/') && !/\.md$/i.test(rel)) ||
    rel.startsWith('.github/') ||
    /(^|\/)(railway|railpack|nixpacks)\.[a-z]+$/i.test(rel) ||
    /(^|\/)(Dockerfile[^/]*|Procfile|\.env[^/]*)$/.test(rel) ||
    /\.toml$/.test(rel),
};

const LEVER = 'RAILPACK_NODE_VERSION';

function layerN() {
  section('N — the pins say 22');
  const nvmrc = read('.nvmrc');
  assert('N', 'N1 .nvmrc reads 22', CHECKS.nvmrcIs22(nvmrc), JSON.stringify(nvmrc));
  const ci = read('.github/workflows/ci.yml');
  assert(
    'N',
    "N2 .github/workflows/ci.yml pins node-version '22' (every node-version line, at least one)",
    CHECKS.pinsOnly22(ci),
    JSON.stringify(CHECKS.nodeVersions(ci))
  );
  const review = read('.github/workflows/claude-review.yml');
  assert(
    'N',
    "N3 .github/workflows/claude-review.yml pins node-version '22' (every node-version line, at least one)",
    CHECKS.pinsOnly22(review),
    JSON.stringify(CHECKS.nodeVersions(review))
  );
}

function layerV() {
  section('V — the Node running this suite');
  assert(
    'V',
    `V1 this suite runs on Node 22.13 or later and below 23 (it runs on ${process.version})`,
    CHECKS.versionOk(process.versions.node),
    process.execPath
  );
}

function layerL() {
  section('L — the rollback lever stays open');
  assert('L', 'L1 package.json has no engines entry', CHECKS.noEngines(read('package.json')));
  const tracked = git(['ls-files', '-z']);
  const files = tracked.status === 0 ? tracked.stdout.split('\0').filter(Boolean) : [];
  const config = files.filter(CHECKS.isConfigFile);
  const holding = config.filter((f) => read(f).includes(LEVER));
  assert(
    'L',
    `L2 no tracked config file (${config.length} read, package.json, .nvmrc and both workflows among them) holds the text ${LEVER}`,
    [
      'package.json',
      '.nvmrc',
      '.github/workflows/ci.yml',
      '.github/workflows/claude-review.yml',
    ].every((f) => config.includes(f)) && holding.length === 0,
    holding.join(', ')
  );
}

function layerD() {
  section('D — the version rule, dry-run on versions written by hand');
  const pass = ['22.13.0', '22.23.4', 'v22.99.1'];
  const fail = ['22.12.9', '22.0.0', '23.0.0', '24.11.0', '20.20.2', '20.19.0', '2.13.0', ''];
  assert(
    'D',
    `D1 ${pass.join(', ')} pass; ${fail.filter(Boolean).join(', ')} and an empty string fail`,
    pass.every(CHECKS.versionOk) && !fail.some(CHECKS.versionOk),
    JSON.stringify({ pass: pass.map(CHECKS.versionOk), fail: fail.map(CHECKS.versionOk) })
  );
}

function layerP() {
  section('P — CONTROL: no provider');
  assert('P', 'P1 the provider trap counted no outbound request', trapCount() === 0);
}

function main() {
  console.log('\x1b[1mGTC-410 — Gather runs on Node 22\x1b[0m');
  layerN();
  layerV();
  layerL();
  layerD();
  layerP();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(`RED:\n  ${reds.join('\n  ')}`);
}

try {
  main();
} catch (e) {
  console.error(e);
  failed++;
}
process.exit(failed > 0 ? 1 : 0);
