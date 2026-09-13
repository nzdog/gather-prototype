/**
 * GTC-264 — the SHARED TNZ webhook envelope.
 *
 * ⚠ READ THIS BEFORE ADDING A SECOND PARSER SOMEWHERE ELSE.
 *
 * TNZ send delivery-status reports and inbound SMS on ONE envelope. Same twenty
 * fields, same names, same order, same authentication headers, and one
 * subscription — their words: "If you are set up to receive Status webhooks, you
 * will also be receiving SMS Received webhooks." The callbacks are told apart by
 * `Type`, not by shape.
 *
 * Three tickets once carried the opposite instruction — "the delivery-receipt
 * contract is NOT the MO contract, do not build one parser for both" — and it was
 * wrong. It was never TNZ's claim: it entered as a parenthetical in our own
 * question of 2026-08-15 ("assumed different"), TNZ answered with a bare URL, and
 * the assumption was inherited as an instruction. Amended by founder ruling
 * 2026-09-12. The provenance trail is in
 * docs/05_ops/tnz-inbound-and-delivery-correspondence-2026-08.md.
 *
 * THE STRUCTURE THAT RULING REQUIRES, and this file is the first third of it:
 *
 *   1. ONE documented envelope parser        <- here
 *   2. then a `Type` switch                  <- here (`classifyEnvelope`)
 *   3. then interpreters that know nothing of each other
 *        - delivery reports -> ./tnz-delivery-contract.ts   (GTC-264)
 *        - replies          -> GTC-288's, not yet written
 *
 * What survives from the old instruction and is still binding: the two payloads
 * MEAN different things. `Status` and `Result` are shared field NAMES carrying
 * different contracts, and on a reply both carry `RECEIVED`. A `RECEIVED` is a
 * reply. It is never a delivery outcome.
 *
 * ── THE RECORDED SHAPE, AND HOW TO CORRECT IT ─────────────────────────────────
 *
 * The contract is recorded in
 * docs/05_ops/tnz-delivery-status-contract-2026-09-12.md, built from two artefacts
 * saved beside it. `ENVELOPE_PROVENANCE` below is the machine-readable half: it is
 * the SOURCE of the field list, and `TnzWebhookEnvelope` is derived from it, so
 * the record cannot drift behind the type.
 *
 * When the trial shows the wire differing from this: correct THIS FILE and the
 * record, and nothing else. The fixture factory is typed against the derived type,
 * so a corrected field name fails `tsc` in every override that named it — which is
 * the point, and is asserted by layer 9 of tests/tnz-delivery-contract-test.ts.
 * Append the correction to the record below the record; do not silently edit it.
 */

/** Where a claim in this file comes from. Nothing is unmarked. */
export type Provenance =
  /** In a literal payload example in TNZ's documentation. */
  | 'DOC-EXAMPLE'
  /** In TNZ's parameter table. */
  | 'DOC-TABLE'
  /** In TNZ's SMS delivery result-codes help page. */
  | 'DOC-CODES'
  /** In the 2026-08 correspondence. */
  | 'MAIL'
  /** Believed, with the basis named. Never seen stated. */
  | 'INFERRED'
  /** Asked or unasked, and not answered anywhere. */
  | 'UNKNOWN';

export interface FieldProvenance {
  readonly provenance: Provenance;
  readonly note: string;
}

/**
 * Every field of the envelope, in TNZ's own source order, with provenance.
 *
 * ⚠ THIS IS THE FIELD LIST. `TnzWebhookEnvelope` is derived from its keys, so
 * adding a field here adds it to the type, and renaming one here renames it
 * everywhere — including in every fixture override, loudly, at compile time.
 *
 * Every documented value on the wire is a STRING, including `Price`. Absence is
 * represented as the empty string in TNZ's examples; whether a field can be
 * omitted from the JSON entirely is UNKNOWN, so the derived type is Partial.
 */
