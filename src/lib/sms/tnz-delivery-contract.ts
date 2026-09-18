/**
 * GTC-264 — the DELIVERY interpreter, and the delivery vocabulary.
 *
 * The shared envelope is ./tnz-webhook-envelope.ts. This file is the second third
 * of the structure that file describes: it takes an envelope already classified as
 * a delivery status report and produces Gather's shape. The third part — the reply
 * interpreter — is GTC-288's and is not here.
 *
 * ⚠ WHERE THE LINE IS, AND WHY IT IS DRAWN THIS WAY.
 *
 * The line is NOT "this module cannot see a reply's fields". `Message` is part of
 * the shared envelope type deliberately: leaving it out would force GTC-288 to
 * extend the type before it could parse a reply, and that is the first step back
 * toward the second parser the envelope ruling exists to prevent.
 *
 * The line is "this module never READS a reply". It recognises that `Type` is not
 * `SMS`, refuses, and names the kind so its caller can route the envelope onward.
 * It does not read `Message`, does not look for opt-out keywords, and does not
 * touch SmsOptOut — that table is Do-Not-Touch Zone 7 and its writer is GTC-288.
 * A reply refusal carries the KIND and none of the content.
 *
 * ── WHAT MUST NOT BE GOT WRONG FROM THIS MODULE'S SHAPE ───────────────────────
 *
 * 1. STATUS DOES NOT MEAN DELIVERY. Two of the four documented `Success` values
 *    are not arrivals: `delivered-to-network` is explicitly "not acknowledged by
 *    the mobile (mobile off or out of coverage)", and `Control Deleted` is an
 *    aborted send "marked as success for reporting purposes and to avoid retries".
 *    So there is NO exported boolean called delivered/success anywhere here, and
 *    `interpretTnzResult` requires the Result in order to reach a verdict. A
 *    SUCCESS whose Result is absent or unrecognised is UNRECOGNISED_RESULT, never
 *    ARRIVED. Getting this wrong should require deleting code, not forgetting it.
 *
 * 2. THE BUCKETS ARE NOT COLOURS. GTC-192 rules what the glance shows. This file
 *    contains no colour vocabulary and must not gain any. It classifies a failure
 *    into one of four buckets and stops.
 *
 * 3. AN UNKNOWN RESULT IS RECORDED, NEVER REJECTED. Seventeen documented values is
 *    not a closed set — they are documented, not observed. An unrecognised Result
 *    parses, is preserved verbatim, gets no bucket, and is flagged.
 *
 * 4. PENDING IS NON-TERMINAL AND IS NOT RELIED UPON. TNZ's API page lists PENDING
 *    among the webhook Status values; their result-codes page lists Pending's
 *    channels as Dashboard and GET Poll only, with no webhook. One of the two is
 *    wrong. Handled if it arrives; never assumed to.
 *
 * ── THE CASE AND SPELLING DISCREPANCIES, HANDLED HERE ─────────────────────────
 *
 * TNZ's two pages disagree with each other in three ways that reach the parse, so
 * every documented value is matched on a canonical key rather than literally. See
 * `canonicalTnzValue`.
 *
 * The recorded contract is docs/05_ops/tnz-delivery-status-contract-2026-09-12.md.
 * Correct that and this file together; nothing downstream should need touching.
 */

import {
  buildTnzWebhookEnvelope,
  parseTnzWebhookEnvelope,
  type Provenance,
  type TnzEnvelopeField,
  type TnzParseFailure,
  type TnzWebhookEnvelope,
} from './tnz-webhook-envelope';

/** Which documented `Status` family a value belongs to. */
export type TnzStatusClass =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'RECEIVED'
  | 'UPDATED'
  | 'UNRECOGNISED';

/**
 * What actually happened to the message, derived from `Result` and never from
 * `Status` alone.
 */
