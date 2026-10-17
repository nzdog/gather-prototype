/**
 * [[GTC-359]] — THE DEPLOY-DAY SECURITY CHECK. Run by hand on deploy day, on the launch commit:
 *
 *   node scripts/check-deploy-audit.mjs
 *
 * Founder rulings, 2026-10-03 and 2026-10-09: before the deploy the check is re-run on the launch
 * code "and must show no critical and nothing in what the app uses". At the commit (2026-10-09) the
 * founder chose "The four and what they bring in": "It fails on a problem in Next.js, sharp, axios,
 * Twilio or anything they bring in (say, axios's redirect library), with one named exception:
 * Next.js's build-only CSS compiler, printed as a note." So this runs
 * `npm audit --package-lock-only` on the lockfile and FAILS (exit 1) on:
 *   - any critical advisory, in any package;
 *   - any advisory of `next`, `sharp`, `axios` or `twilio`'s own;
 *   - any advisory of anything flagged that one of them brings in, followed through npm audit's
 *     own chain (each entry's `via` names the flagged packages under it) to the bottom. A failure
 *     names the chain, top first: `axios <- follow-redirects: GHSA-…`.
 * The one exception: the copy of `postcss` that `next` ships for compiling CSS at build time, at
 * the node path `node_modules/next/node_modules/postcss`. Its own advisories are printed as a note
 * and fail nothing, but only while that path is the only flagged copy of `postcss`; anything it
 * brings in is still followed, and fails. The other build, lint and migration tools' highs wait
 * until after launch (ruling of 2026-10-09) and are listed without failing.
 *
 * ⚠ NOT A ROUTE AND NOT IN THE GATE: it needs the network (npm's advisory service), so it is no
 * `test:*` script. If the audit cannot run or its answer cannot be read, it fails (exit 2) rather
 * than pass on no answer.
 *
 * Plain node, no dependencies. It prints package names, severities and advisory ids only.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WATCHED = ['next', 'sharp', 'axios', 'twilio'];
const BUILD_ONLY_CSS = 'node_modules/next/node_modules/postcss';
const TAG = '[check-deploy-audit]';

// npm audit exits 1 whenever anything is flagged, so the exit code says nothing; read the JSON.
const run = spawnSync('npm', ['audit', '--package-lock-only', '--json'], {
  cwd: REPO,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  report = null;
}
if (!report || report.error || !report.vulnerabilities || !report.metadata?.vulnerabilities) {
  console.error(`${TAG} FAILED: npm audit gave no readable answer, so nothing was checked.`);
  if (report?.error?.code) console.error(`${TAG} npm error code: ${report.error.code}`);
  process.exit(2);
}

const advisoryId = (via) => {
  const ghsa =
    typeof via.url === 'string' ? via.url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/) : null;
  return ghsa ? ghsa[0] : `npm-${via.source}`;
};

const vulnerabilities = report.vulnerabilities;
const ownAdvisories = (name) => {
  const seen = new Set();
  const out = [];
  for (const v of vulnerabilities[name]?.via ?? []) {
    if (typeof v !== 'object' || v.name !== name) continue;
    const id = advisoryId(v);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, severity: v.severity });
  }
  return out;
};
const isBuildOnlyCss = (name) => {
  const nodes = vulnerabilities[name]?.nodes ?? [];
  return name === 'postcss' && nodes.length > 0 && nodes.every((n) => n === BUILD_ONLY_CSS);
};

const failures = [];
const notes = [];

// Any critical, anywhere.
for (const name of Object.keys(vulnerabilities).sort()) {
  for (const a of ownAdvisories(name)) {
    if (a.severity === 'critical') failures.push(`${name}: ${a.id} critical`);
  }
}
if (report.metadata.vulnerabilities.critical > 0 && failures.length === 0) {
  failures.push(`${report.metadata.vulnerabilities.critical} critical package(s)`);
}

// The four, and everything flagged beneath each, through npm audit's own chain.
const walk = (chain) => {
  const name = chain[chain.length - 1];
  const entry = vulnerabilities[name];
  if (!entry) return;
  const label = chain.join(' <- ');
  for (const a of ownAdvisories(name)) {
    if (chain.length > 1 && isBuildOnlyCss(name)) {
      notes.push(`${label}: ${a.id} ${a.severity} (next's build-only CSS compiler, not failed)`);
    } else if (a.severity !== 'critical') {
      failures.push(`${label}: ${a.id} ${a.severity}`);
    } else if (chain.length > 1) {
      failures.push(`${label}: ${a.id} critical`);
    }
  }
  for (const v of entry.via) {
    if (typeof v === 'string' && !chain.includes(v)) walk([...chain, v]);
  }
};
for (const name of WATCHED) walk([name]);

const counts = report.metadata.vulnerabilities;
console.log(
  `${TAG} packages flagged: ${counts.critical} critical, ${counts.high} high, ` +
    `${counts.moderate} moderate, ${counts.low} low`
);
for (const name of Object.keys(vulnerabilities).sort()) {
  const ids = ownAdvisories(name).map((a) => `${a.id} (${a.severity})`);
  console.log(
    `  ${name} ${vulnerabilities[name].severity}${ids.length ? `: ${ids.join(', ')}` : ''}`
  );
}
for (const note of notes) console.log(`${TAG} note: ${note}`);

if (failures.length > 0) {
  console.error(`${TAG} FAILED:`);
  for (const f of [...new Set(failures)]) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `${TAG} PASSED: no critical, and nothing in ${WATCHED.join(', ')} or what they bring in ` +
    `(but next's build-only CSS compiler, noted above if flagged).`
);
