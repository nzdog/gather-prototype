/**
 * [[GTC-290]] — TNZ's GET STATUS RESPONSE: the second wire shape, behind its own boundary.
 *
 * `GET https://api.tnz.co.nz/api/v2.04/get/status/[MessageID]` answers in a shape that is NOT the
 * webhook's (`./tnz-webhook-envelope.ts`), and this module never imports that parser. GTC-264 ruled
 * the two apart: "two vocabularies in one phase is how the fiction gets built."
 *
 * ── WHAT DIFFERS FROM THE WEBHOOK, AND WHAT MUST NOT BE GOT WRONG ─────────────
 *
 * 1. TWO `Status` VOCABULARIES AT TWO LEVELS. The message's own `Status` is one of `Unknown`,
 *    `Pending`, `Delayed`, `Completed`, `CreditHold` (`Completed` appears nowhere in the webhook).
 *    Each recipient's `Status` and `Result` use the WEBHOOK's vocabulary, so a recipient's pair is
 *    handed on, verbatim, to `interpretTnzResult` — the shared vocabulary, not a shared shape.
 * 2. THE MESSAGE'S `Result` IS THE API CALL'S, NOT THE MESSAGE'S. TNZ's words: "Result of your API
 *    call (not the result of the message)". So `Result: "Failed"` is a failed poll, never a failed
 *    delivery, even when a recipient beside it says delivered.
 * 3. DIFFERENT FIELD NAMES. `JobNum` here, `JobNumber` there; `SentTimeUTC_RFC3339` with an
 *    underscore here, `SentTimeUTC-RFC3339` with a hyphen there. Only this shape's names are read.
 * 4. A REPLY IS NEVER READ. A recipient of Type `SMSReply` or `SMSInbound`, or with Status
 *    `RECEIVED`/`UPDATED`, is skipped and none of its fields is read. Replies are GTC-350's, and
 *    nothing here may infer an opt-out (Zone 7).
 *
 * ── ⚠ THE EVIDENCE IS WEAKER THAN THE WEBHOOK'S ───────────────────────────────
 *
 * Every field below is DOC-TABLE: TNZ's parameter table, read from the saved page
 * `docs/05_ops/tnz-restapi-v2.04-docs-2026-09-12.html` ("GET Status Poll"). Both of that section's
 * sample bodies are EMPTY in the page, so no field is DOC-EXAMPLE. Two things are believed and not
 * stated, and are marked INFERRED where they bear: that `Recipients` is an array, and that the
 * count fields are numbers (the parse reads neither count).
 *
 * The recorded contract is `docs/05_ops/tnz-delivery-status-contract-2026-09-12.md`, "The GET Status
 * Poll". Correct that and this file together.
 */

import { canonicalTnzValue } from './tnz-delivery-contract';

type FieldProvenance = 'DOC-TABLE';

interface StatusField {
  readonly level: 'MESSAGE' | 'RECIPIENT' | 'FAILURE';
  readonly provenance: FieldProvenance;
  /** What is believed about the field's shape and not stated by TNZ. */
  readonly inferred?: string;
  readonly note: string;
}

const MSG = (note: string, inferred?: string): StatusField => ({
  level: 'MESSAGE',
  provenance: 'DOC-TABLE',
  note,
  ...(inferred ? { inferred } : {}),
});
const RCP = (note: string): StatusField => ({ level: 'RECIPIENT', provenance: 'DOC-TABLE', note });