export type TnzArrival =
  /** The mobile received it. `delivered` and `SentOK` only. */
  | 'ARRIVED'
  /** The carrier took it and the mobile never acknowledged it. A Success. */
  | 'REACHED_NETWORK_ONLY'
  /** The send was cancelled before delivery. Also a Success. */
  | 'ABORTED_BEFORE_SEND'
  /** A documented failure. */
  | 'DID_NOT_ARRIVE'
  /** Still processing. Not an outcome. */
  | 'IN_FLIGHT'
  /** TNZ sent a Result (or a Status) outside the documented set. */
  | 'UNRECOGNISED_RESULT';

/**
 * How a failure should be understood. ⚠ NOT a colour — GTC-192 owns those.
 *
 * OUR_FAULT is the fourth bucket, added by founder ruling 2026-09-12 after the
 * documented vocabulary was read. GTC-264 had anticipated three. Its seven members
 * matter because §7's bounce door offers "ring him, ask his mum, fix the number",
 * and for every one of them nothing about the guest is wrong — the number is fine,
 * the guest is reachable, and the fault is ours or TNZ's. Sending Kate to fix a
 * number over an account out of credit is worse than silence.
 */
export type TnzFailureBucket =
  /** §7's bounce. The number cannot receive, and no retry helps. */
  | 'DEAD_CHANNEL'
  /** A live number whose owner said stop. Explicitly NOT a §7 bounce. */
  | 'OPTED_OUT'
  /** Nothing about the guest is wrong. Ours or TNZ's to fix. */
  | 'OUR_FAULT'
  /** The carrier gave no reason. Cannot be assigned without real traffic. */
  | 'UNASSIGNED';

export interface TnzResultRow {
  readonly status: Extract<TnzStatusClass, 'SUCCESS' | 'FAILED'>;
  readonly arrival: TnzArrival;
  readonly bucket: TnzFailureBucket | null;
  /** TNZ's own "Chargeable?" column. Recorded because it is evidence, not billing. */
  readonly chargeable: boolean;
  /** False where TNZ's channel list omits Webhook. See GTC-290. */
  readonly webhookDelivered: boolean;
  readonly provenance: Provenance;
  readonly note: string;
}

/**
 * TNZ's seventeen documented SMS `Result` values.
 *
 * Verbatim from https://help.tnz.co.nz/help/sms-delivery-result-codes, saved as
 * docs/05_ops/tnz-sms-delivery-result-codes-2026-09-12.html. Keys are TNZ's
 * spelling; matching is by canonical key, so callers need not reproduce it.
 *
 * ⚠ DOCUMENTED IS NOT OBSERVED. Nothing here has been seen on a real webhook.
 */