export const ENVELOPE_PROVENANCE = {
  Version: {
    provenance: 'DOC-EXAMPLE',
    note: 'The API version configured for the webhook. Example "2.04".',
  },
  Sender: {
    provenance: 'DOC-EXAMPLE',
    note: 'Webhook sender authentication — the identity half. Documented as "can configure a unique Sender if required", which is what makes sharing the default and divergence configurable.',
  },
  APIKey: {
    provenance: 'DOC-EXAMPLE',
    note: 'Webhook token authentication — the secret half, repeated from the Authorization header. Documented as "can configure a unique APIKey if required". Verified by Phase 3, never by this module.',
  },
  Type: {
    provenance: 'DOC-TABLE',
    note: 'The discriminator. Documented set: Email, SMS, Fax, Voice, TextToSpeech, SMSInbound, SMSReply. SMS is a delivery status report.',
  },
  Destination: {
    provenance: 'DOC-EXAMPLE',
    note: 'E.164. On a status report this is the recipient; on a reply the same field is the SENDER. Stored verbatim and never normalised — normalizePhoneNumber has 13 call sites pinning its behaviour.',
  },
  ContactID: {
    provenance: 'DOC-TABLE',
    note: 'TNZ address-book contact id, UUID v4. INFERRED to arrive empty for Gather, since nothing in the tree calls TNZ address-book endpoints.',
  },
  ReceivedID: {
    provenance: 'DOC-TABLE',
    note: 'Tracking id for inbound/reply SMS. Documented as "Always blank for Status webhooks", so a populated value on a Type=SMS envelope is a contradiction worth warning about.',
  },
  MessageID: {
    provenance: 'DOC-EXAMPLE',
    note: 'THE JOIN KEY. "MessageID parameter supplied when sending your original API call. If you did not supply one, the API generated one for you." sendViaTnz supplies none, so TNZ generate a v4 UUID, and sendSms has written it to InviteEvent.metadata on every send since the transport went in.',
  },
  SubAccount: {
    provenance: 'DOC-TABLE',
    note: 'Reporting/billing segmentation. INFERRED to arrive empty for Gather, which supplies none.',
  },
  Department: {
    provenance: 'DOC-TABLE',
    note: 'Reporting/billing segmentation. INFERRED to arrive empty for Gather, which supplies none.',
  },
  JobNumber: {
    provenance: 'DOC-EXAMPLE',
    note: 'TNZ internal eight-character job number. Kept because it is what a TNZ support conversation is keyed on.',
  },
  SentTimeLocal: {
    provenance: 'DOC-EXAMPLE',
    note: 'Described by TNZ as ISO 8601; the example "2025-06-04 09:16:55" is NOT ISO 8601 — space separator, no offset. NOT PARSED. See the timestamp note in ./tnz-delivery-contract.ts.',
  },
  'SentTimeUTC-ISO8601': {
    provenance: 'DOC-EXAMPLE',
    note: 'Same discrepancy: described as ISO 8601, example "2025-06-03 21:16:55" is not. NOT PARSED.',
  },
  'SentTimeUTC-RFC3339': {
    provenance: 'DOC-EXAMPLE',
    note: 'The only timestamp whose example matches its description ("2025-06-03T21:16:55.000Z"), and therefore the only one parsed. ⚠ It is the time the MESSAGE WAS SENT, not when the report was raised — the envelope carries no report clock at all.',
  },
  Status: {
    provenance: 'DOC-TABLE',
    note: 'SUCCESS | FAILED | PENDING for submission results; RECEIVED for reply reports; UPDATED for additional analytics. ⚠ Case differs between TNZ pages (SUCCESS vs Success) — compare case-insensitively.',
  },
  Result: {
    provenance: 'DOC-TABLE',
    note: 'Final delivery result, or the cause of failure. Seventeen documented values for SMS; RECEIVED on a reply. The vocabulary lives in ./tnz-delivery-contract.ts.',
  },
  Message: {
    provenance: 'DOC-TABLE',
    note: 'The received SMS body, documented as present only "if Type=SMSInbound or Type=SMSReply". It is part of the SHARED envelope so GTC-288 needs no second parser; the delivery interpreter never reads it.',
  },
  Price: {
    provenance: 'DOC-EXAMPLE',
    note: 'Cost of the transaction, as a STRING ("0.10"). Documented "Always empty for SMS Received webhooks". Not stored by GTC-264 — see the model comment.',
  },
  Detail: {
    provenance: 'DOC-EXAMPLE',
    note: 'A key:value string whose key varies by message type; "SMSParts:1" for SMS, "InputToNumber:..." on a reply.',
  },
  URL: {
    provenance: 'DOC-EXAMPLE',
    note: 'The webhook URL the callback was sent to — echoed back by TNZ.',
  },
} as const satisfies Record<string, FieldProvenance>;