/** TNZ's GET status fields, in the table's order. READ marks the ones the parse reads. */
export const TNZ_STATUS_FIELDS = {
  Result: MSG(
    'READ. "Result of your API call (not the result of the message)". Success or Failed.'
  ),
  MessageID: MSG('READ. The id asked about; checked against it on every answer.'),
  Status: MSG(
    "READ. \"Current state of the message ('Unknown', 'Pending', 'Delayed', 'Completed', 'CreditHold')\"."
  ),
  JobNum: MSG('READ. TNZ\'s eight-character job number. ⚠ Not the webhook\'s "JobNumber".'),
  Account: MSG('Not read.'),
  SubAccount: MSG('Not read.'),
  Department: MSG('Not read.'),
  Reference: MSG('Not read.'),
  CreatedTimeLocal: MSG('Not read.'),
  CreatedTimeUTC: MSG('Not read.'),
  CreatedTimeUTC_RFC3339: MSG('Not read.'),
  DelayedTimeLocal: MSG('Not read.'),
  DelayedTimeUTC: MSG('Not read.'),
  DelayedTimeUTC_RFC3339: MSG('Not read.'),
  Count: MSG('Not read.', "a number (the table's example is 5)"),
  Complete: MSG('Not read.', 'a number'),
  Success: MSG('Not read.', 'a number'),
  Failed: MSG('Not read.', 'a number'),
  Recipients: MSG(
    'READ. One entry per destination; the fields below are nested under it.',
    'an array — the table nests its fields under ">" and names it in the plural'
  ),
  Type: RCP(
    "READ. \"'Email', 'SMS', 'Fax', 'Voice', 'TextToSpeech', 'SMSInbound' or 'SMSReply'\" — the table's example says \"Text\"."
  ),
  DestSeq: RCP('Not read.'),
  Destination: RCP('READ. E.164, per the table.'),
  ContactID: RCP('Not read.'),
  RecipientStatus: RCP(
    'READ. The recipient\'s "Status": SUCCESS, FAILED, PENDING — the webhook\'s vocabulary. (Keyed here under another name only because the message has a "Status" too.)'
  ),
  RecipientResult: RCP(
    'READ. The recipient\'s "Result": "Final delivery result and/or the cause for a message delivery failure" — the webhook\'s seventeen.'
  ),
  SentTimeLocal: RCP('Not read: no offset.'),
  SentTimeUTC: RCP('Not read: no offset in the example.'),
  SentTimeUTC_RFC3339: RCP('READ. ⚠ Underscore; the webhook spells it with a hyphen.'),
  Attention: RCP('Not read.'),
  Company: RCP('Not read.'),
  'Custom1-9': RCP('Not read.'),
  RemoteID: RCP('Not read.'),
  Price: RCP('Not read.'),
  FailureMessage: {
    level: 'FAILURE',
    provenance: 'DOC-TABLE',
    note: 'NOT READ. A failed call\'s "Message", "Reason for the API call failure". The HTTP status and Result are enough.',
  },
} as const satisfies Record<string, StatusField>;

/** The message-level `Status` values TNZ document, verbatim. */
export const TNZ_POLL_MESSAGE_STATUSES = [
  'Unknown',
  'Pending',
  'Delayed',
  'Completed',
  'CreditHold',
] as const;

/** What one GET answer says, in Gather's shape. Nothing downstream reads a TNZ field name. */
export type TnzStatusVerdict =
  /** The call failed, or its answer cannot be read. Never a delivery outcome. */
  | { readonly kind: 'POLL_FAILED'; readonly why: string }
  /** TNZ answered about a different message. Nothing may be written from it. */
  | { readonly kind: 'MISMATCH'; readonly answeredMessageId: string }
  /** A recipient TNZ have finished with: its pair goes to `interpretTnzResult`. */
  | {
      readonly kind: 'FINAL';
      readonly status: string;
      readonly result: string | null;
      readonly destination: string | null;
      readonly messageStatus: string | null;
      readonly jobNum: string | null;
      readonly sentAt: Date | null;
    }
  /** The account is out of credit and TNZ are holding the message. */
  | { readonly kind: 'HELD'; readonly messageStatus: string; readonly jobNum: string | null }
  /** Not finished, for any other reason. `messageStatus` is TNZ's word, verbatim. */
  | {
      readonly kind: 'IN_FLIGHT';
      readonly messageStatus: string | null;
      readonly jobNum: string | null;
    };

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return v.trim() === '' ? null : v;
}