export const TNZ_RESULTS = {
  // ── Status Success. Only the first two are arrivals. ───────────────────────
  delivered: {
    status: 'SUCCESS',
    arrival: 'ARRIVED',
    bucket: null,
    chargeable: true,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: 'SMS received successfully by the mobile phone.',
  },
  SentOK: {
    status: 'SUCCESS',
    arrival: 'ARRIVED',
    bucket: null,
    chargeable: true,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: 'SMS received successfully by the mobile phone. ⚠ TNZ\'s API page spells this "Sent OK" with a space; the codes page spells it "SentOK". One is wrong and we do not know which, so the canonical key matches both.',
  },
  'delivered-to-network': {
    status: 'SUCCESS',
    arrival: 'REACHED_NETWORK_ONLY',
    bucket: null,
    chargeable: true,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '⚠ A SUCCESS THAT IS NOT AN ARRIVAL. "received successfully by the mobile\'s network/carrier but not acknowledged by the mobile (mobile off or out of coverage)". Colouring this as delivered tells the host it arrived when nobody knows that.',
  },
  'Control Deleted': {
    status: 'SUCCESS',
    arrival: 'ABORTED_BEFORE_SEND',
    bucket: null,
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '⚠ A SUCCESS THAT IS NOT AN ARRIVAL. "SMS sending was aborted by a user (marked as success for reporting purposes and to avoid retries)".',
  },

  // ── Status Failed. ─────────────────────────────────────────────────────────
  Undelivered: {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'UNASSIGNED',
    chargeable: true,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"submitted to the mobile carrier and they have responded advising the message failed to send (no defined error reason)". ⚠ THE ONE VALUE THE DOCUMENTATION CANNOT BUCKET. It could be a dead channel or transient; assigning it needs real traffic. Do not model a boolean over it.',
  },
  'Bad Number': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'DEAD_CHANNEL',
    chargeable: true,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"the mobile number is not in use".',
  },
  'Destination is blacklisted': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'OPTED_OUT',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: 'The one Result value seen before the documentation was read. "Mobile number has opted out of receiving your texts and is on your blacklist." ⚠ NOT a dead channel and NOT a §7 bounce. ⚠ And NOT licence to write SmsOptOut: TNZ\'s list is account-wide, SmsOptOut is per-host, and Zone 7 is not written on an inference.',
  },
  'Rejected-Duplicate': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'OUR_FAULT',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"Message is a duplicate (same To, From and Message within 60 seconds)". Ours: nothing about the guest is wrong.',
  },
  'Rejected-Country Blocked-Account Policy': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'OUR_FAULT',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: 'The mobile network is blocked for the account. Account configuration, not the guest.',
  },
  'Rejected-Invalid Sender ID': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'OUR_FAULT',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"The Sender ID on the message was rejected by the mobile carrier." Ours.',
  },
  'Rejected-Message Content Issue': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'OUR_FAULT',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"The message contains a word or phrase that was rejected by the mobile carrier." Ours.',
  },
  LinkNotPermitted: {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'OUR_FAULT',
    chargeable: false,
    webhookDelivered: false,
    provenance: 'DOC-CODES',
    note: '"contains a URL that is not on our phishing whitelist". ⚠ NOT DELIVERED BY WEBHOOK — channels are Dashboard, Email, GET Poll. Gather\'s messages carry links by design, so this is not hypothetical. Reaching it needs GTC-290.',
  },
  'No Permit Record': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'OUR_FAULT',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"Internal TNZ error; contact TNZ Support." Not the guest.',
  },
  'Invalid Mobile Number (RP-Max)': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'DEAD_CHANNEL',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"too many digits for the supplied network/carrier".',
  },
  'Invalid Mobile Number (RP-Min)': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'DEAD_CHANNEL',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"not enough digits for the supplied network/carrier".',
  },
  'Rejected-06-Invalid Mobile Number': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'DEAD_CHANNEL',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"unused mobile number range".',
  },
  'Rejected-07-Invalid Number': {
    status: 'FAILED',
    arrival: 'DID_NOT_ARRIVE',
    bucket: 'DEAD_CHANNEL',
    chargeable: false,
    webhookDelivered: true,
    provenance: 'DOC-CODES',
    note: '"number range is not used for mobile".',
  },
} as const satisfies Record<string, TnzResultRow>;

export interface TnzMessageStatusRow {
  readonly bucket: TnzFailureBucket | null;
  readonly webhookDelivered: boolean;
  readonly terminal: boolean;
  readonly provenance: Provenance;
  readonly note: string;
}

/**
 * The four rows of TNZ's table that carry a `Status` and NO `Result`.
 *
 * These are MESSAGE-level statuses and belong to the GET Status Poll, whose
 * vocabulary differs from the webhook's — that is GTC-290's, and the reason it was
 * filed rather than folded into this phase. They are recorded here because one of
 * them, `CreditHold`, is the seventh member of the OUR_FAULT bucket. A bucket
 * counted over `TNZ_RESULTS` alone finds six and looks complete.
 *
 * Seventeen results plus these four are the twenty-one rows of TNZ's table.
 */
