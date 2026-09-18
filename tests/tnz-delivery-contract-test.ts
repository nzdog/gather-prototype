/**
 * GTC-264 Phase 2 — the TNZ delivery-report contract.
 *
 * Run: npm run test:tnz-delivery-contract
 *
 * WHAT THIS SUITE IS FOR. GTC-264 *Isolate the wire shape* requires that the
 * assumed shape be isolated and recorded so the trial corrects ONE place, and
 * that fabricated payloads be built FROM that record "so that correcting the
 * shape breaks the tests LOUDLY rather than leaving them passing against a
 * fiction". This suite is the loudness.
 *
 * The recorded shape is docs/05_ops/tnz-delivery-status-contract-2026-09-12.md,
 * built from two artefacts saved beside it. Every value asserted below traces to
 * that record, and the record traces to the artefacts.
 *
 * ── NOTHING LEAVES THE PROCESS, AND NOTHING IS STORED ─────────────────────────
 *
 * No network, no database, no server. Phase 2 parses; Phase 3 receives and
 * Phase 3 is not built. Layer 8 asserts that absence rather than trusting it.
 *
 * ── WHY THERE IS A tsc SUBPROCESS IN LAYER 7 ──────────────────────────────────
 *
 * The fixture factory is the mechanism that makes a corrected field name break
 * the tests. That property is a TYPE property, so a runtime suite cannot observe
 * it by running code. Layer 7 therefore runs `tsc` on two generated probe files
 * — one using a misspelled field, one using the real one — and asserts the first
 * fails and the second passes. The control is the load-bearing half: without it,
 * a probe that failed for an unrelated reason would pass this test falsely.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  ENVELOPE_PROVENANCE,
  classifyEnvelope,
  parseTnzWebhookEnvelope,
  buildTnzWebhookEnvelope,
} from '../src/lib/sms/tnz-webhook-envelope';

import {
  TNZ_RESULTS,
  TNZ_MESSAGE_LEVEL_STATUS,
  canonicalTnzValue,
  interpretTnzResult,
  parseTnzDeliveryReport,
  buildTnzDeliveryEnvelope,
  buildTnzReplyEnvelope,
} from '../src/lib/sms/tnz-delivery-contract';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}

/** Runs a thunk that is expected to work once the parse exists. */
function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const ROOT = join(__dirname, '..');