/** A field name of the envelope, derived from the record so the two cannot part. */
export type TnzEnvelopeField = keyof typeof ENVELOPE_PROVENANCE;

/**
 * The envelope as it arrives. Every value is a string; Partial because absence is
 * possible and the empty-string-versus-omitted question is UNKNOWN.
 */
export type TnzWebhookEnvelope = Partial<Record<TnzEnvelopeField, string>>;

/**
 * What kind of callback this envelope is, decided by `Type` alone.
 *
 * UNCLASSIFIED is not an error. It means TNZ sent a Type we do not recognise, and
 * the honest response is to record it and refuse to interpret it — not to assume
 * it is ours.
 */
export type TnzEnvelopeKind =
  | 'DELIVERY_STATUS'
  | 'INBOUND_MESSAGE'
  | 'OTHER_MESSAGE_TYPE'
  | 'UNCLASSIFIED';

export type TnzParseFailureReason =
  | 'NOT_JSON_OBJECT'
  | 'MISSING_REQUIRED_FIELD'
  | 'WRONG_FIELD_TYPE'
  | 'NOT_A_DELIVERY_REPORT';

export interface TnzParseFailure {
  readonly reason: TnzParseFailureReason;
  /** Human-readable, names the offending field. Never carries payload content. */
  readonly detail: string;
  /** Set on NOT_A_DELIVERY_REPORT so a caller can route rather than drop. */
  readonly envelopeKind?: TnzEnvelopeKind;
}

export type TnzEnvelopeParse =
  | {
      readonly ok: true;
      readonly envelope: TnzWebhookEnvelope;
      readonly kind: TnzEnvelopeKind;
      /** Contract violations that are not fatal. ⚠ Never payload content. */
      readonly warnings: readonly string[];
      /**
       * Fields that arrived as something other than a string and were therefore
       * dropped. Reported structurally rather than only in `warnings`, so an
       * interpreter can turn a dropped REQUIRED field into a hard failure without
       * pattern-matching prose.
       */
      readonly droppedFields: readonly TnzEnvelopeField[];
    }
  | { readonly ok: false; readonly failure: TnzParseFailure };

/** TNZ's documented `Type` values, and what each means to us. */
const TYPE_KINDS: Readonly<Record<string, TnzEnvelopeKind>> = {
  sms: 'DELIVERY_STATUS',
  smsreply: 'INBOUND_MESSAGE',
  smsinbound: 'INBOUND_MESSAGE',
  email: 'OTHER_MESSAGE_TYPE',
  fax: 'OTHER_MESSAGE_TYPE',
  voice: 'OTHER_MESSAGE_TYPE',
  texttospeech: 'OTHER_MESSAGE_TYPE',
};

// ── Behaviour ────────────────────────────────────────────────────────────────

/** The `Type` switch, and the whole of it. */
export function classifyEnvelope(envelope: TnzWebhookEnvelope): TnzEnvelopeKind {
  return kindForType(envelope.Type);
}

/** What arrived, said without quoting it — a failure detail must never carry payload. */
function describeShape(input: unknown): string {
  if (input === null) return 'null';
  if (Array.isArray(input)) return 'an array';
  return `a ${typeof input}`;
}

/**
 * Parses the shared envelope and INTERPRETS NOTHING.
 *
 * It reads only the twenty recorded fields, keeps every value verbatim, and
 * classifies by `Type`. It does not decide whether a field is required — that is
 * the interpreter's question, because `MessageID` is mandatory for a delivery
 * report and meaningless for an `Email` callback.
 *
 * Two contract contradictions are warned about here rather than downstream,
 * because both are facts about the ENVELOPE and both concern fields that belong
 * to the other interpreter:
 *
 *   - `ReceivedID` populated on a `Type=SMS` envelope. TNZ: "Always blank for
 *     Status webhooks."
 *   - `Message` present on an envelope that is not `SMSInbound`/`SMSReply`. TNZ
 *     document it as present only for those.
 *
 * ⚠ The second warning reports PRESENCE and never content, and it is raised here
 * so that ./tnz-delivery-contract.ts never touches the field at all. That is the
 * line between the two interpreters, and its test asserts the delivery module
 * contains no access to `Message` whatsoever.
 */
