/**
 * [[GTC-397]] — THE DEPLOY-DAY CHECK FOLLOWS WHAT THE FOUR BRING IN, BY THE LOCKFILE'S OWN TREE.
 *
 *   npm run test:deploy-audit
 *
 * The check ([[GTC-359]], `scripts/check-deploy-audit.mjs`) must fail on a problem in next, sharp,
 * axios, twilio "or anything they bring in (say, axios's redirect library), with one named
 * exception: Next.js's build-only CSS compiler, printed as a note" (founder, 2026-10-09). On
 * 2026-10-22 it PASSED on the launch lockfile while follow-redirects (under twilio, through axios)
 * and source-map-js (under next, through its own postcss) were flagged: it followed only the
 * chains npm audit prints, and npm flags neither axios, twilio nor next's postcss, because their
 * allowed ranges already include the fixed versions.
 *
 * Every fixture here is HAND-WRITTEN and small, shaped like npm's real `npm audit --json` output
 * and a real lockfile v3 `packages` map. No network, no database, nothing sent. The decision is
 * asked of `scripts/lib/deploy-audit-decide.mjs` directly; the wrapper's exit codes are asked of
 * a COPY of the wrapper and the module in a temporary folder, with a fake `npm` on PATH that only
 * prints a fixture file.
 *
 *   A  the case that was missed: twilio -> axios -> follow-redirects, only follow-redirects flagged
 *   B  next -> its postcss copy -> source-map-js; the copy's own advisories stay a note
 *   C  the same trees with the fixed versions pass
 *   D  a critical anywhere fails; an unreadable audit or lockfile exits 2; the wrapper end to end
 *   E  the exception: the build-only copy alone is a note; a second flagged copy is not exempt
 *   F  a flagged lint tool outside the four's tree is listed, not failed
 *   G  two copies of one package: only the one reachable from the four counts
 *   H  where today's check was right, the same answer (GTC-359's axios case)
 *   I  the two other kinds of link the walk follows: an OPTIONAL dependency (how sharp's native
 *      image libraries and next's compilers come in) and a PEER dependency (how react comes in
 *      under next); a flagged package reached only that way FAILS, naming the chain
 *   X  the wrapper prints names, severities and advisory ids only
 *   M  the module imports nothing
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(__dirname, '..');
const MODULE = 'scripts/lib/deploy-audit-decide.mjs';
const WRAPPER = 'scripts/check-deploy-audit.mjs';
const BUILD_ONLY_CSS = 'node_modules/next/node_modules/postcss';

// ── Fixture builders, shaped like npm's own output ───────────────────────────────────────────
type Severity = 'low' | 'moderate' | 'high' | 'critical';
type Via = Record<string, unknown> | string;

/** One advisory, as npm prints it inside a package's `via`. */
const adv = (name: string, ghsa: string, severity: Severity, range: string) => ({
  source: 1000000 + [...ghsa].reduce((n, ch) => n + ch.charCodeAt(0), 0),
  name,
  dependency: name,
  title: `fixture advisory ${ghsa}`,
  url: `https://github.com/advisories/${ghsa}`,
  severity,
  cwe: [],
  cvss: { score: 0, vectorString: null },
  range,
});
/** One flagged package, as npm prints it under `vulnerabilities`. */
const vuln = (name: string, severity: Severity, via: Via[], nodes: string[], isDirect = false) => ({
  name,
  severity,
  isDirect,
  via,
  effects: [],
  range: '*',
  nodes,
  fixAvailable: true,
});
/** A whole audit answer; the metadata counts are the packages' severities, as npm counts them. */
const audit = (...vulns: ReturnType<typeof vuln>[]) => {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const v of vulns) {
    counts[v.severity] += 1;
    counts.total += 1;
  }
  return {
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(vulns.map((v) => [v.name, v])),
    metadata: {
      vulnerabilities: counts,
      dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 0 },
    },
  };
};
/** A lockfile v3: the root's dependencies and each copy at its node path. */
const lockOf = (
  root: Record<string, string>,
  packages: Record<string, Record<string, unknown>>,
  devRoot?: Record<string, string>
) => ({
  name: 'fixture',
  version: '0.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {
      name: 'fixture',
      version: '0.0.0',
      dependencies: root,
      ...(devRoot ? { devDependencies: devRoot } : {}),
    },
    ...packages,
  },
});
const pkg = (version: string, dependencies?: Record<string, string>, extra = {}) => ({
  version,
  resolved: `https://registry.npmjs.org/fixture/-/fixture-${version}.tgz`,
  integrity: 'sha512-fixture',
  license: 'MIT',
  ...(dependencies ? { dependencies } : {}),
  ...extra,
});