/**
 * Source with doc comments removed.
 *
 * ⚠ WHY THIS EXISTS, AND IT IS THE SECOND TIME THIS PHASE. Two source-grep
 * assertions below are about what the CODE does. Written against raw source they
 * fired on the modules' own PROSE — once on the words "PHASE 2 RED STUBS", and
 * once on a `note:` string whose entire content is a prohibition against touching
 * `SmsOptOut`. Both were false positives, and the dangerous kind: each would have
 * gone green the moment the prose changed, passing for a reason unrelated to the
 * property.
 *
 * String literals are deliberately KEPT, because a foreclosed colour or an import
 * specifier would appear as one. Line comments are stripped only where `//` does
 * not follow a colon, so URLs inside strings survive.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 1: the provenance record cannot drift behind the wire type');
// ─────────────────────────────────────────────────────────────────────────────
//
// The record is the SOURCE of the field list and the type is derived from it, so
// coverage is structural rather than asserted. What is asserted here is that the
// derivation actually holds at runtime and that no field escaped a mark.

const PROVENANCE_MARKS = ['DOC-EXAMPLE', 'DOC-TABLE', 'DOC-CODES', 'MAIL', 'INFERRED', 'UNKNOWN'];

const envelopeFields = Object.keys(ENVELOPE_PROVENANCE);

assert('L1', 'the envelope has the twenty documented fields', envelopeFields.length === 20);

assert(
  'L1',
  'every documented field name is present, spelled as TNZ spells it',
  [
    'Version',
    'Sender',
    'APIKey',
    'Type',
    'Destination',
    'ContactID',
    'ReceivedID',
    'MessageID',
    'SubAccount',
    'Department',
    'JobNumber',
    'SentTimeLocal',
    'SentTimeUTC-ISO8601',
    'SentTimeUTC-RFC3339',
    'Status',
    'Result',
    'Message',
    'Price',
    'Detail',
    'URL',
  ].every((f) => envelopeFields.includes(f))
);

assert(
  'L1',
  'every field carries a provenance mark from the declared set',
  envelopeFields.every((f) =>
    PROVENANCE_MARKS.includes(
      (ENVELOPE_PROVENANCE as Record<string, { provenance: string }>)[f].provenance
    )
  )
);

assert(
  'L1',
  'every field carries a non-empty note, so a mark is never the whole record',
  envelopeFields.every(
    (f) => (ENVELOPE_PROVENANCE as Record<string, { note: string }>)[f].note.trim().length > 10
  )
);

assert(
  'L1',
  'the fixture factory produces exactly the recorded field set — no extra, none missing',
  (() => {
    const built = attempt(() => buildTnzWebhookEnvelope());
    if (!built) return false;
    const keys = Object.keys(built).sort();
    return (
      keys.length === envelopeFields.length &&
      keys.join('|') === [...envelopeFields].sort().join('|')
    );
  })()
);

// Message IS part of the shared envelope, and deliberately so. Leaving it out
// would force GTC-288 to extend the type before it could parse a reply, which is
// the first step toward the second parser the envelope ruling exists to prevent.
// The line is not "the delivery module cannot SEE Message" — it is "the delivery
// module never READS it". Layer 7 asserts the reading, not the visibility.
assert(
  'L1',
  'Message is an envelope field, recorded as present only for SMSInbound / SMSReply',
  envelopeFields.includes('Message') &&
    /SMSInbound|SMSReply/.test(
      (ENVELOPE_PROVENANCE as Record<string, { note: string }>)['Message'].note
    )
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 2: the vocabulary, as documented — counts, buckets, and the fourth');
// ─────────────────────────────────────────────────────────────────────────────

const resultKeys = Object.keys(TNZ_RESULTS);
const results = TNZ_RESULTS as Record<
  string,
  { status: string; arrival: string; bucket: string | null; webhookDelivered: boolean }
>;

assert(
  'L2',
  'seventeen documented Result values (4 Success + 13 Failed)',
  resultKeys.length === 17
);

assert(
  'L2',
  'exactly four Success results',
  resultKeys.filter((k) => results[k].status === 'SUCCESS').length === 4
);

assert(
  'L2',
  'exactly thirteen Failed results',
  resultKeys.filter((k) => results[k].status === 'FAILED').length === 13
);

assert(
  'L2',
  'four message-level statuses carrying no Result — Pending, Delayed, CreditHold, Unknown',
  (() => {
    const k = Object.keys(TNZ_MESSAGE_LEVEL_STATUS).sort();
    return (
      k.length === 4 && k.join('|') === ['CreditHold', 'Delayed', 'Pending', 'Unknown'].join('|')
    );
  })()
);

assert(
  'L2',
  'seventeen results plus four statuses is the twenty-one rows of TNZ’s table',
  resultKeys.length + Object.keys(TNZ_MESSAGE_LEVEL_STATUS).length === 21
);

assert(
  'L2',
  'the dead-channel bucket is exactly the five number-is-wrong values',
  (() => {
    const dead = resultKeys.filter((k) => results[k].bucket === 'DEAD_CHANNEL').sort();
    return (
      dead.join('|') ===
      [
        'Bad Number',
        'Invalid Mobile Number (RP-Max)',
        'Invalid Mobile Number (RP-Min)',
        'Rejected-06-Invalid Mobile Number',
        'Rejected-07-Invalid Number',
      ].join('|')
    );
  })()
);

assert(
  'L2',
  'the opted-out bucket is exactly Destination is blacklisted, and is NOT dead-channel',
  (() => {
    const opted = resultKeys.filter((k) => results[k].bucket === 'OPTED_OUT');
    return opted.length === 1 && opted[0] === 'Destination is blacklisted';
  })()
);

// THE FOURTH BUCKET. Seven values, and one of them is a message-level STATUS
// rather than a Result — so the bucket spans both tables. Asserting it only over
// TNZ_RESULTS would count six and look complete.
assert(
  'L2',
  'the fourth bucket — our-fault-not-the-guest’s — has SEVEN members across both tables',
  (() => {
    const fromResults = resultKeys.filter((k) => results[k].bucket === 'OUR_FAULT');
    const fromStatuses = Object.keys(TNZ_MESSAGE_LEVEL_STATUS).filter(
      (k) =>
        (TNZ_MESSAGE_LEVEL_STATUS as Record<string, { bucket: string | null }>)[k].bucket ===
        'OUR_FAULT'
    );
    return (
      [...fromResults, ...fromStatuses].sort().join('|') ===
      [
        'CreditHold',
        'LinkNotPermitted',
        'No Permit Record',
        'Rejected-Country Blocked-Account Policy',
        'Rejected-Duplicate',
        'Rejected-Invalid Sender ID',
        'Rejected-Message Content Issue',
      ].join('|')
    );
  })()
);

assert(
  'L2',
  'Undelivered is UNASSIGNED — the carrier gave no reason and the docs cannot bucket it',
  results['Undelivered']?.bucket === 'UNASSIGNED'
);

assert(
  'L2',
  'the four states TNZ document as NOT webhook-delivered are marked as such',
  (() => {
    const notByWebhook = [
      ...resultKeys.filter((k) => results[k].webhookDelivered === false),
      ...Object.keys(TNZ_MESSAGE_LEVEL_STATUS).filter(
        (k) =>
          (TNZ_MESSAGE_LEVEL_STATUS as Record<string, { webhookDelivered: boolean }>)[k]
            .webhookDelivered === false
      ),
    ].sort();
    return (
      notByWebhook.join('|') === ['CreditHold', 'Delayed', 'LinkNotPermitted', 'Unknown'].join('|')
    );
  })()
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 3: two of the four Success values are NOT arrivals');
// ─────────────────────────────────────────────────────────────────────────────
//
// GTC-264 Unknown 4: a positive receipt exists, but `delivered-to-network` is
// explicitly not acknowledged by the mobile and `Control Deleted` is an aborted
// send marked success to avoid retries. A boolean over Status gets this wrong.

assert(
  'L3',
  'delivered -> ARRIVED',
  attempt(() => interpretTnzResult('SUCCESS', 'delivered').arrival) === 'ARRIVED'
);

assert(
  'L3',
  'SentOK -> ARRIVED',
  attempt(() => interpretTnzResult('SUCCESS', 'SentOK').arrival) === 'ARRIVED'
);

assert(
  'L3',
  'delivered-to-network -> REACHED_NETWORK_ONLY, NOT ARRIVED',
  attempt(() => interpretTnzResult('SUCCESS', 'delivered-to-network').arrival) ===
    'REACHED_NETWORK_ONLY'
);

assert(
  'L3',
  'Control Deleted -> ABORTED_BEFORE_SEND, NOT ARRIVED',
  attempt(() => interpretTnzResult('SUCCESS', 'Control Deleted').arrival) === 'ABORTED_BEFORE_SEND'
);

assert(
  'L3',
  'exactly TWO of the four Success results arrive — asserted over the table, not the examples',
  resultKeys.filter((k) => results[k].status === 'SUCCESS' && results[k].arrival === 'ARRIVED')
    .length === 2
);

// The one that makes a Status-only boolean impossible rather than merely wrong.
assert(
  'L3',
  'a SUCCESS whose Result is unrecognised is NOT ARRIVED',
  attempt(() => interpretTnzResult('SUCCESS', 'some-value-tnz-added-later').arrival) ===
    'UNRECOGNISED_RESULT'
);

assert(
  'L3',
  'a SUCCESS with NO Result at all is NOT ARRIVED',
  attempt(() => interpretTnzResult('SUCCESS', null).arrival) === 'UNRECOGNISED_RESULT'
);

assert(
  'L3',
  'the module exports no delivered/success boolean for anyone to reach for',
  (() => {
    const src = codeOnly(readFileSync(join(ROOT, 'src/lib/sms/tnz-delivery-contract.ts'), 'utf-8'));
    return !/\b(isDelivered|wasDelivered|isSuccess|hasArrived|delivered\s*:\s*boolean)\b/.test(src);
  })()
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 4: an unknown Result is recorded, never rejected');
// ─────────────────────────────────────────────────────────────────────────────

assert(
  'L4',
  'an unrecognised Result still parses successfully',
  attempt(() => {
    const r = parseTnzDeliveryReport(
      buildTnzDeliveryEnvelope({ Result: 'Rejected-99-Something New', Status: 'FAILED' })
    );
    return r.ok === true;
  }) === true
);

assert(
  'L4',
  'an unrecognised Result is preserved VERBATIM, not normalised or dropped',
  attempt(() => {
    const r = parseTnzDeliveryReport(
      buildTnzDeliveryEnvelope({ Result: 'Rejected-99-Something New', Status: 'FAILED' })
    );
    return r.ok ? r.report.result : null;
  }) === 'Rejected-99-Something New'
);

assert(
  'L4',
  'an unrecognised Result yields no bucket rather than a guessed one',
  attempt(() => {
    const r = parseTnzDeliveryReport(
      buildTnzDeliveryEnvelope({ Result: 'Rejected-99-Something New', Status: 'FAILED' })
    );
    return r.ok ? r.report.failureBucket : 'x';
  }) === null
);

assert(
  'L4',
  'and it is flagged as unrecognised, so a reader can find what the trial added',
  attempt(() => {
    const r = parseTnzDeliveryReport(
      buildTnzDeliveryEnvelope({ Result: 'Rejected-99-Something New', Status: 'FAILED' })
    );
    return r.ok ? r.report.recognisedResult : true;
  }) === false
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 5: PENDING is non-terminal and is not relied upon');
// ─────────────────────────────────────────────────────────────────────────────

assert(
  'L5',
  'PENDING parses, and is IN_FLIGHT rather than an outcome',
  attempt(() => interpretTnzResult('PENDING', '').arrival) === 'IN_FLIGHT'
);

assert(
  'L5',
  'PENDING is NOT terminal',
  attempt(() => interpretTnzResult('PENDING', '').terminal) === false
);

assert(
  'L5',
  'SUCCESS and FAILED are terminal',
  attempt(() => interpretTnzResult('SUCCESS', 'delivered').terminal) === true &&
    attempt(() => interpretTnzResult('FAILED', 'Bad Number').terminal) === true
);

assert(
  'L5',
  'an unrecognised Status is neither terminal nor an outcome',
  attempt(() => interpretTnzResult('WAT', null).terminal) === false &&
    attempt(() => interpretTnzResult('WAT', null).statusClass) === 'UNRECOGNISED'
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 6: the documented discrepancies, handled where the parse meets them');
// ─────────────────────────────────────────────────────────────────────────────

assert(
  'L6',
  'no two documented values collapse to the same canonical key',
  (() => {
    const all = [...resultKeys, ...Object.keys(TNZ_MESSAGE_LEVEL_STATUS)];
    const keys = attempt(() => all.map((v) => canonicalTnzValue(v)));
    return !!keys && new Set(keys).size === all.length;
  })()
);

assert(
  'L6',
  '"Sent OK" (API page) and "SentOK" (codes page) resolve to the same entry',
  attempt(() => interpretTnzResult('SUCCESS', 'Sent OK').arrival) === 'ARRIVED' &&
    attempt(() => interpretTnzResult('SUCCESS', 'SentOK').arrival) === 'ARRIVED'
);

assert(
  'L6',
  'Status case is compared insensitively — SUCCESS, Success and success agree',
  ['SUCCESS', 'Success', 'success'].every(
    (s) => attempt(() => interpretTnzResult(s, 'delivered').statusClass) === 'SUCCESS'
  )
);

assert(
  'L6',
  'Result case and separators are compared insensitively too',
  ['Destination is blacklisted', 'DESTINATION IS BLACKLISTED', 'destination-is-blacklisted'].every(
    (r) => attempt(() => interpretTnzResult('FAILED', r).failureBucket) === 'OPTED_OUT'
  )
);

assert(
  'L6',
  'providerSentAt is read from SentTimeUTC-RFC3339',
  attempt(() => {
    const r = parseTnzDeliveryReport(
      buildTnzDeliveryEnvelope({ 'SentTimeUTC-RFC3339': '2025-06-03T21:16:55.000Z' })
    );
    return r.ok ? r.report.providerSentAt?.toISOString() : null;
  }) === '2025-06-03T21:16:55.000Z'
);

// The two fields TNZ describe as ISO 8601 whose examples are not ISO 8601.
// A parser that fell back to them would invent a timezone.
assert(
  'L6',
  'with RFC3339 absent, providerSentAt is null — the mis-described fields are NOT a fallback',
  attempt(() => {
    const r = parseTnzDeliveryReport(
      buildTnzDeliveryEnvelope({
        'SentTimeUTC-RFC3339': '',
        SentTimeLocal: '2025-06-04 09:16:55',
        'SentTimeUTC-ISO8601': '2025-06-03 21:16:55',
      })
    );
    return r.ok ? r.report.providerSentAt : 'x';
  }) === null
);

assert(
  'L6',
  'an unparseable RFC3339 yields null, never an Invalid Date',
  attempt(() => {
    const r = parseTnzDeliveryReport(
      buildTnzDeliveryEnvelope({ 'SentTimeUTC-RFC3339': 'not-a-date' })
    );
    return r.ok ? r.report.providerSentAt : 'x';
  }) === null
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 7: the envelope, the Type switch, and the line against GTC-288');
// ─────────────────────────────────────────────────────────────────────────────

assert(
  'L7',
  'a Type=SMS envelope classifies as a delivery status report',
  attempt(() => classifyEnvelope(buildTnzDeliveryEnvelope())) === 'DELIVERY_STATUS'
);

assert(
  'L7',
  'a Type=SMSReply envelope classifies as an inbound message',
  attempt(() => classifyEnvelope(buildTnzReplyEnvelope())) === 'INBOUND_MESSAGE'
);

assert(
  'L7',
  'Type=SMSInbound is an inbound message too',
  attempt(() => classifyEnvelope(buildTnzReplyEnvelope({ Type: 'SMSInbound' }))) ===
    'INBOUND_MESSAGE'
);

assert(
  'L7',
  'Type=Email is another message type, not a failure to parse',
  attempt(() => classifyEnvelope(buildTnzDeliveryEnvelope({ Type: 'Email' }))) ===
    'OTHER_MESSAGE_TYPE'
);

assert(
  'L7',
  'a missing Type is UNCLASSIFIED rather than assumed to be ours',
  attempt(() => classifyEnvelope(buildTnzDeliveryEnvelope({ Type: '' }))) === 'UNCLASSIFIED'
);

// THE LINE. A reply is refused by the delivery interpreter, and the refusal
// carries the KIND so Phase 3 can route it — but carries nothing of the message.
assert(
  'L7',
  'the delivery interpreter REFUSES a reply rather than interpreting it',
  attempt(() => {
    const r = parseTnzDeliveryReport(buildTnzReplyEnvelope());
    return r.ok === false && r.failure.reason === 'NOT_A_DELIVERY_REPORT';
  }) === true
);

assert(
  'L7',
  'the refusal names the kind, so Phase 3 can hand it to GTC-288 rather than drop it',
  attempt(() => {
    const r = parseTnzDeliveryReport(buildTnzReplyEnvelope());
    return !r.ok ? r.failure.envelopeKind : undefined;
  }) === 'INBOUND_MESSAGE'
);

assert(
  'L7',
  'the refusal carries NO reply text — this module never reads Message',
  attempt(() => {
    const r = parseTnzDeliveryReport(buildTnzReplyEnvelope({ Message: 'STOP please remove me' }));
    return !r.ok && !JSON.stringify(r.failure).includes('STOP please remove me');
  }) === true
);

assert(
  'L7',
  'a parsed delivery report has no message or body field for a reply to leak into',
  attempt(() => {
    const r = parseTnzDeliveryReport(buildTnzDeliveryEnvelope());
    if (!r.ok) return false;
    return !Object.keys(r.report).some((k) => /^(message|body|text)$/i.test(k));
  }) === true
);

assert(
  'L7',
  'the delivery module contains no reply vocabulary — it recognises SMSReply and stops',
  (() => {
    const src = codeOnly(readFileSync(join(ROOT, 'src/lib/sms/tnz-delivery-contract.ts'), 'utf-8'));
    // Written first as "the name SmsOptOut does not appear", which failed on a
    // `note:` string that exists to FORBID touching it. Naming a prohibition is
    // the opposite of the defect. So what is matched is USE, in code: reaching for
    // the reply body by property access, or importing the opt-out machinery.
    return !/\.Message\b|\[['"]Message['"]\]|from '\.\/opt-out|OPT_OUT_KEYWORDS/.test(src);
  })()
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 8: malformed input, and what this phase must NOT do');
// ─────────────────────────────────────────────────────────────────────────────

for (const [label, input] of [
  ['null', null],
  ['a string', 'not an object'],
  ['an array', [{ Type: 'SMS' }]],
  ['a number', 7],
] as Array<[string, unknown]>) {
  assert(
    'L8',
    `${label} is refused as NOT_JSON_OBJECT, without throwing`,
    attempt(() => {
      const r = parseTnzWebhookEnvelope(input);
      return !r.ok && r.failure.reason === 'NOT_JSON_OBJECT';
    }) === true
  );
}

assert(
  'L8',
  'a missing MessageID is a named failure — the join key is not optional',
  attempt(() => {
    const r = parseTnzDeliveryReport(buildTnzDeliveryEnvelope({ MessageID: '' }));
    return (
      !r.ok && r.failure.reason === 'MISSING_REQUIRED_FIELD' && /MessageID/.test(r.failure.detail)
    );
  }) === true
);

assert(
  'L8',
  'a non-string value in a REQUIRED field is a named failure, not a silent coercion',
  attempt(() => {
    const r = parseTnzDeliveryReport({ ...buildTnzDeliveryEnvelope(), MessageID: 12345 });
    return !r.ok && r.failure.reason === 'WRONG_FIELD_TYPE' && /MessageID/.test(r.failure.detail);
  }) === true
);

assert(
  'L8',
  'a non-string value in an OPTIONAL field is dropped and WARNED, not fatal',
  attempt(() => {
    const r = parseTnzDeliveryReport({ ...buildTnzDeliveryEnvelope(), Price: 0.1 });
    return r.ok && r.report.warnings.some((w) => /Price/.test(w));
  }) === true
);

assert(
  'L8',
  'a Type=SMS envelope carrying a populated ReceivedID is warned — docs say always blank',
  attempt(() => {
    const r = parseTnzDeliveryReport(buildTnzDeliveryEnvelope({ ReceivedID: 'abc' }));
    return r.ok && r.report.warnings.some((w) => /ReceivedID/.test(w));
  }) === true
);

assert(
  'L8',
  'unknown extra fields are tolerated — TNZ may add one and it is not our business',
  attempt(() => {
    const r = parseTnzDeliveryReport({ ...buildTnzDeliveryEnvelope(), SomethingNew: 'x' });
    return r.ok === true;
  }) === true
);

// Phase discipline, asserted rather than promised.
for (const rel of ['src/lib/sms/tnz-webhook-envelope.ts', 'src/lib/sms/tnz-delivery-contract.ts']) {
  const src = readFileSync(join(ROOT, rel), 'utf-8');
  assert('L8', `${rel} touches no database`, !/@prisma\/client|PrismaClient|\bprisma\./.test(src));
  assert(
    'L8',
    `${rel} touches no network`,
    !/\bfetch\(|node-fetch|axios|https?:\/\/api\./.test(src)
  );
  assert('L8', `${rel} imports nothing from next`, !/from 'next/.test(src));
  // ⚠ This assertion was written as /\b(RED|AMBER|GREEN|colour)\b/ and the RED run
  // caught it firing on this phase's own "PHASE 2 RED STUBS" comments. Left that
  // way it would have gone green the moment those comments were deleted — passing
  // for the wrong reason, and silently re-breaking on any future comment using the
  // word. What must be absent is GLANCE COLOUR VOCABULARY, so that is what is
  // matched: the symbols GTC-192 owns, and the colour names as literals.
  assert(
    'L8',
    `${rel} forecloses no colour — GTC-192 rules those`,
    !/RED_REASONS|derivePersonState|GlanceState|['"](RED|AMBER|GREEN)['"]/.test(codeOnly(src))
  );
}

assert(
  'L8',
  'no route was built in this phase',
  !attempt(() => readFileSync(join(ROOT, 'src/app/api/sms/delivery-status/route.ts'), 'utf-8'))
);

assert(
  'L8',
  'no auth helper was built in this phase',
  !attempt(() => readFileSync(join(ROOT, 'src/app/api/sms/tnz-callback-auth.ts'), 'utf-8'))
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer 9: the fixture factory really does fail typecheck on a rename');
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the mechanism GTC-264 requires. Two probes, and the CONTROL is the
// load-bearing half: a probe that failed for an unrelated reason would pass the
// negative test falsely.

const TSC_FLAGS = [
  '--noEmit',
  '--strict',
  '--skipLibCheck',
  '--target',
  'ES2020',
  '--module',
  'ESNext',
  '--moduleResolution',
  'bundler',
];

function tscProbe(body: string): { ok: boolean; output: string } {
  const file = join(ROOT, 'tests', `.tnz-probe-${Math.random().toString(36).slice(2)}.ts`);
  writeFileSync(file, body, 'utf-8');
  try {
    execFileSync('npx', ['tsc', ...TSC_FLAGS, file], { cwd: ROOT, stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  } finally {
    try {
      unlinkSync(file);
    } catch {
      /* nothing to clean */
    }
  }
}