export function parseTnzWebhookEnvelope(input: unknown): TnzEnvelopeParse {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      failure: {
        reason: 'NOT_JSON_OBJECT',
        detail: `expected a JSON object, received ${describeShape(input)}`,
      },
    };
  }

  const raw = input as Record<string, unknown>;
  const fields = Object.keys(ENVELOPE_PROVENANCE) as TnzEnvelopeField[];
  const envelope: Record<string, string> = {};
  const warnings: string[] = [];
  const droppedFields: TnzEnvelopeField[] = [];

  for (const field of fields) {
    const value = raw[field];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      envelope[field] = value;
      continue;
    }
    droppedFields.push(field);
    warnings.push(
      `field \`${field}\` arrived as ${describeShape(value)} and was dropped — every documented value on this envelope is a string.`
    );
  }

  // Fields TNZ may add. Recorded so the trial can diff belief against reality
  // without reading the implementation; tolerated, because a new field of theirs
  // is not our business until someone decides it is.
  const unknownKeys = Object.keys(raw).filter((k) => !(fields as string[]).includes(k));
  if (unknownKeys.length > 0) {
    warnings.push(
      `envelope carried ${unknownKeys.length} field(s) absent from the recorded contract: ${unknownKeys.join(', ')}. Tolerated and not interpreted.`
    );
  }

  const kind = kindForType(envelope.Type);

  if (kind === 'DELIVERY_STATUS' && (envelope.ReceivedID ?? '').trim() !== '') {
    warnings.push(
      'ReceivedID is populated on a Type=SMS envelope, which TNZ document as "Always blank for Status webhooks".'
    );
  }

  if (kind !== 'INBOUND_MESSAGE' && (envelope[REPLY_BODY_FIELD] ?? '').trim() !== '') {
    warnings.push(
      `${REPLY_BODY_FIELD} is present on a ${envelope.Type || '(no Type)'} envelope, which TNZ document as reply-only. Its presence is recorded; its content is not read here and is not carried into this warning.`
    );
  }

  return { ok: true, envelope, kind, warnings, droppedFields };
}

/**
 * The reply body's field name, as a value rather than a property access.
 *
 * ⚠ It is spelled once, here, on purpose. The reply body belongs to GTC-288's
 * interpreter; this module needs to know whether it is PRESENT in order to warn
 * about a contract contradiction, and nothing else in the tree should be reaching
 * for it by name.
 */
const REPLY_BODY_FIELD = 'Message' satisfies TnzEnvelopeField;

/**
 * Fabricated envelope, built FROM the recorded shape.
 *
 * ⚠ THIS LIVES IN src/ ON PURPOSE. It is typed against `TnzWebhookEnvelope`,
 * which is derived from `ENVELOPE_PROVENANCE`, so correcting a field name here
 * breaks every test override that named it at COMPILE time rather than leaving a
 * suite green against a fiction. That property is the requirement; colocation with
 * the type is what delivers it. It is pure, allocation-only, and reaches nothing.
 *
 * Defaults are TNZ's own documented example values for a status report.
 */
export function buildTnzWebhookEnvelope(
  overrides: Partial<TnzWebhookEnvelope> = {}
): TnzWebhookEnvelope {
  return {
    Version: '2.04',
    Sender: 'application@domain.com',
    APIKey: 'ta8wr7ymd',
    Type: 'SMS',
    Destination: '+6421000001',
    ContactID: '7000000a-f002-4007-b00a-d00000000001',
    ReceivedID: '',
    MessageID: '1000000a-f002-4007-b00a-d00000000002',
    SubAccount: 'SubAccount01',
    Department: 'Department01',
    JobNumber: '10C7B9A0',
    SentTimeLocal: '2025-06-04 09:16:55',
    'SentTimeUTC-ISO8601': '2025-06-03 21:16:55',
    'SentTimeUTC-RFC3339': '2025-06-03T21:16:55.000Z',
    Status: 'SUCCESS',
    Result: 'delivered',
    Message: '',
    Price: '0.10',
    Detail: 'SMSParts:1',
    URL: 'https://www.example.com/webhook',
    ...overrides,
  };
}

/** Exported for the interpreters; not part of the envelope contract itself. */
export function kindForType(rawType: string | undefined): TnzEnvelopeKind {
  if (!rawType) return 'UNCLASSIFIED';
  return TYPE_KINDS[rawType.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? 'UNCLASSIFIED';
}