// The advisories (real ids where the case is real; fixture ids, marked fx01, where it is not).
const FR_ARRAY = adv('follow-redirects', 'GHSA-q3jh-wrc6-jgq8', 'high', '>=1.16.0 <1.16.1');
const SMJ = adv('source-map-js', 'GHSA-68fv-2mgg-jv7q', 'high', '>=1.0.0 <1.2.2');
const PCSS_HIGH = adv('postcss', 'GHSA-6g55-p6wh-862q', 'high', '<=8.5.11');
const PCSS_MOD = adv('postcss', 'GHSA-qx2v-qp2m-jg93', 'moderate', '<8.5.10');
const AXIOS_OWN = adv('axios', 'GHSA-c29m-xwm3-cm6r', 'high', '<1.20.0');
const BRACE = adv('brace-expansion', 'GHSA-qhr7-859c-m2p7', 'high', '<1.1.13');
const CRIT = adv('eslint', 'GHSA-fx01-crit-0001', 'critical', '<99.0.0');
const QS = adv('qs', 'GHSA-fx01-qsqs-0001', 'high', '<6.14.0');
const OPT = adv('@img/sharp-libvips-linux-x64', 'GHSA-fx01-optl-0001', 'high', '<1.2.4');
const PEER = adv('react-dom', 'GHSA-fx01-peer-0001', 'high', '<19.1.1');

// Tree A: twilio -> axios -> follow-redirects.
const treeA = (fr: string) =>
  lockOf(
    { twilio: '^5.12.0' },
    {
      'node_modules/twilio': pkg('5.12.0', { axios: '^1.12.0' }),
      'node_modules/axios': pkg('1.20.0', { 'follow-redirects': '^1.16.0' }),
      'node_modules/follow-redirects': pkg(fr),
    }
  );
// Tree B: next -> its own postcss copy -> source-map-js (and nanoid, never flagged).
const treeB = (smj: string, extraRoot: Record<string, string> = {}, extra = {}) =>
  lockOf(
    { next: '15.5.27', ...extraRoot },
    {
      'node_modules/next': pkg('15.5.27', { postcss: '8.4.31' }),
      [BUILD_ONLY_CSS]: pkg('8.4.31', { 'source-map-js': '^1.0.2', nanoid: '^3.3.6' }),
      'node_modules/source-map-js': pkg(smj),
      'node_modules/nanoid': pkg('3.3.11'),
      ...extra,
    }
  );
const pcssCopy = (...via: Via[]) => vuln('postcss', 'high', via, [BUILD_ONLY_CSS]);
const nextViaPostcss = vuln('next', 'moderate', ['postcss'], ['node_modules/next'], true);
const idOf = (a: { url: string }) =>
  (a.url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/) ?? [''])[0];
const NOTE = (a: { url: string; severity: string }) =>
  `next <- postcss: ${idOf(a)} ${a.severity} (next's build-only CSS compiler, not failed)`;

// ── The checks ───────────────────────────────────────────────────────────────────────────────
type Decision = { failures: string[]; notes: string[]; listing: string[] };
type Wrapped = { exit: number | null; out: string };
type Expect =
  | { fails: true }
  | { failures: string[] }
  | { notes: string[] }
  | { listingHas: string[] }
  | { exit: number; outHas: string }
  | { onlyIds: true }
  | { importsNothing: true }
  | { all: Expect[] };