const CONTROL_PROBE = `
import { buildTnzDeliveryEnvelope } from '../src/lib/sms/tnz-delivery-contract';
export const good = buildTnzDeliveryEnvelope({ MessageID: 'abc' });
`;

const RENAME_PROBE = `
import { buildTnzDeliveryEnvelope } from '../src/lib/sms/tnz-delivery-contract';
// MessageIDD is not a field of the recorded wire type. This MUST NOT typecheck.
export const bad = buildTnzDeliveryEnvelope({ MessageIDD: 'abc' });
`;

const control = tscProbe(CONTROL_PROBE);
assert('L9', 'CONTROL: an override naming a real field typechecks', control.ok);
if (!control.ok) console.error(`    control output:\n${control.output}`);

const renamed = tscProbe(RENAME_PROBE);
assert('L9', 'an override naming a field that does not exist FAILS typecheck', !renamed.ok);
assert(
  'L9',
  'and the failure names the offending key, so the correction is findable',
  !renamed.ok && /MessageIDD/.test(renamed.output)
);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m');
console.log(`Total tests: ${passed + failed}`);
console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
if (failed > 0) {
  console.log('\n\x1b[31mRED:\x1b[0m');
  redAssertions.forEach((a) => console.log(`  ${a}`));
}
process.exit(failed > 0 ? 1 : 0);
