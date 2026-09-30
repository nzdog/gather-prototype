/**
 * GTC-192 (J1, phase 6, slice 6a) — THE ONE DOOR onto the arrival replay.
 *
 * The rewind is DB-bound and the derivation is pure; this is the only place they meet. Nothing
 * else in the glance imports the rewind, and `tests/glance-replay-test.ts` asserts that — one
 * door means one place where the null rule below can be got wrong, instead of one per caller.
 *
 * ── NULL IS NOT EPOCH, AND THE CHECK IS THE FIRST STATEMENT ──────────────────────────────
 *
 * A viewer with no high-water mark has never been shown this board's news. She gets NOTHING
 * and the mark is stamped (6b's job, not this module's). Treating null as a baseline —
 * `since (mark ?? epoch)` — replays the entire history of the event on her first ever visit:
 * the maximum fake-fireworks case, fired on the one visit where she has never been away.
 *
 * "NOTHING CHANGED → NOTHING PLAYS" IS A DIFFERENT RULE, and it is produced by an EMPTY DIFF
 * further down. Both end in an empty replay; they are not the same fact, and collapsing them
 * is how the null case quietly acquires a baseline.
 *
 * The branch is the first statement so the database is never reached to decide it — asserted
 * in the suite with a handle that throws on any property access.
 *
 * ⚠ 6b IS THE FIRST CALLER. The stamp route and the page both come here, and the board itself
 * still reaches none of this — no island, no animation, no polling. `GlanceBoard` does not know
 * the replay exists.
 *
 * ── AND THE MEMORY'S WRITE LIVES HERE TOO, DELIBERATELY ──────────────────────────────────
 *
 * `stampGlanceSeen` is below `readGlanceReplay` because they are two halves of one thing: what
 * news this viewer is owed, and the record that she has been shown it. 6b has TWO callers — the
 * route (a client saying "I have watched it") and the page (nothing to play, so stamp now) — and
 * a monotonic guard copied into both is a guard that can be weakened in one of them with nothing
 * failing. One definition, two doors, the same shape phase 4 used for `mayHoldRow`.
 */

import { rewindGlanceInputs, rewindGuestFacts } from './rewind';
import type { RewindDb } from './rewind';
import { deriveReplay } from './replay';
import type { GlanceReplay } from './replay';
import type { ChaseFact, DeliveryFact, EventGlance, ExhaustionFact, GlanceEvent } from './state';
import { carrierOfAsk, deliveryFactFrom } from './delivery-fact';
import { chaseFactFrom } from './chase-fact';
import { readAskPreview } from '@/lib/preflight/ask-preview';
import { exhaustionFor } from '@/lib/chase-exhaustion';
import { readChaseSpend } from '@/lib/chase-exhaustion-read';
import { isChildMembership } from '@/lib/eligibility/child-exclusion';
import { isPaceOff } from '@/lib/eligibility/nudge-pace';

/**
 * SLICE 6d — Ruling 23's overlay, RE-EXPORTED THROUGH THE DOOR RATHER THAN DEFINED BEHIND IT.
 *
 * The board has to know which reversals this viewer is still owed, and the page is the only
 * thing that can tell it — but the page reaches the replay ONLY through this module, which
 * `tests/glance-replay-test.ts` asserts ("the PAGE reaches the replay only through the one
 * door — replay-entry, never rewind or replay"). A direct import in the page would have made
 * that guard fail for a real reason and the honest fix is the door, not the guard.
 *
 * A RE-EXPORT, NOT A COPY. The rule stays in `replay.ts` beside the sort that already asks it;
 * this line only widens what the door names. It belongs here for the same reason
 * `stampGlanceSeen` does — what news is owed, the record that it was shown, and which of that
 * news the board must still be showing as red are three halves of one thing.
 */
export { stickyReversals } from './replay';