function rfc3339(v: unknown): Date | null {
  const raw = text(v)?.trim() ?? '';
  if (!RFC3339.test(raw)) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const SMS_TYPES = new Set(['sms', 'text']);
const NOT_A_SEND = new Set(['received', 'updated']);
const FINISHED = new Set(['success', 'failed']);

/** The recipient whose answer this is: an SMS send, matched on the number when there are several. */
function recipientFor(list: unknown, destination: string | null): Record<string, unknown> | null {
  if (!Array.isArray(list)) return null;
  const sends = list.filter((r): r is Record<string, unknown> => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
    const type = text(r.Type);
    if (type !== null && !SMS_TYPES.has(canonicalTnzValue(type))) return false;
    const status = text(r.Status);
    return status === null || !NOT_A_SEND.has(canonicalTnzValue(status));
  });
  if (sends.length === 0) return null;
  if (destination) {
    const match = sends.find((r) => text(r.Destination) === destination);
    if (match) return match;
  }
  return sends[0];
}

/**
 * Read one GET answer. Never throws.
 *
 * Order: the HTTP status and the call's own `Result`, then the id, then a finished recipient, then
 * the message's `Status`. A finished recipient wins over any message-level word.
 */
export function parseTnzStatusResponse(
  httpStatus: number,
  bodyText: string,
  askedMessageId: string,
  destination: string | null = null
): TnzStatusVerdict {
  if (httpStatus !== 200) return { kind: 'POLL_FAILED', why: `HTTP ${httpStatus}` };
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return { kind: 'POLL_FAILED', why: 'the body is not JSON' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'POLL_FAILED', why: 'the body is not an object' };
  }
  const b = body as Record<string, unknown>;
  const callResult = text(b.Result);
  if (callResult === null || canonicalTnzValue(callResult) !== 'success') {
    return { kind: 'POLL_FAILED', why: `the call's Result is ${callResult ?? 'absent'}` };
  }
  const answered = text(b.MessageID);
  if (answered === null) return { kind: 'POLL_FAILED', why: 'no MessageID in the answer' };
  if (answered !== askedMessageId) return { kind: 'MISMATCH', answeredMessageId: answered };

  const messageStatus = text(b.Status);
  const jobNum = text(b.JobNum);
  const r = recipientFor(b.Recipients, destination);
  const rStatus = r ? text(r.Status) : null;
  if (r && rStatus !== null && FINISHED.has(canonicalTnzValue(rStatus))) {
    return {
      kind: 'FINAL',
      status: rStatus,
      result: text(r.Result),
      destination: text(r.Destination),
      messageStatus,
      jobNum,
      sentAt: rfc3339(r.SentTimeUTC_RFC3339),
    };
  }
  if (messageStatus !== null && canonicalTnzValue(messageStatus) === 'credithold') {
    return { kind: 'HELD', messageStatus, jobNum };
  }
  return { kind: 'IN_FLIGHT', messageStatus, jobNum };
}

/**
 * A GET answer for a test, built from the field table above. Fabricated, never observed: TNZ's own
 * sample bodies are empty.
 */
export function buildTnzStatusResponse(args: {
  messageId: string;
  status: string;
  result?: string;
  recipients?: ReadonlyArray<{
    destination: string;
    status: string;
    result: string;
    type?: string;
    sentAtRfc3339?: string;
  }>;
}): Record<string, unknown> {
  const recipients = (args.recipients ?? []).map((r, i) => ({
    Type: r.type ?? 'SMS',
    DestSeq: String(i + 1).padStart(8, '0'),
    Destination: r.destination,
    ContactID: '',
    Status: r.status,
    Result: r.result,
    SentTimeLocal: '',
    SentTimeUTC: '',
    SentTimeUTC_RFC3339: r.sentAtRfc3339 ?? '',
    Attention: '',
    Company: '',
    RemoteID: '',
    Price: '',
  }));
  return {
    Result: args.result ?? 'Success',
    MessageID: args.messageId,
    Status: args.status,
    JobNum: '',
    Account: '',
    SubAccount: '',
    Department: '',
    Reference: '',
    CreatedTimeLocal: '',
    CreatedTimeUTC: '',
    CreatedTimeUTC_RFC3339: '',
    DelayedTimeLocal: '',
    DelayedTimeUTC: '',
    DelayedTimeUTC_RFC3339: '',
    Count: recipients.length,
    Complete: 0,
    Success: 0,
    Failed: 0,
    Recipients: recipients,
  };
}