/** One judge for every check, so the dry run asks exactly the conditions the suite asks. */
export function judge(expect: Expect, result: any): boolean {
  if ('all' in expect) return expect.all.length > 0 && expect.all.every((e) => judge(e, result));
  const same = (a: string[], b: string[]) =>
    Array.isArray(a) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if ('fails' in expect) return Array.isArray(result?.failures) && result.failures.length > 0;
  if ('failures' in expect) return same(result?.failures, expect.failures);
  if ('notes' in expect) return same(result?.notes, expect.notes);
  if ('listingHas' in expect)
    return expect.listingHas.every((l) => (result?.listing ?? []).includes(l));
  if ('exit' in expect)
    return result?.exit === expect.exit && String(result?.out).includes(expect.outHas);
  if ('onlyIds' in expect) {
    const out = String(result?.out ?? '');
    return (
      out.length > 0 &&
      !/https?:\/\//.test(out) &&
      !out.includes('fixture advisory') &&
      out
        .split('\n')
        .filter(Boolean)
        .every((l) => /^(\[check-deploy-audit\] |  |exit=)/.test(l))
    );
  }
  if ('importsNothing' in expect) {
    const code = String(result ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    return (
      code.length > 0 && !/^\s*import\s/m.test(code) && !/\brequire\s*\(|import\s*\(/.test(code)
    );
  }
  return false;
}

export type Check = { id: string; label: string; expect: Expect; run: () => any };

/** Runs a COPY of the wrapper and the module in a temp folder, with a fake npm printing `auditText`. */
function wrapped(auditText: string, lockText: string): Wrapped {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtc397-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.copyFileSync(path.join(ROOT, WRAPPER), path.join(dir, WRAPPER));
    fs.copyFileSync(path.join(ROOT, MODULE), path.join(dir, MODULE));
    fs.writeFileSync(path.join(dir, 'package-lock.json'), lockText);
    fs.writeFileSync(path.join(dir, 'audit.json'), auditText);
    fs.writeFileSync(path.join(dir, 'bin', 'npm'), '#!/bin/sh\nexec cat "$GTC397_FAKE_AUDIT"\n', {
      mode: 0o755,
    });
    const r = spawnSync(process.execPath, [path.join(dir, WRAPPER)], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(dir, 'bin')}${path.delimiter}${process.env.PATH}`,
        GTC397_FAKE_AUDIT: path.join(dir, 'audit.json'),
      },
    });
    return { exit: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function buildChecks(M: any): Check[] {
  const decide = (a: unknown, l: unknown): Decision => M.decide(a, l);
  const caseA = () =>
    decide(
      audit(vuln('follow-redirects', 'high', [FR_ARRAY], ['node_modules/follow-redirects'])),
      treeA('1.16.0')
    );
  const auditB = (nextFlagged: boolean) =>
    audit(
      pcssCopy(PCSS_HIGH),
      vuln('source-map-js', 'high', [SMJ], ['node_modules/source-map-js']),
      ...(nextFlagged ? [nextViaPostcss] : [])
    );
  const caseB = () => decide(auditB(false), treeB('1.2.1'));
  const caseBReal = () => decide(auditB(true), treeB('1.2.1'));
  const A_CHAINS = [
    'axios <- follow-redirects: GHSA-q3jh-wrc6-jgq8 high',
    'twilio <- axios <- follow-redirects: GHSA-q3jh-wrc6-jgq8 high',
  ];
  const B_CHAIN = ['next <- postcss <- source-map-js: GHSA-68fv-2mgg-jv7q high'];

  // E: the copy alone, then a second flagged copy (tailwind's) beside it.
  const auditE1 = audit(pcssCopy(PCSS_MOD, PCSS_HIGH), nextViaPostcss);
  const lockE3 = treeB(
    '1.2.2',
    { tailwindcss: '^3.4.19' },
    {
      'node_modules/tailwindcss': pkg('3.4.19', { postcss: '^8.4.47' }, { dev: true }),
      'node_modules/postcss': pkg('8.5.6', { 'source-map-js': '^1.2.1' }, { dev: true }),
    }
  );
  const auditE3 = audit(
    vuln('postcss', 'high', [PCSS_MOD, PCSS_HIGH], [BUILD_ONLY_CSS, 'node_modules/postcss']),
    nextViaPostcss,
    vuln('tailwindcss', 'high', ['postcss'], ['node_modules/tailwindcss'], true)
  );

  // F: a lint tool's chain beside a fixed twilio tree.
  const { '': _rootA, ...packagesA } = treeA('1.16.1').packages;
  const lockF = lockOf(
    { twilio: '^5.12.0' },
    {
      ...packagesA,
      'node_modules/eslint': pkg('9.39.0', { minimatch: '^3.1.2' }, { dev: true }),
      'node_modules/minimatch': pkg('3.1.5', { 'brace-expansion': '^1.1.7' }, { dev: true }),
      'node_modules/brace-expansion': pkg('1.1.12', undefined, { dev: true }),
    },
    { eslint: '^9.0.0' }
  );
  const auditF = audit(
    vuln('brace-expansion', 'high', [BRACE], ['node_modules/brace-expansion']),
    vuln('minimatch', 'high', ['brace-expansion'], ['node_modules/minimatch']),
    vuln('eslint', 'high', ['minimatch'], ['node_modules/eslint'], true)
  );

  // G: two copies of qs, one under twilio and one at the top for a dev tool.
  const lockG = (twilioQs: string, topQs: string) =>
    lockOf(
      { twilio: '^5.12.0', 'body-parser': '^1.20.0' },
      {
        'node_modules/twilio': pkg('5.12.0', { qs: '^6.14.0' }),
        'node_modules/twilio/node_modules/qs': pkg(twilioQs),
        'node_modules/body-parser': pkg('1.20.0', { qs: '6.5.2' }, { dev: true }),
        'node_modules/qs': pkg(topQs, undefined, { dev: true }),
      }
    );
  const caseG1 = () =>
    decide(
      audit(
        vuln('qs', 'high', [QS], ['node_modules/qs']),
        vuln('body-parser', 'high', ['qs'], ['node_modules/body-parser'], true)
      ),
      lockG('6.14.1', '6.5.2')
    );
  const caseG2 = () =>
    decide(
      audit(vuln('qs', 'high', [QS], ['node_modules/twilio/node_modules/qs'])),
      lockG('6.5.2', '6.14.1')
    );

  // D: a critical in a tool outside the four; a critical count with no advisory object.
  const lockD = lockOf(
    { next: '15.5.27', eslint: '^9.0.0' },
    {
      'node_modules/next': pkg('15.5.27'),
      'node_modules/eslint': pkg('9.39.0', undefined, { dev: true }),
    }
  );
  const caseD1 = () =>
    decide(audit(vuln('eslint', 'critical', [CRIT], ['node_modules/eslint'], true)), lockD);
  const caseD2 = () =>
    decide(audit(vuln('eslint', 'critical', ['espree'], ['node_modules/eslint'], true)), lockD);
  const clean = JSON.stringify(audit());
  const realLock = () => fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
  const caseAAudit = JSON.stringify(
    audit(vuln('follow-redirects', 'high', [FR_ARRAY], ['node_modules/follow-redirects']))
  );
  let d7: Wrapped | null = null;
  const runD7 = () => (d7 ??= wrapped(caseAAudit, realLock()));

  // H: GTC-359's case, axios flagged with its own advisory and twilio through it.
  const caseH1 = () =>
    decide(
      audit(
        vuln('axios', 'high', [AXIOS_OWN], ['node_modules/axios']),
        vuln('twilio', 'high', ['axios'], ['node_modules/twilio'], true)
      ),
      treeA('1.16.0')
    );

  // I: a flagged package that one of the four reaches ONLY through an optional link (I1) or ONLY
  // through a peer link (I2), marked as npm marks such copies. Nothing else depends on it.
  const LIBVIPS = '@img/sharp-libvips-linux-x64';
  const caseI1 = () =>
    decide(
      audit(vuln(LIBVIPS, 'high', [OPT], [`node_modules/${LIBVIPS}`])),
      lockOf(
        { sharp: '^0.34.5' },
        {
          'node_modules/sharp': pkg('0.34.5', undefined, {
            optionalDependencies: { [LIBVIPS]: '1.2.3' },
          }),
          [`node_modules/${LIBVIPS}`]: pkg('1.2.3', undefined, {
            optional: true,
            os: ['linux'],
            cpu: ['x64'],
          }),
        }
      )
    );
  const caseI2 = () =>
    decide(
      audit(vuln('react-dom', 'high', [PEER], ['node_modules/react-dom'])),
      lockOf(
        { next: '15.5.27' },
        {
          'node_modules/next': pkg('15.5.27', undefined, {
            peerDependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
          }),
          'node_modules/react': pkg('19.1.0', undefined, { peer: true }),
          'node_modules/react-dom': pkg('19.1.0', { scheduler: '^0.26.0' }, { peer: true }),
          'node_modules/scheduler': pkg('0.26.0', undefined, { peer: true }),
        }
      )
    );

  return [
    {
      id: 'A1',
      label: 'A1 the missed case (only follow-redirects flagged, axios and twilio not) FAILS',
      expect: { fails: true },
      run: caseA,
    },
    {
      id: 'A2',
      label:
        'A2 it names exactly the two chains, top first: axios <- follow-redirects and twilio <- axios <- follow-redirects',
      expect: { failures: A_CHAINS },
      run: caseA,
    },
    {
      id: 'B1',
      label: 'B1 next -> its postcss copy -> source-map-js, next not flagged: FAILS',
      expect: { fails: true },
      run: caseB,
    },
    {
      id: 'B2',
      label: 'B2 it names exactly next <- postcss <- source-map-js',
      expect: { failures: B_CHAIN },
      run: caseB,
    },
    {
      id: 'B3',
      label: 'B3 and the postcss copy’s own advisory is a note, not a failure',
      expect: { notes: [NOTE(PCSS_HIGH)] },
      run: caseB,
    },
    {
      id: 'B4',
      label:
        'B4 the same with next flagged through postcss, as npm really prints it: the same one failure',
      expect: { failures: B_CHAIN },
      run: caseBReal,
    },
    {
      id: 'B5',
      label: 'B5 and the same note',
      expect: { notes: [NOTE(PCSS_HIGH)] },
      run: caseBReal,
    },
    {
      id: 'C1',
      label: 'C1 tree A with follow-redirects 1.16.1 (nothing flagged) passes',
      expect: { failures: [] },
      run: () => decide(audit(), treeA('1.16.1')),
    },
    {
      id: 'C2',
      label: 'C2 tree B with source-map-js 1.2.2 fails nothing, the postcss copy still a note',
      expect: { all: [{ failures: [] }, { notes: [NOTE(PCSS_HIGH)] }] },
      run: () => decide(audit(pcssCopy(PCSS_HIGH), nextViaPostcss), treeB('1.2.2')),
    },
    {
      id: 'D1',
      label: 'D1 a critical in a tool outside the four FAILS (critical anywhere)',
      expect: { failures: ['eslint: GHSA-fx01-crit-0001 critical'] },
      run: caseD1,
    },
    {
      id: 'D2',
      label:
        'D2 a critical count with no advisory object of its own fails as "1 critical package(s)"',
      expect: { failures: ['1 critical package(s)'] },
      run: caseD2,
    },
    {
      id: 'D3',
      label: 'D3 the wrapper on an unreadable audit exits 2',
      expect: { exit: 2, outHas: 'npm audit gave no readable answer' },
      run: () => wrapped('this is not json', realLock()),
    },
    {
      id: 'D4',
      label: 'D4 the wrapper on npm’s error object exits 2 and names the code',
      expect: { exit: 2, outHas: 'npm error code: ENOAUDIT' },
      run: () => wrapped(JSON.stringify({ error: { code: 'ENOAUDIT', summary: 'x' } }), realLock()),
    },
    {
      id: 'D5',
      label: 'D5 the wrapper on an unreadable lockfile exits 2',
      expect: { exit: 2, outHas: 'package-lock.json could not be read' },
      run: () => wrapped(clean, 'this is not json'),
    },
    {
      id: 'D6',
      label: 'D6 the wrapper on a clean audit exits 0 with PASSED',
      expect: { exit: 0, outHas: '[check-deploy-audit] PASSED' },
      run: () => wrapped(clean, realLock()),
    },
    {
      id: 'D7',
      label:
        'D7 the wrapper on case A’s audit over the repo’s real lockfile exits 1 naming twilio <- axios <- follow-redirects',
      expect: {
        exit: 1,
        outHas: '  twilio <- axios <- follow-redirects: GHSA-q3jh-wrc6-jgq8 high',
      },
      run: runD7,
    },
    {
      id: 'E1',
      label: 'E1 the build-only postcss copy alone flagged fails nothing',
      expect: { failures: [] },
      run: () => decide(auditE1, treeB('1.2.2')),
    },
    {
      id: 'E2',
      label: 'E2 its advisories are notes',
      expect: { notes: [NOTE(PCSS_MOD), NOTE(PCSS_HIGH)] },
      run: () => decide(auditE1, treeB('1.2.2')),
    },
    {
      id: 'E3',
      label:
        'E3 a second flagged copy of postcss elsewhere: no exemption, the copy under next FAILS',
      expect: {
        failures: [
          'next <- postcss: GHSA-qx2v-qp2m-jg93 moderate',
          'next <- postcss: GHSA-6g55-p6wh-862q high',
        ],
      },
      run: () => decide(auditE3, lockE3),
    },
    {
      id: 'F1',
      label: 'F1 a flagged lint tool outside the four’s tree fails nothing',
      expect: { failures: [] },
      run: () => decide(auditF, lockF),
    },
    {
      id: 'F2',
      label: 'F2 it is listed with its severity and advisory id',
      expect: { listingHas: ['brace-expansion high: GHSA-qhr7-859c-m2p7 (high)', 'eslint high'] },
      run: () => decide(auditF, lockF),
    },
    {
      id: 'G1',
      label: 'G1 two copies of qs, the vulnerable one a dev tool’s and twilio’s fixed: passes',
      expect: { failures: [] },
      run: caseG1,
    },
    {
      id: 'G2',
      label: 'G2 the vulnerable copy under twilio and the fixed one at the top: FAILS twilio <- qs',
      expect: { failures: ['twilio <- qs: GHSA-fx01-qsqs-0001 high'] },
      run: caseG2,
    },
    {
      id: 'H1',
      label:
        'H1 GTC-359’s case (axios’s own advisory, twilio through it): exactly today’s two failures',
      expect: {
        failures: ['axios: GHSA-c29m-xwm3-cm6r high', 'twilio <- axios: GHSA-c29m-xwm3-cm6r high'],
      },
      run: caseH1,
    },
    {
      id: 'I1',
      label:
        'I1 sharp -> a flagged native library reached only through an OPTIONAL dependency: FAILS sharp <- @img/sharp-libvips-linux-x64',
      expect: { failures: [`sharp <- ${LIBVIPS}: GHSA-fx01-optl-0001 high`] },
      run: caseI1,
    },
    {
      id: 'I2',
      label:
        'I2 next -> a flagged react-dom reached only through a PEER dependency: FAILS next <- react-dom',
      expect: { failures: ['next <- react-dom: GHSA-fx01-peer-0001 high'] },
      run: caseI2,
    },
    {
      id: 'X1',
      label:
        'X1 every line the wrapper prints in D7 carries names, severities and advisory ids only (no URL, no title)',
      expect: { onlyIds: true },
      run: runD7,
    },
    {
      id: 'M1',
      label: 'M1 the decision module imports nothing (no file, child process or network)',
      expect: { importsNothing: true },
      run: () => fs.readFileSync(path.join(ROOT, MODULE), 'utf8'),
    },
  ];
}

async function main() {
  let passed = 0;
  let failed = 0;
  console.log('\n\x1b[1mGTC-397 — the deploy-day check follows the lockfile’s own tree\x1b[0m\n');
  let M: any = null;
  try {
    M = await import(pathToFileURL(path.join(ROOT, MODULE)).href);
  } catch (err) {
    console.log(`  (the module did not load: ${String((err as Error).message).split('\n')[0]})`);
  }
  const checks = buildChecks(M ?? { decide: () => null });
  for (const c of checks) {
    let result: any = null;
    let threw = '';
    try {
      result = c.run();
    } catch (err) {
      threw = String((err as Error).message).split('\n')[0];
    }
    const ok = !threw && judge(c.expect, result);
    if (ok) passed += 1;
    else failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${c.label}`);
    if (!ok) {
      const seen = threw
        ? `threw: ${threw}`
        : result && typeof result === 'object'
          ? JSON.stringify(
              'exit' in result
                ? { exit: result.exit, out: String(result.out).split('\n').slice(-4) }
                : { failures: result.failures, notes: result.notes }
            )
          : String(result).slice(0, 200);
      console.log(`      saw: ${seen}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) main();
