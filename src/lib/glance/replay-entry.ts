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

import { rewindGlanceInputs } from './rewind';
import type { RewindDb } from './rewind';
import { deriveReplay } from './replay';
import type { GlanceReplay } from './replay';
import type { EventGlance, GlanceEvent } from './state';

export async function readGlanceReplay(
  db: RewindDb,
  eventId: string,
  glanceSeenAt: Date | null,
  glance: EventGlance,
  event: GlanceEvent,
  now: Date
): Promise<GlanceReplay> {
  if (glanceSeenAt === null) return { steps: [] };
  const past = await rewindGlanceInputs(db, eventId, glanceSeenAt);
  return deriveReplay(glance, past, event, glanceSeenAt, now);
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