export const TNZ_MESSAGE_LEVEL_STATUS = {
  Pending: {
    bucket: null,
    webhookDelivered: true,
    terminal: false,
    provenance: 'DOC-CODES',
    note: '"currently processing and awaiting a delivery result". ⚠ CONTESTED: the API page lists PENDING among webhook Status values; this page lists channels as Dashboard and GET Poll only. Handled if it arrives, never relied upon.',
  },
  Delayed: {
    bucket: null,
    webhookDelivered: false,
    terminal: false,
    provenance: 'DOC-CODES',
    note: '"queued until the specified Send Time". Not webhook-delivered. GTC-290.',
  },
  CreditHold: {
    bucket: 'OUR_FAULT',
    webhookDelivered: false,
    terminal: false,
    provenance: 'DOC-CODES',
    note: '⚠ THE SEVENTH MEMBER OF THE OUR_FAULT BUCKET, and the reason GTC-290 exists. "held due to lack of available account credit" — it holds EVERY message the account sends and emits no webhook for any of them, so from a webhook-only ingest it is indistinguishable from health. Not webhook-delivered.',
  },
  Unknown: {
    bucket: null,
    webhookDelivered: false,
    terminal: false,
    provenance: 'DOC-CODES',
    note: '"Catch-all value if no other Status code is appropriate." ⚠ Channels are N/A — reported by no mechanism TNZ document, not even the dashboard. Unobservable, and GTC-290 does not fix it either.',
  },
} as const satisfies Record<string, TnzMessageStatusRow>;

/** Gather's shape. Nothing downstream reads a TNZ field name. */
export interface ParsedTnzDeliveryReport {
  readonly provider: 'tnz';
  readonly providerMessageId: string;
  readonly destination: string;
  /** Verbatim, as TNZ sent it. */
  readonly status: string;
  /** Verbatim, or null when TNZ sent nothing. */
  readonly result: string | null;
  readonly detail: string | null;
  readonly providerJobNumber: string | null;
  /** From SentTimeUTC-RFC3339 only. ⚠ The SEND time, not the report time. */
  readonly providerSentAt: Date | null;
  readonly statusClass: TnzStatusClass;
  readonly arrival: TnzArrival;
  readonly failureBucket: TnzFailureBucket | null;
  readonly terminal: boolean;
  /** False when TNZ sent a Result outside the documented seventeen. */
  readonly recognisedResult: boolean;
  /** Contract violations that did not stop the parse. Never payload content. */
  readonly warnings: readonly string[];
}

export type TnzDeliveryParse =
  | { readonly ok: true; readonly report: ParsedTnzDeliveryReport }
  | { readonly ok: false; readonly failure: TnzParseFailure };

export interface TnzResultVerdict {
  readonly statusClass: TnzStatusClass;
  readonly arrival: TnzArrival;
  readonly failureBucket: TnzFailureBucket | null;
  readonly terminal: boolean;
  readonly recognisedResult: boolean;
}

// ── Behaviour ────────────────────────────────────────────────────────────────

/**
 * The canonical form used to match every documented value.
 *
 * Three documented discrepancies make literal matching wrong, and all three are
 * TNZ's own pages disagreeing with each other:
 *   - "Sent OK" (API page) versus "SentOK" (codes page) — one is wrong and we do
 *     not know which, so both must resolve;
 *   - "SUCCESS" (API page) versus "Success" (codes page) versus "Failed" (the
 *     2026-08 mail) — case is not load-bearing anywhere in TNZ's own usage;
 *   - hyphen and space used interchangeably across the Result values.
 *
 * Lowercasing and stripping every non-alphanumeric character handles all three.
 * ⚠ THAT IS ONLY SAFE BECAUSE NO TWO DOCUMENTED VALUES COLLAPSE TOGETHER, which
 * layer 6 of the suite asserts over the tables rather than trusting this comment.
 * If TNZ add a value that collides, that assertion fails before anything silently
 * mis-buckets.
 */
export function canonicalTnzValue(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const RESULT_BY_CANONICAL: ReadonlyMap<string, TnzResultRow> = new Map(
  Object.entries(TNZ_RESULTS).map(([value, row]) => [canonicalTnzValue(value), row as TnzResultRow])
);

/** TNZ's documented `Status` families, matched canonically. */
const STATUS_CLASS_BY_CANONICAL: Readonly<Record<string, TnzStatusClass>> = {
  success: 'SUCCESS',
  failed: 'FAILED',
  pending: 'PENDING',
  received: 'RECEIVED',
  updated: 'UPDATED',
};

/** '' and whitespace mean "TNZ said nothing", which is not the same as a value. */
function orNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : (value as string);
}