export async function readGlanceReplay(
  db: RewindDb,
  eventId: string,
  glanceSeenAt: Date | null,
  glance: EventGlance,
  event: GlanceEvent,
  now: Date
): Promise<GlanceReplay> {
  if (glanceSeenAt === null) return { steps: [] };
  const [rewound, facts, spend] = await Promise.all([
    rewindGlanceInputs(db, eventId, glanceSeenAt),
    rewindGuestFacts(db, eventId, glanceSeenAt),
    readChaseSpend(db, eventId),
  ]);
  /*
   * [[GTC-335]] — THE PAST PREVIEW: the chooser's own walk, with the guest facts recorded after
   * `since` not yet recorded. The host's side (marks, exceptions, the switch's default) is read as it
   * is now, which is Ruling 22. It replaces the present preview this door used to read for GTC-251's
   * exhaustion: that, too, is now asked of the route as at `since`.
   */
  const past = await readAskPreview(db, eventId, '', { discount: facts.later });

  const people = [...glance.households.flatMap((h) => h.members), ...glance.unhoused];
  // Ruling 22: her marks and her switch, as they are now.
  const marks = new Map(people.map((p) => [p.personEventId, p.nudgeMark as string | null]));
  const paceOff = isPaceOff(event.nudgePace);

  const deliveryAt = new Map<string, DeliveryFact | null>();
  const chaseAt = new Map<string, ChaseFact | null>();
  const exhaustionAt = new Map<string, ExhaustionFact | null>();
  const factChangedSince = new Map<string, number>();
  for (const person of people) {
    const id = person.personEventId;
    const child = isChildMembership(person.householdRole);
    const chaseRoute = past?.chase.byMembership[id];
    /*
     * The same translators `readEventGlance` asks, handed the past. A child's delivery fact is the
     * carrier's the chooser named as at `since` ([[GTC-336]] Q2, ruling point 4); no carrier, none.
     */
    const answering = child ? carrierOfAsk(past?.askRoutes[id]) : id;
    deliveryAt.set(id, answering ? deliveryFactFrom(facts.askRowAt.get(answering)) : null);
    chaseAt.set(id, chaseFactFrom(chaseRoute, marks, child, paceOff));
    /*
     * [[GTC-251]] — the same predicate asked as at `since`. Handing the past nothing would replay
     * AMBER → RED for every quiet guest on every visit.
     */
    exhaustionAt.set(id, exhaustionFor(chaseRoute, spend, glanceSeenAt));
    // Point 5: a child's facts are its carriers' — the ask's and the chase's.
    const chaseCarrier = !child
      ? null
      : chaseRoute?.kind === 'NONE'
        ? (chaseRoute.carrierId ?? null)
        : (chaseRoute?.recipientId ?? null);
    const moved = [id, answering, chaseCarrier]
      .map((m) => (m ? facts.movedSince.get(m) : undefined))
      .filter((t): t is number => typeof t === 'number');
    if (moved.length > 0) factChangedSince.set(id, Math.max(...moved));
  }
  return deriveReplay(
    glance,
    { ...rewound, exhaustionAt, deliveryAt, chaseAt, factChangedSince },
    event,
    glanceSeenAt,
    now
  );
}

/** The one write's handle — a client or a transaction, the same shape the read half takes. */
export type StampDb = RewindDb;

/**
 * Record that this viewer has been shown the board's news, up to now.
 *
 * ── RULING 20 IS A WRITE-SCOPE RULE, AND THIS IS WHERE IT IS KEPT ────────────────────────
 *
 * The memory is PER VIEWER: "the red does not mean someone must act on this — it means this
 * person changed, and that news is owed to each of them once. One-per-event would let whoever
 * opens first silently consume the other's news." So the `where` names **`userId` as well as
 * `eventId`**, and that is the invariant under test — not the choice of `updateMany`. A write
 * scoped to the event alone would stamp the co-host's row too and eat news she never saw, which
 * is the precise failure the ruling exists to prevent.
 *
 * ── WHY updateMany, WHICH LOOKS LIKE THE LOOSER CALL AND IS NOT ──────────────────────────
 *
 * `update` takes a UNIQUE where, so the monotonic guard could not live in it — the guard would
 * have to become a read-then-write, and two tabs racing between the read and the write is
 * exactly the case it exists to stop. `updateMany` lets the guard be part of the write itself.
 *
 * ── MONOTONIC, AND THE CLOCK IS OURS ─────────────────────────────────────────────────────
 *
 * `glanceSeenAt IS NULL OR glanceSeenAt < now`. A mark already ahead of the server clock is left
 * exactly where it is: moving it backwards would replay what was just watched, and moving it
 * forwards past now would silence news that has not been shown. The instant is `new Date()`
 * here and is never a parameter — nothing off the wire can reach it, which is why the route
 * reads no request at all.
 *
 * Returns whether a row actually moved, so a caller can tell a stamp from a refusal without
 * being handed the instant itself.
 */
export async function stampGlanceSeen(
  db: StampDb,
  userId: string,
  eventId: string
): Promise<boolean> {
  const now = new Date();
  const result = await db.eventRole.updateMany({
    where: {
      userId,
      eventId,
      OR: [{ glanceSeenAt: null }, { glanceSeenAt: { lt: now } }],
    },
    data: { glanceSeenAt: now },
  });
  return result.count > 0;
}
