/**
 * [[GTC-413]] — QS 6.16.1, AND THE SAME TEXT FOR STRIPE AND TWILIO.
 *
 *   npm run test:qs-same-text
 *
 * The deploy-day check failed on qs 6.16.0 (twilio <- qs, GHSA-6pq8-jhm2-2vcw, moderate). The
 * founder ruled (28 Oct 2026) a lockfile-only move to exactly 6.16.1, the named fix. This suite
 * pins the move and shows it changes nothing Gather sends.
 *
 *   Q1 (a) node_modules/qs says 6.16.1, and so does the lockfile's one qs entry.
 *   Q2 (b) qs.stringify, with the exact options the installed Stripe (arrayFormat indices, its
 *      date rule, brackets put back) and Twilio (arrayFormat repeat) use, turns hand-written
 *      sample data (nested metadata, spaces, &, +, macron letters, an emoji, a newline, an empty
 *      value, an array of strings) into the same text 6.16.0 gave, written here by hand.
 *   Q3 (c) the advisory's crash case does not throw: arrayFormat comma over an array holding an
 *      object with no callable toString (Object.create(null)), with and without encodeValuesOnly.
 *   Q4 (d) the repo's own deploy-check decision (scripts/lib/deploy-audit-decide.mjs, unchanged),
 *      run on the real lockfile and an audit answer shaped like npm's of 28 Oct 2026, no longer
 *      fails on qs. The answer flags qs only if the lockfile's qs is inside the advisory's range
 *      (>=6.7.0 <=6.16.0), as npm does. CONTROL inside: with qs flagged, the same decision on the
 *      same lockfile fails with "twilio <- qs", so the walk does reach qs.
 *
 * No database, no dev server, no network, no provider. Every expectation is hand-written.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    reds.push(label);
    console.log(`\x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── The fix, as named by the advisory ────────────────────────────────────────
const QS_FIXED = '6.16.1';
const QS_NODE = 'node_modules/qs';
const ADVISORY = 'GHSA-6pq8-jhm2-2vcw';

// ── The sample data and the text 6.16.0 gave for it (recorded 28 Oct 2026) ─────
const STRIPE_SAMPLE = {
  mode: 'payment',
  customer_email: 'Sarah+gather@example.com',
  success_url: 'https://gather.example/plan/new?session_id={CHECKOUT_SESSION_ID}&x=1',
  metadata: {
    eventName: 'Kirihimete at Māori Bay & friends',
    note: 'line one\nline two',
    plus: '1+1=2',
    empty: '',
    emoji: 'Feast \u{1F357}',
  },
  line_items: [{ price: 'price_gtc413_sample', quantity: 1 }],
  payment_method_types: ['card', 'link'],
  expires_at: new Date('2026-12-24T11:00:00.000Z'),
};
const STRIPE_TEXT =
  'mode=payment&customer_email=Sarah%2Bgather%40example.com' +
  '&success_url=https%3A%2F%2Fgather.example%2Fplan%2Fnew%3Fsession_id%3D%7BCHECKOUT_SESSION_ID%7D%26x%3D1' +
  '&metadata[eventName]=Kirihimete%20at%20M%C4%81ori%20Bay%20%26%20friends' +
  '&metadata[note]=line%20one%0Aline%20two' +
  '&metadata[plus]=1%2B1%3D2' +
  '&metadata[empty]=' +
  '&metadata[emoji]=Feast%20%F0%9F%8D%97' +
  '&line_items[0][price]=price_gtc413_sample&line_items[0][quantity]=1' +
  '&payment_method_types[0]=card&payment_method_types[1]=link' +
  '&expires_at=1798110000';
const TWILIO_SAMPLE = {
  To: '+64210000001',
  From: '+64210000002',
  Body: 'Kia ora Ātea & whānau!\nBring 2+ plates \u{1F370}',
  StatusCallback: 'https://gather.example/api/sms/status?a=1&b=two words',
  MediaUrl: ['https://gather.example/a.png', 'https://gather.example/b c.png'],
  ProvideFeedback: '',
};
const TWILIO_TEXT =
  'To=%2B64210000001&From=%2B64210000002' +
  '&Body=Kia%20ora%20%C4%80tea%20%26%20wh%C4%81nau%21%0ABring%202%2B%20plates%20%F0%9F%8D%B0' +
  '&StatusCallback=https%3A%2F%2Fgather.example%2Fapi%2Fsms%2Fstatus%3Fa%3D1%26b%3Dtwo%20words' +
  '&MediaUrl=https%3A%2F%2Fgather.example%2Fa.png' +
  '&MediaUrl=https%3A%2F%2Fgather.example%2Fb%20c.png' +
  '&ProvideFeedback=';

// ── An audit answer shaped like npm's of 28 Oct 2026 (names, nodes, ids, severities) ──
type Severity = 'low' | 'moderate' | 'high' | 'critical';
const adv = (name: string, ghsa: string, severity: Severity, range: string) => ({
  source: 1,
  name,
  dependency: name,
  title: `advisory ${ghsa}`,
  url: `https://github.com/advisories/${ghsa}`,
  severity,
  cwe: [],
  cvss: { score: 0, vectorString: null },
  range,
});
const vuln = (name: string, severity: Severity, via: unknown[], nodes: string[]) => ({
  name,
  severity,
  isDirect: false,
  via,
  effects: [],
  range: '*',
  nodes,
  fixAvailable: true,
});
const QS_VULN = vuln(
  'qs',
  'moderate',
  [adv('qs', ADVISORY, 'moderate', '>=6.7.0 <=6.16.0')],
  [QS_NODE]
);
const OTHERS = [
  vuln('@prisma/config', 'high', ['deepmerge-ts'], ['node_modules/@prisma/config']),
  vuln(
    'brace-expansion',
    'high',
    [
      adv('brace-expansion', 'GHSA-q2hr-2g5m-vwhr', 'moderate', '<1.1.21'),
      adv('brace-expansion', 'GHSA-qhr7-859c-m2p7', 'high', '<1.1.20'),
      adv('brace-expansion', 'GHSA-6j4f-fj2g-mc7p', 'high', '<1.1.19'),
    ],
    [
      'node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion',
      'node_modules/brace-expansion',
    ]
  ),
  vuln(
    'deepmerge-ts',
    'high',
    [adv('deepmerge-ts', 'GHSA-ggr8-5vv4-36mx', 'high', '<8.0.0')],
    ['node_modules/deepmerge-ts']
  ),
  vuln('next', 'moderate', ['postcss'], ['node_modules/next']),
  vuln(
    'postcss',
    'high',
    [
      adv('postcss', 'GHSA-qx2v-qp2m-jg93', 'moderate', '<8.5.10'),
      adv('postcss', 'GHSA-6g55-p6wh-862q', 'high', '<=8.5.11'),
      adv('postcss', 'GHSA-fxqj-rqcc-2cmp', 'moderate', '<=8.5.22'),
      adv('postcss', 'GHSA-r28c-9q8g-f849', 'high', '<=8.5.17'),
    ],
    ['node_modules/next/node_modules/postcss']
  ),
  vuln(
    'postcss-selector-parser',
    'moderate',
    [adv('postcss-selector-parser', 'GHSA-rj75-hqrm-r3gf', 'moderate', '<6.1.5')],
    ['node_modules/postcss-selector-parser']
  ),
  vuln('prisma', 'high', ['@prisma/config'], ['node_modules/prisma']),
  vuln('zod', 'high', [adv('zod', 'GHSA-mrhx-c7xc-m3w5', 'high', '<4.6.6')], ['node_modules/zod']),
];
const answerOf = (vulns: ReturnType<typeof vuln>[]) => {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const v of vulns) {
    counts[v.severity] += 1;
    counts.total += 1;
  }
  return {
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(vulns.map((v) => [v.name, v])),
    metadata: { vulnerabilities: counts },
  };
};
/** x.y.z as three numbers; anything else is NaN and never in range. */
const parts = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : [NaN]);
const cmp = (a: string, b: string) => {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? NaN) - (y[i] ?? NaN);
  return 0;
};
/** As npm flags it: qs only when the lockfile's copy is inside >=6.7.0 <=6.16.0. */
const qsInRange = (v: string) => cmp(v, '6.7.0') >= 0 && cmp(v, '6.16.0') <= 0;

