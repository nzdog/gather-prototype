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
 *   - any advisory of anything that one of them brings in, followed through the LOCKFILE'S OWN
 *     tree ([[GTC-397]]): each copy's dependencies, resolved the way node resolves them through
 *     nested node_modules, so the copy checked is the one actually used. Not npm audit's `via`
 *     chain: npm flags a parent only when the fix needs the parent changed, so on 2026-10-22 a
 *     flagged follow-redirects under an unflagged axios was never reached and the check PASSED.
 *     A failure names the chain, top first: `twilio <- axios <- follow-redirects: GHSA-…`.
 * The one exception: the copy of `postcss` that `next` ships for compiling CSS at build time, at
 * the node path `node_modules/next/node_modules/postcss`. Its own advisories are printed as a note
 * and fail nothing, but only while that path is the only flagged copy of `postcss`; anything it
 * brings in is still followed, and fails. The other build, lint and migration tools' highs wait
 * until after launch (ruling of 2026-10-09) and are listed without failing.
 *
 * [[GTC-397]]: the decision lives in `scripts/lib/deploy-audit-decide.mjs` (pure functions,
 * tested by `npm run test:deploy-audit` on hand-written fixtures); this file runs npm audit, reads
 * `package-lock.json` and prints.
 *
 * ⚠ NOT A ROUTE AND NOT IN THE GATE: it needs the network (npm's advisory service), so it is no
 * `test:*` script. If the audit cannot run or its answer cannot be read, it fails (exit 2) rather
 * than pass on no answer; the same if the lockfile cannot be read.
 *
 * Plain node, no dependencies. It prints package names, severities and advisory ids only.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WATCHED, auditReadable, decide, lockfileReadable } from './lib/deploy-audit-decide.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
if (!auditReadable(report)) {
  console.error(`${TAG} FAILED: npm audit gave no readable answer, so nothing was checked.`);
  if (report?.error?.code) console.error(`${TAG} npm error code: ${report.error.code}`);
  process.exit(2);
}

let lock;
try {
  lock = JSON.parse(fs.readFileSync(path.join(REPO, 'package-lock.json'), 'utf8'));
} catch {
  lock = null;
}
if (!lockfileReadable(lock)) {
  console.error(`${TAG} FAILED: package-lock.json could not be read, so nothing was checked.`);
  process.exit(2);
}

const { counts, listing, notes, failures } = decide(report, lock);

console.log(
  `${TAG} packages flagged: ${counts.critical} critical, ${counts.high} high, ` +
    `${counts.moderate} moderate, ${counts.low} low`
);
for (const line of listing) console.log(`  ${line}`);
for (const note of notes) console.log(`${TAG} note: ${note}`);

if (failures.length > 0) {
  console.error(`${TAG} FAILED:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `${TAG} PASSED: no critical, and nothing in ${WATCHED.join(', ')} or what they bring in ` +
    `(but next's build-only CSS compiler, noted above if flagged).`
);
