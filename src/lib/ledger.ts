/**
 * GTC-168 (A2) — THE LEDGER: the single write path for plan history.
 *
 * Plan of record: `docs/04_roadmap/send-lock-reconciliation-plan.md` §5 (the why-scope
 * rule) and §6 (ledger unification and versioning).
 *
 * THE MODEL, in three sentences:
 *
 *   1. The lock is not a wall. After the send, every mutation is ALLOWED; what
 *      changes is that it is RECORDED (Moment 4 §7 — "the fact is welcome; the
 *      challenge is forbidden").
 *   2. VERSIONS ARE LEDGER ENTRIES. `AuditEntry.sequence` IS the version number
 *      (Hinge §2 — "reasons explain the steps; versions ARE the steps"). There is no
 *      second object to join; that is what makes per-change versioning affordable at
 *      ~0.5 KB an entry against 156 KB for a full plan snapshot, measured 285–291x.
 *   3. The WHY is scoped, the VERSION never is. Every change is versioned; only
 *      changes that TOUCH SOMEONE carry a reason (Hinge §2, gap #2).
 *
 * A2 SCOPE: this module lands callable and UNCALLED. Wiring the ~25 mutation routes
 * is GTC-196 (A3b) in its entirety.
 */

import type { AssignmentResponse, Prisma } from '@prisma/client';
import { isSent, type LifecycleEvent } from './lifecycle';

type Tx = Prisma.TransactionClient;

/** Mirrors the `ActorKind` enum. Duplicated as a union so pure helpers need no client. */
export type ActorKind = 'HOST' | 'COHOST' | 'COORDINATOR' | 'GUEST' | 'SYSTEM';

// ─────────────────────────────────────────────────────────────────────────────
// The field sets the why-scope rule is defined over
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The guest-visible ask. Exactly the contents of the message per Hinge §3: "What
 * they've been asked to bring / the item carrying its own logistics: quantity, where
 * to drop off, when."
 *
 * This set is defined by the spec, not by taste. Everything else on `Item`
 * (description, notes, critical, dietary tags, prep/serve times, displayOrder, dayId)
 * is host-side and never reaches a guest, so changing it touches nobody.
 */
export const ASK_FIELDS = [
  'name',
  'quantity',
  'quantityAmount',
  'quantityUnit',
  'quantityUnitCustom',
  'quantityText',
  'dropOffAt',
  'dropOffLocation',
  'dropOffNote',
] as const;

/**
 * Material event fields — Hinge §2 names "date/venue" explicitly. A change here is
 * the T5 trigger and the GTC-183 (F1) re-ask hook point.
 *
 * Enumerated rather than prefix-matched: the ticket asked for "a concrete, enumerable
 * rule (not a vibe)", and a `startsWith('venue')` test would silently absorb any
 * future venue-ish column without a decision being made.
 */
export const MATERIAL_EVENT_FIELDS = [
  'startDate',
  'endDate',
  'venueName',
  'venueType',
  'venueKitchenAccess',
  'venueOvenCount',
  'venueStoretopBurners',
  'venueBbqAvailable',
  'venueTimingStart',
  'venueTimingEnd',
  'venueNotes',
] as const;

export type AskField = (typeof ASK_FIELDS)[number];
export type MaterialEventField = (typeof MATERIAL_EVENT_FIELDS)[number];

const ASK_FIELD_SET: ReadonlySet<string> = new Set(ASK_FIELDS);
const MATERIAL_FIELD_SET: ReadonlySet<string> = new Set(MATERIAL_EVENT_FIELDS);

// ─────────────────────────────────────────────────────────────────────────────
// What a change is
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every kind of change the ledger records. Kept as a string union rather than a
 * Prisma enum: `AuditEntry.actionType` stays `String` through A2 (deviation 3,
 * deferred to A3b by Nigel 2026-08-03) because a text→enum cast fails on any
 * historical value outside the enum, and A3b adds the rest of the writers.
 */
export type ChangeAction =
  // ── T1: the assignment triggers ──
  | 'CREATE_ASSIGNMENT'
  | 'MOVE_ASSIGNMENT'
  | 'DELETE_ASSIGNMENT'
  // ── T2 / T3 ──
  | 'REMOVE_PERSON'
  | 'DELETE_ITEM'
  // ── T4 / T5: field-scoped edits ──
  | 'EDIT_ITEM'
  | 'EDIT_EVENT'
  // ── never triggers, always versioned ──
  | 'CREATE_ITEM'
  | 'ADD_PERSON'
  | 'TOGGLE_CRITICAL'
  | 'CREATE_TEAM'
  | 'EDIT_TEAM'
  | 'DELETE_TEAM'
  | 'REGENERATE_PLAN'
  | 'GENERATE_PLAN'
  | 'SEND_PRESSED'
  | 'WRAP_UP_SENT';