/**
 * The verdict, which REQUIRES the Result.
 *
 * ⚠ THERE IS DELIBERATELY NO OVERLOAD THAT REACHES A VERDICT FROM `Status` ALONE.
 * `Status` says whether TNZ are FINISHED with the message; `Result` says what
 * HAPPENED to it. Two of the four documented `Success` results are not arrivals,
 * so a caller holding only the status cannot know, and this signature makes that
 * unrepresentable rather than merely discouraged.
 *
 * The separation is exact:
 *   - `terminal`  comes from `Status`  — SUCCESS and FAILED are done, PENDING is not.
 *   - `arrival`   comes from `Result`  — and from nothing else.
 */
export function interpretTnzResult(status: string, result: string | null): TnzResultVerdict {
  const statusClass = STATUS_CLASS_BY_CANONICAL[canonicalTnzValue(status)] ?? 'UNRECOGNISED';
  const stated = orNull(result ?? undefined);
  const row = stated ? RESULT_BY_CANONICAL.get(canonicalTnzValue(stated)) : undefined;
  const recognisedResult = row !== undefined;

  // PENDING first: it is not an outcome at all, whatever Result says. TNZ's two
  // pages disagree about whether it even arrives by webhook, so it is handled and
  // never relied upon.
  if (statusClass === 'PENDING') {
    return {
      statusClass,
      arrival: 'IN_FLIGHT',
      failureBucket: null,
      terminal: false,
      recognisedResult,
    };
  }

  // RECEIVED and UPDATED belong to the other interpreters. A RECEIVED is a reply.
  // It is not a delivery outcome and must never be recorded as one.
  if (statusClass === 'RECEIVED' || statusClass === 'UPDATED' || statusClass === 'UNRECOGNISED') {
    return {
      statusClass,
      arrival: 'UNRECOGNISED_RESULT',
      failureBucket: null,
      terminal: false,
      recognisedResult,
    };
  }

  // SUCCESS or FAILED. Terminal either way — TNZ are finished. What happened is
  // the Result's to say, and if the Result is absent or outside the documented
  // seventeen then we do not know, and say so, rather than inferring an arrival
  // from a status that cannot carry one.
  if (!row) {
    return {
      statusClass,
      arrival: 'UNRECOGNISED_RESULT',
      failureBucket: null,
      terminal: true,
      recognisedResult: false,
    };
  }

  return {
    statusClass,
    arrival: row.arrival,
    failureBucket: row.bucket,
    terminal: true,
    recognisedResult: true,
  };
}

