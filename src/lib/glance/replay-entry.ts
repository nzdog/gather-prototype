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
 * ⚠ NOTHING CALLS THIS IN 6a. The board is byte-identical to what phase 4 shipped: no route,
 * no island, no page change. 6b is the first caller.
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