export type ChangeTargetType = 'Assignment' | 'Item' | 'PersonEvent' | 'Event' | 'Team';

/**
 * A single field-level change, before it becomes a row.
 *
 * `context` carries the facts the why-scope rule needs but the row itself does not:
 * whether the affected item is currently claimed, and how much the removed person was
 * holding. Callers must supply it — the rule cannot query, because it is pure and
 * must be unit-testable without a database.
 */
export interface PendingChange {
  action: ChangeAction;
  targetType: ChangeTargetType;
  targetId: string;
  /** Set for field-scoped edits (EDIT_ITEM, EDIT_EVENT, EDIT_TEAM). */
  field?: string;
  before?: unknown;
  after?: unknown;
  context?: {
    /**
     * T3/T4: the response on the assignment held by the affected item, or `null` when
     * the item holds no assignment at all.
     *
     * The PENDING/answered distinction is the whole of the typo rule — see
     * `touchesSomeone`.
     */
    assignmentResponse?: AssignmentResponse | null;
    /** T2: how many assignments the person being removed currently holds. */
    heldAssignmentCount?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The why-scope rule
// ─────────────────────────────────────────────────────────────────────────────

/** Which trigger fired, or `null`. Returned for diagnostics and for the fixture. */
export type WhyTrigger = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

/**
 * Does this change TOUCH SOMEONE?
 *
 * > A change touches someone when it withdraws, transfers, or alters an ask that a
 * > named person has already received.
 *
 * Hinge §2, ruled: "The why is required only for changes that touch someone:
 * reassignment, removal, a quantity someone claimed against, date/venue. A typo fix
 * gets a version and no interrogation."
 *
 * | Trigger | Condition (ALL additionally require the event to be sent) |
 * |---|---|
 * | T1 | An assignment is created, moved, or deleted — ANY response, PENDING included |
 * | T2 | A person is removed while holding >= 1 assignment |
 * | T3 | An item is deleted while holding an assignment (any response) |
 * | T4 | An ASK_FIELD changes on an item whose assignment has responded |
 * | T5 | A material event field changes (date/venue) |
 *
 * WHY T1 FIRES EVEN AT PENDING BUT T4 DOES NOT — this is the load-bearing asymmetry,
 * and it is what makes the typo case free:
 *
 *   - T1 withdraws or transfers the ask itself. They received it; it is now going
 *     away or moving to someone else, and Hinge §8 has the system closing the loop
 *     with whoever was released. That is worth a why regardless of whether they had
 *     got round to answering.
 *   - T4 alters what an ask SAYS. If they have not answered, nothing has been claimed
 *     against — the ask is simply corrected before they read it. Hinge §2's phrasing
 *     is precise: "a quantity someone CLAIMED AGAINST". Fixing "Pavolva" -> "Pavlova"
 *     on an unanswered item is the overwhelmingly common edit, and it must never be
 *     interrogated.
 *
 * PRE-SEND, NOTHING TOUCHES ANYONE. Moment 4 §7: "The audit trail starts at the send."
 * Nobody is owed a story about a plan nobody has seen.
 *
 * ACTOR-AGNOSTIC. This takes no actor: the why is a property of the CHANGE, not the
 * CHANGER (ruled by Nigel 2026-08-03 — "no walls anywhere, ledger is actor-agnostic").
 * A coordinator reassigning within their team owes exactly the why a host owes.
 *
 * PURE. No database, no clock, no I/O — so the 20-mutation fixture in
 * `tests/ledger-why-scope-test.ts` can assert the whole truth table directly.
 */
export function whyTrigger(change: PendingChange, event: LifecycleEvent): WhyTrigger | null {
  if (!isSent(event)) return null;

  switch (change.action) {
    // T1 — the ask itself is created, moved, or withdrawn.
    case 'CREATE_ASSIGNMENT':
    case 'MOVE_ASSIGNMENT':
    case 'DELETE_ASSIGNMENT':
      return 'T1';

    // T2 — removing a person who is holding something.
    case 'REMOVE_PERSON':
      return (change.context?.heldAssignmentCount ?? 0) >= 1 ? 'T2' : null;

    // T3 — deleting an item someone holds, at any response state.
    case 'DELETE_ITEM':
      return change.context?.assignmentResponse != null ? 'T3' : null;

    // T4 — changing what the ask SAYS, once it has been answered.
    case 'EDIT_ITEM': {
      if (!change.field || !ASK_FIELD_SET.has(change.field)) return null;
      const response = change.context?.assignmentResponse;
      if (response == null) return null; // nobody holds it
      if (response === 'PENDING') return null; // asked, not yet answered — the typo case
      return 'T4';
    }

    // T5 — date/venue. The GTC-183 (F1) re-ask hook point.
    case 'EDIT_EVENT':
      return change.field && MATERIAL_FIELD_SET.has(change.field) ? 'T5' : null;

    // Everything else is versioned and never interrogated. Enumerated explicitly
    // rather than defaulted, so a new ChangeAction is a compile error here — adding
    // one is a decision, not an omission.
    case 'CREATE_ITEM':
    case 'ADD_PERSON':
    case 'TOGGLE_CRITICAL':
    case 'CREATE_TEAM':
    case 'EDIT_TEAM':
    case 'DELETE_TEAM':
    case 'REGENERATE_PLAN':
    case 'GENERATE_PLAN':
    case 'SEND_PRESSED':
    case 'WRAP_UP_SENT':
      return null;
  }
}

/**
 * Boolean form of {@link whyTrigger}. `TOGGLE_CRITICAL` returning false is deliberate
 * and reverses today's `frozen-edit` behaviour: Moment 4 §8.3 — "criticality does
 * exactly two things (the badge, and the assistant's message at red) and touches
 * nothing else. It is entirely a host-facing signal, never a guest-facing pressure."
 */
export function touchesSomeone(change: PendingChange, event: LifecycleEvent): boolean {
  return whyTrigger(change, event) !== null;
}

/**
 * Turn a before/after object pair into one PendingChange per actually-changed field.
 *
 * Convenience so A3b's ~25 routes do not each hand-roll a diff — and so "one entry
 * per changed field" is enforced in one place. Unchanged fields produce nothing: the
 * ledger records changes, not submissions.
 */
export function fieldChanges(
  base: Omit<PendingChange, 'field' | 'before' | 'after'>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[]
): PendingChange[] {
  const changes: PendingChange[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const b = before[field];
    const a = after[field];
    if (equalish(b, a)) continue;
    changes.push({ ...base, field, before: b, after: a });
  }
  return changes;
}

/** Dates compare by instant; everything else by identity/value. */
function equalish(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) return false;
  return a === b;
}

// ─────────────────────────────────────────────────────────────────────────────
// The write path
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerActor {
  /** `null` for SYSTEM — the calendar, the cron sweep, a release notification. */
  id: string | null;
  kind: ActorKind;
  /**
   * Name at time of action. If omitted and `id` is set, it is looked up ONCE here, at
   * write time, and frozen into the row. It is never re-read afterwards: the actor may
   * be deleted (the FK is ON DELETE SET NULL), and a later rename would silently
   * rewrite history. What happened is that *Pete* was the one who couldn't do it.
   */
  name?: string | null;
}

export interface RecordChangeParams {
  eventId: string;
  actor: LedgerActor;
  changes: PendingChange[];
  /**
   * Kate's why. MAY BE NULL EVEN WHEN REQUIRED — plan §13.1, endorsed by Nigel
   * 2026-08-03. "Required" means the flow always asks, NEVER that the server rejects:
   * Moment 4 §7 forbids the product demanding justification, and Hinge §2 says the
   * reason "is not compliance — it's her own memory". A 400 would make it compliance.
   *
   * THIS FUNCTION NEVER THROWS FOR A MISSING REASON, AND NO CALLER MAY 4xx FOR ONE.
   * The omission is recorded honestly instead, as reasonRequired: true, reason: null.
   */
  reason?: string | null;
  /** Join an existing changeSet instead of opening a new one. */
  changeSetId?: string;
}

export interface RecordChangeResult {
  changeSetId: string;
  entryIds: string[];
  sequences: number[];
  /** True if ANY change in the set fired a why-scope trigger. */
  reasonRequired: boolean;
  /** Which trigger each change fired, index-aligned with `changes`. */
  triggers: (WhyTrigger | null)[];
}

/**
 * Write a changeSet to the ledger.
 *
 * ONE REQUEST = ONE CHANGESET = ONE HUMAN-VISIBLE STEP. A request that changes three
 * fields emits three rows sharing one `changeSetId` — "I renamed and re-quantified
 * the pavlova" is one step to a person and three rows to a database. Granularity
 * stays per-individual-change (Hinge §2, gap #3); the grouping is a display key, not
 * batching. The same mechanism carries the bulk case: a post-send regenerate passes N
 * changes with one reason and lands as one step (ruled (a)-now-(c)-later, 2026-08-03).
 *
 * MUST RUN INSIDE A TRANSACTION, exactly as `logAudit` does — a ledger entry that
 * survives a rolled-back write describes something that never happened
 * (`gather-architecture-contract` §7).
 *
 * MUST BE CALLED LAST, after the mutations it describes. Two reasons: the `before`
 * you pass should be read before the write, and — see below — this function takes a
 * row lock on `Event`, so calling it last keeps lock ordering consistent
 * (item/assignment locks, then event) across every caller and cannot deadlock.
 */
export async function recordChange(
  tx: Tx,
  params: RecordChangeParams
): Promise<RecordChangeResult> {
  const { eventId, actor, changes, reason = null } = params;

  if (changes.length === 0) {
    return {
      changeSetId: params.changeSetId ?? '',
      entryIds: [],
      sequences: [],
      reasonRequired: false,
      triggers: [],
    };
  }

  // The event is needed for the why-scope rule (pre-send changes never trigger) and
  // its row is the serialisation point for sequence allocation.
  //
  // SEQUENCE ALLOCATION, and why it is safe: this write takes an exclusive row lock
  // on the Event for the rest of the transaction, so any concurrent recordChange() on
  // the same event blocks here rather than racing to read the same max(sequence).
  // The @@unique([eventId, sequence]) is the backstop, not the mechanism.
  //
  // Bumping updatedAt is not merely a lock trick — it is true. The event's plan
  // changed. Nothing reads Event.updatedAt today (verified 2026-08-03), so this is
  // invisible to every consumer.
  //
  // If contention ever shows up, the cleaner form is an atomic counter column
  // (`Event.ledgerSequence` with `{ increment: n }`), which allocates and locks in one
  // operation. That is a schema change and therefore a signed-off migration, so it is
  // deliberately not done here.
  const event = await tx.event.update({
    where: { id: eventId },
    data: { updatedAt: new Date() },
    select: { status: true, sentAt: true, endDate: true },
  });

  const lifecycleEvent: LifecycleEvent = event;

  const triggers = changes.map((c) => whyTrigger(c, lifecycleEvent));
  const reasonRequired = triggers.some((t) => t !== null);

  const latest = await tx.auditEntry.findFirst({
    where: { eventId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  let nextSequence = (latest?.sequence ?? 0) + 1;

  const changeSetId = params.changeSetId ?? cuidish();

  // Name at time of action, resolved once for the whole changeSet.
  let actorName = actor.name ?? null;
  if (actorName === null && actor.id !== null) {
    const person = await tx.person.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    actorName = person?.name ?? null;
  }

  const entryIds: string[] = [];
  const sequences: number[] = [];

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const sequence = nextSequence++;

    const entry = await tx.auditEntry.create({
      data: {
        eventId,
        sequence,
        changeSetId,
        actorId: actor.id,
        actorKind: actor.kind,
        actorName,
        actionType: change.action,
        targetType: change.targetType,
        targetId: change.targetId,
        field: change.field ?? null,
        before: toJson(change.before),
        after: toJson(change.after),
        // Per-ENTRY, not per-changeSet: a set may mix a T1 reassignment with a
        // non-triggering note edit, and the ledger should say which row was owed a
        // why. The reason itself is the set's, because the host gave one answer.
        reason,
        reasonRequired: triggers[i] !== null,
      },
      select: { id: true },
    });

    entryIds.push(entry.id);
    sequences.push(sequence);
  }

  return { changeSetId, entryIds, sequences, reasonRequired, triggers };
}

/** `undefined` must become Prisma's "leave null", not the JSON string "undefined". */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

/**
 * changeSet ids are grouping keys, not security tokens — they are never guessed
 * against, only joined on. `crypto.randomUUID` keeps this dependency-free and needs no
 * database round-trip to allocate.
 */
function cuidish(): string {
  return `cs_${globalThis.crypto.randomUUID()}`;
}