async function main() {
  // ── Q1 (a) ──
  let installed = '';
  try {
    installed = JSON.parse(read('node_modules/qs/package.json')).version;
  } catch {
    installed = '';
  }
  let lock: any = null;
  try {
    lock = JSON.parse(read('package-lock.json'));
  } catch {
    lock = null;
  }
  const entry = lock?.packages?.[QS_NODE];
  const qsCopies = Object.keys(lock?.packages ?? {}).filter((k) =>
    /(^|\/)node_modules\/qs$/.test(k)
  );
  assert(
    'Q1 node_modules/qs says 6.16.1, and the lockfile has one qs entry, which says 6.16.1 (its tarball too)',
    installed === QS_FIXED &&
      qsCopies.length === 1 &&
      entry?.version === QS_FIXED &&
      entry?.resolved === 'https://registry.npmjs.org/qs/-/qs-6.16.1.tgz',
    `installed ${installed || 'none'}; lockfile copies ${qsCopies.join(', ')}; entry ${entry?.version}`
  );

  // ── Q2 (b) ──
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const qs = require(path.join(ROOT, 'node_modules', 'qs'));
  const stripeStyle = (data: object) =>
    qs
      .stringify(data, {
        serializeDate: (d: Date) => Math.floor(d.getTime() / 1000).toString(),
        arrayFormat: 'indices',
      })
      .replace(/%5B/g, '[')
      .replace(/%5D/g, ']');
  const twilioStyle = (data: object) => qs.stringify(data, { arrayFormat: 'repeat' });
  let stripeOut = '';
  let twilioOut = '';
  try {
    stripeOut = stripeStyle(STRIPE_SAMPLE);
    twilioOut = twilioStyle(TWILIO_SAMPLE);
  } catch (e) {
    stripeOut = `threw ${e instanceof Error ? e.message : String(e)}`;
  }
  // The installed libraries still call qs with these options, so the sample asks their question.
  const stripeLib = read('node_modules/stripe/cjs/utils.js');
  const twilioLib = read('node_modules/twilio/lib/base/RequestClient.js');
  const optionsAsUsed =
    /arrayFormat:\s*'indices'/.test(stripeLib) &&
    /serializeDate:\s*\(d\)\s*=>\s*Math\.floor\(d\.getTime\(\)\s*\/\s*1000\)\.toString\(\)/.test(
      stripeLib
    ) &&
    /\.replace\(\/%5B\/g,\s*'\['\)\s*\.replace\(\/%5D\/g,\s*'\]'\)/.test(stripeLib) &&
    (twilioLib.match(/stringify\([^)]*\{\s*arrayFormat:\s*"repeat"\s*\}\)/g) ?? []).length === 2;
  assert(
    'Q2 Stripe’s and Twilio’s qs options turn the sample data into the same text 6.16.0 gave (written here by hand), and the installed libraries still use those options',
    stripeOut === STRIPE_TEXT && twilioOut === TWILIO_TEXT && optionsAsUsed,
    `stripe same ${stripeOut === STRIPE_TEXT}; twilio same ${twilioOut === TWILIO_TEXT}; ` +
      `options as used ${optionsAsUsed}`
  );

  // ── Q3 (c) ──
  const crash = (opts: object) => {
    try {
      const out = qs.stringify({ a: [Object.create(null)] }, opts);
      return typeof out === 'string' ? 'ok' : 'not a string';
    } catch (e) {
      return `threw ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  const plain = crash({ arrayFormat: 'comma' });
  const valuesOnly = crash({ arrayFormat: 'comma', encodeValuesOnly: true });
  assert(
    'Q3 the advisory’s crash case does not throw: arrayFormat comma over an object with no callable toString, with and without encodeValuesOnly',
    plain === 'ok' && valuesOnly === 'ok',
    `comma: ${plain}; comma + encodeValuesOnly: ${valuesOnly}`
  );

  // ── Q4 (d) ──
  let M: any = null;
  try {
    M = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/deploy-audit-decide.mjs')).href);
  } catch {
    M = null;
  }
  const lockVersion = String(entry?.version ?? '');
  const today = answerOf(qsInRange(lockVersion) ? [...OTHERS, QS_VULN] : OTHERS);
  const flagged = answerOf([...OTHERS, QS_VULN]);
  const decided = M && lock ? M.decide(today, lock) : null;
  const control = M && lock ? M.decide(flagged, lock) : null;
  const qsFailures = (decided?.failures ?? []).filter((f: string) => /\bqs\b/.test(f));
  assert(
    'Q4 the deploy check’s own decision, on the real lockfile and an answer shaped like today’s, fails on nothing (qs no longer flagged); CONTROL: with qs flagged it fails "twilio <- qs: GHSA-6pq8-jhm2-2vcw moderate"',
    !!decided &&
      M.auditReadable(today) &&
      M.lockfileReadable(lock) &&
      qsFailures.length === 0 &&
      decided.failures.length === 0 &&
      !!control &&
      control.failures.includes(`twilio <- qs: ${ADVISORY} moderate`),
    `qs ${lockVersion}; failures ${JSON.stringify(decided?.failures ?? null)}; ` +
      `control ${JSON.stringify(control?.failures ?? null)}`
  );
}

main()
  .catch((err) => {
    failed++;
    reds.push('suite crashed');
    console.error('\x1b[31mSuite crashed:\x1b[0m', err);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log('RED:');
      for (const r of reds) console.log(`  ${r}`);
    }
    process.exit(failed > 0 ? 1 : 0);
  });