/**
 * The only timestamp parsed, and the only one that can be.
 *
 * `SentTimeLocal` and `SentTimeUTC-ISO8601` are both DESCRIBED by TNZ as ISO 8601
 * and neither EXAMPLE is — "2025-06-04 09:16:55", space separator, no offset.
 * Falling back to either would invent a timezone, so neither is a fallback: with
 * `SentTimeUTC-RFC3339` absent the answer is null.
 *
 * The shape is checked before `new Date` because `new Date` is permissive and an
 * Invalid Date poisons every comparison downstream without ever throwing.
 *
 * ⚠ Whatever it parses is the time the MESSAGE WAS SENT. The envelope carries no
 * clock for the report itself, which is why the model stores `receivedAt` too.
 */
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function parseRfc3339(value: string | undefined): Date | null {
  const raw = (value ?? '').trim();
  if (raw === '' || !RFC3339.test(raw)) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Fields without which a delivery report cannot be recorded or correlated. */
const REQUIRED_FOR_DELIVERY = [
  'MessageID',
  'Destination',
  'Status',
] as const satisfies readonly TnzEnvelopeField[];

/**
 * Envelope parse, then the `Type` switch, then interpretation.
 *
 * ⚠ A REPLY IS REFUSED, NOT INTERPRETED, and the refusal names the kind so a
 * caller can route the envelope to GTC-288's interpreter rather than drop it. The
 * refusal carries no payload content — see the `detail` strings, all of which are
 * built from field NAMES and the classified kind.
 */
export function parseTnzDeliveryReport(input: unknown): TnzDeliveryParse {
  const parsed = parseTnzWebhookEnvelope(input);
  if (!parsed.ok) return parsed;

  const { envelope, kind, warnings, droppedFields } = parsed;

  if (kind !== 'DELIVERY_STATUS') {
    return {
      ok: false,
      failure: {
        reason: 'NOT_A_DELIVERY_REPORT',
        detail: `Type=${envelope.Type || '(absent)'} classifies as ${kind}; this module interprets delivery status reports only`,
        envelopeKind: kind,
      },
    };
  }

  // A dropped field is also an absent one, so the wrong-type check must come
  // first or a number would be reported as missing.
  const mistyped = REQUIRED_FOR_DELIVERY.filter((f) => droppedFields.includes(f));
  if (mistyped.length > 0) {
    return {
      ok: false,
      failure: {
        reason: 'WRONG_FIELD_TYPE',
        detail: `required field(s) arrived as a non-string and were dropped: ${mistyped.join(', ')}`,
      },
    };
  }

  const missing = REQUIRED_FOR_DELIVERY.filter((f) => orNull(envelope[f]) === null);
  if (missing.length > 0) {
    return {
      ok: false,
      failure: {
        reason: 'MISSING_REQUIRED_FIELD',
        detail: `required field(s) absent or empty: ${missing.join(', ')}`,
      },
    };
  }

  const status = envelope.Status as string;
  const result = orNull(envelope.Result);
  const verdict = interpretTnzResult(status, result);

  const allWarnings = [...warnings];

  // A Result whose documented family disagrees with the Status TNZ sent. The
  // Result wins, because it is the specific field — but the disagreement is
  // recorded, since it would mean the contract has moved.
  const row = result ? RESULT_BY_CANONICAL.get(canonicalTnzValue(result)) : undefined;
  if (row && verdict.statusClass !== 'UNRECOGNISED' && row.status !== verdict.statusClass) {
    allWarnings.push(
      `Status is ${verdict.statusClass} but Result "${result}" is documented under ${row.status}. The Result was used; the disagreement suggests the contract has moved.`
    );
  }

  if (row && !row.webhookDelivered) {
    allWarnings.push(
      `Result "${result}" is documented as NOT delivered by webhook (TNZ list Dashboard/Email/GET Poll only). Receiving it here contradicts the documentation — see GTC-290.`
    );
  }

  return {
    ok: true,
    report: {
      provider: 'tnz',
      providerMessageId: envelope.MessageID as string,
      destination: envelope.Destination as string,
      status,
      result,
      detail: orNull(envelope.Detail),
      providerJobNumber: orNull(envelope.JobNumber),
      providerSentAt: parseRfc3339(envelope['SentTimeUTC-RFC3339']),
      statusClass: verdict.statusClass,
      arrival: verdict.arrival,
      failureBucket: verdict.failureBucket,
      terminal: verdict.terminal,
      recognisedResult: verdict.recognisedResult,
      warnings: allWarnings,
    },
  };
}

/** A fabricated delivery-status envelope. See buildTnzWebhookEnvelope. */
export function buildTnzDeliveryEnvelope(
  overrides: Partial<TnzWebhookEnvelope> = {}
): TnzWebhookEnvelope {
  return buildTnzWebhookEnvelope({
    Type: 'SMS',
    Status: 'SUCCESS',
    Result: 'delivered',
    ReceivedID: '',
    Message: '',
    ...overrides,
  });
}

/**
 * A fabricated REPLY envelope — provided so this module's tests can prove it
 * REFUSES one. It is not an invitation to interpret replies here.
 */
export function buildTnzReplyEnvelope(
  overrides: Partial<TnzWebhookEnvelope> = {}
): TnzWebhookEnvelope {
  return buildTnzWebhookEnvelope({
    Type: 'SMSReply',
    Status: 'RECEIVED',
    Result: 'RECEIVED',
    ReceivedID: '5000000a-f002-4007-b00a-d00000000001',
    Message: 'This is a reply.',
    Price: '',
    Detail: 'InputToNumber:021-000 001',
    ...overrides,
  });
}
