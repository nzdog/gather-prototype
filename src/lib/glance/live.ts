/**
 * GTC-192 (J1, phase 6, slice 6e) — THE LIVE HALF, decided.
 *
 * Ruling 10: "live updates by polling, roughly every 20 seconds. A strip flipping within 20
 * seconds of the truth still feels live; the spark does the work." This module is that ruling
 * as two things — a number and a difference.
 *
 * PURE. No Prisma, no DOM, no clock, no `fetch`. `GlanceLive.tsx` owns the timer and the
 * repaint; this owns what a poll MEANS. Held apart so the meaning can be asserted directly
 * rather than scraped out of a browser — `tests/glance-replay-test.ts` layer 1e.
 *
 * ── THE LIVE DIFF NEEDS NO LEDGER AT ALL, AND THAT IS THE SLICE'S BIGGEST SIMPLIFICATION ───
 *
 * The arrival replay had to reconstruct a board nobody was looking at, which is why 6a needed
 * `AuditEntry`, positive evidence, a decide-by clock and an ambiguous set. **None of that is
 * here.** The client already HAS the previous board — it is the one on the screen — so the
 * live diff is two payloads and a comparison. `rewind.ts` is arrival-only and this module does
 * not import it, or `replay-entry.ts`, or anything that touches a database.
 *
 * ⚠ AND THIS IS NOT RULING 28's BUG RETURNING. Ruling 28 forbids inferring A GUEST'S CHANGE
 * from a difference between two states nobody watched: *"no change is ever inferred from a
 * difference alone"*, and the `PENDING` default invented the difference. What is inferred here
 * is something else and weaker — WHAT THIS VIEWER WAS SHOWN CHANGE, between a board she was
 * looking at and the board that replaced it under her eyes. **The showing is the positive
 * evidence**, and it is evidence the rewind can never have, because the rewind's subject was
 * away. Written down here rather than left to a future reader, who would otherwise recognise
 * the shape and not the difference.
 *
 * ── WHAT IT CANNOT DO, SO NOBODY LOOKS FOR IT HERE ────────────────────────────────────────
 *
 * A diff keyed on `personEventId` can only speak about people who were on BOTH boards. A guest
 * added to the event between polls is not a flip, and neither is one removed — see
 * `diffLive`. That is a limitation and it is stated at the site rather than papered over.
 */

import { isSparkTransition } from './replay';
import type { EventGlance, PersonState } from './state';

/**
 * RULING 10, TAKEN LITERALLY: "polling, roughly every 20 seconds."
 *
 * Named once, and asserted to be the ONLY polling interval on the surface. A literal at the
 * `setInterval` call site would be a second definition of the ruling, free to be tuned by
 * someone who never read it — and the house idiom it follows
 * (`src/components/plan/InviteStatusSection.tsx`, 30s) shows exactly how a bare number reads
 * when you meet it later: as a preference rather than as a decision.
 */
export const GLANCE_POLL_MS = 20_000;

/**
 * RULING 25's other half: "an action must trigger an immediate refresh rather than waiting up
 * to 20s for the next poll."
 *
 * A DOM EVENT, NOT A CALL, and the reason is the architecture the board already has. The
 * person surface (a red strip's modal) and the live poller are two separate islands beside a
 * SERVER-rendered board — there is no shared React tree to hang a callback on, and giving them
 * one would mean hydrating the board, which is phase 2's no-hooks property and a ruling to
 * retire. An event on `window` is the seam that already exists between them.
 *
 * ⚠ IT IS NOT A REQUEST. `actions.ts` names two endpoints and owns none; the refresh is this
 * page telling itself to look again, through the poll it already has. `tests/glance-actions-test.ts`
 * asserts the action layer still names no glance path, in both directions.
 */
export const GLANCE_REFRESH_EVENT = 'gather:glance-refresh';

/**
 * The arrival replay announcing that it has finished AND stamped.
 *
 * ⚠ POLLING MUST NOT START BEFORE THIS. A poll landing mid-replay repaints the board underneath
 * the animation — the true board arriving on top of the past one, halfway through the walk
 * forward — which is a glitch rather than a replay, and it would also stamp news the walk had
 * not reached yet. "Completed and stamped" is two things and this fires after both.
 */
export const GLANCE_REPLAY_DONE_EVENT = 'gather:glance-replay-done';

/**
 * One person's live movement.
 *
 * FOUR FIELDS, AND THE SAME FOUR AS `ReplayStep` — deliberately, and asserted. The allowlist
 * §5 layer 2 puts on the arrival step exists because "a denylist can only ban what someone
 * thought of"; a live carrier with a fifth field would be the same hazard through a door the
 * allowlist does not watch. So the live carrier is the same shape, and it carries ORDER only in
 * the sense that an array has order — never time.
 */
export interface LiveFlip {
  personEventId: string;
  from: PersonState;
  to: PersonState;
  /** TRUE ONLY FOR AMBER → GREEN, through `isSparkTransition`. One definition, asked twice. */
  spark: boolean;
}

/**
 * Every person on the board and the state they are in, keyed by `personEventId`.
 *
 * HOUSED AND UNHOUSED ALIKE. `EventGlance.unhoused` is not an edge case — phase 1 records that
 * most `PersonEvent.householdId` values in `gather_dev` are null — so a live diff that read
 * only `households` would silently never spark for the majority of a real board.
 */
export function liveStates(glance: EventGlance): Map<string, PersonState> {
  const states = new Map<string, PersonState>();
  for (const household of glance.households) {
    for (const person of household.members) states.set(person.personEventId, person.state);
  }
  for (const person of glance.unhoused) states.set(person.personEventId, person.state);
  return states;
}

/**
 * What moved between two boards she was shown.
 *
 * ⚠ EVERY CHANGE IS RETURNED, AND ONLY AMBER → GREEN SPARKS. This is the one place a careless
 * reader will copy the wrong thing from `deriveReplay`, so it is written out:
 *
 *   `deriveReplay` DROPS every step that is not GREEN, RED or a reversal (Ruling 26 — "good
 *   news and reds play; everything else is the new board arriving without ceremony"). It can
 *   afford to, because underneath the arrival replay the server has already rendered the TRUE
 *   board: a step it drops is a strip it simply never touches, and the truth is what stays.
 *
 *   LIVE HAS NO SUCH UNDERNEATH. The DOM is the OLD board. Dropping a GREEN → AMBER here would
 *   leave a strip sitting on good news that is no longer true — MANUFACTURED GOOD NEWS, which
 *   Ruling 28 names as "the one failure this feature cannot have."
 *
 * So Ruling 26 is honoured the other way round: everything is APPLIED, and "without ceremony"
 * is carried by `spark` being false — the 0.7s colour transition and nothing else. As 6c put
 * it, "quietly is not a shorter burst; it is no burst."
 *
 * NO ORDER IS IMPOSED, and there is nothing to impose one for. The arrival replay stages its
 * steps because it is telling the story of a period she missed, and Ruling 6 wants the reversal
 * to land last so the replay ends on the truth. Live news is not a story: it happened, she is
 * here, and it all arrives in the same tick. There is no schedule in the live path at all.
 *
 * ⚠ MEMBERSHIP IS NOT A FLIP. A key present in one map and not the other is a person who joined
 * or left the event between polls, not a person whose state moved. There is no strip on the
 * board for the first and no honest `from` for the second, so both are skipped — and the board
 * disagreeing with a changed roster until the next full load is recorded as a known gap rather
 * than half-fixed here.
 */
/**
 * RULING 30 (2026-09-10) — WHEN A LIVE SPARK MAY MOVE THE MARK.
 *
 * > A live spark stamps ONLY IF no non-spark change has repainted since the last stamp.
 *
 * ── WHY, BECAUSE THE MECHANISM IS THE WHOLE ARGUMENT ──────────────────────────────────────
 *
 * `glanceSeenAt` is a SINGLE INSTANT on `EventRole`, not a per-person cursor. So a stamp does
 * not mark one flip as shown — it marks EVERYTHING BEHIND IT as shown. A spark that stamps
 * therefore carries past the mark any red or reversal that repainted quietly and stamped
 * nothing of its own, and that news is then gone from tomorrow's rewind, silently.
 *
 * That is 6b's own named failure — *"silently, with no way to know what she missed"* — arriving
 * through a door that ruling did not consider. **Losing news is the one failure this screen
 * cannot have**, and every ruling on this surface points at repeating rather than losing.
 *
 * ⚠ RULING 24 STANDS AND IS NOT WEAKENED. `glanceSeenAt` is still the high-water mark of news
 * this viewer has been shown, arrival or live. This narrows WHEN the stamp fires, not what the
 * mark MEANS: the debt is the statement that a spark's stamp would carry more than the spark
 * past the mark.
 *
 * ⚠ AND ONLY WITH THIS IS "IT FAILS TOWARD REPEATING" TRUE. Under a bare spark-only rule it was
 * NOT true and must not be recorded as though it were: a spark at 12:04 swallowed a red that
 * repainted at 12:03. With the debt it is true, and it is true because of this function.
 *
 * ── THE DEBT IS ONE BOOLEAN, AND IT IS SESSION-LOCAL BY DESIGN ────────────────────────────
 *
 * No schema, no route change, no second write path, no second classifier — the classifier is
 * `!flip.spark`, which already exists. It lives in a ref on the island for the life of the page
 * and clears when a stamp actually happens. **In practice that makes it a one-way latch within
 * a session**, because a stamp requires no debt: once a quiet change repaints, no live spark
 * stamps again until the next page load. That is bounded and correct — the next arrival replays
 * everything owed, completes, and stamps, which is what clears it.
 *
 * ⚠ WHAT IT COSTS, STATED: a spark she certainly watched may replay tomorrow, whenever a quiet
 * change landed beside it. That is the direction 6b ruled safe — *"Repeating is the safe
 * direction; losing is not."*
 *
 * ⚠ THE SHAPE A FUTURE TICKET WOULD TAKE IF THIS PROVES INSUFFICIENT — recorded, NOT built. A
 * PER-PERSON CURSOR is the complete fix: the mark becomes a set rather than an instant, so a
 * spark consumes only its own news and a red keeps owing. It is a schema change, it is out of
 * GTC-192's scope, and it should be reached for only if the boolean is observed to suppress
 * stamps so often that the arrival replay starts repeating news she has plainly seen.
 *
 * ── PURE, ON PURPOSE ──────────────────────────────────────────────────────────────────────
 *
 * Every other way of writing this — a boolean read inside an effect, the condition spelled out
 * at the call site — is a rule that can only be exercised in a browser, and this ticket has
 * caught that confusion in three slices. Here it is a function over (what actually painted,
 * what is owed) and the island's only say in it is to call it.
 *
 * ⚠ IT TAKES WHAT PAINTED, NOT WHAT THE DIFF FOUND. A flip whose strip was not on the board was
 * shown to nobody: it neither sparks nor owes a debt. Manufacturing a debt out of a diff nobody
 * saw would suppress stamps for news that never reached the screen.
 */
export function liveStampDecision(
  painted: readonly LiveFlip[],
  quietDebtBefore: boolean
): { stamp: boolean; quietDebtAfter: boolean } {
  const owed = quietDebtBefore || painted.some((flip) => !flip.spark);
  const stamp = painted.some((flip) => flip.spark) && !owed;
  // A stamp clears the debt: the mark has just moved, so nothing is owed behind it any more.
  // (Given the guard above this is already false when `stamp` is true — written out so the
  // function says "since the last stamp" rather than leaving it to be inferred.)
  return { stamp, quietDebtAfter: stamp ? false : owed };
}

export function diffLive(
  previous: ReadonlyMap<string, PersonState>,
  next: ReadonlyMap<string, PersonState>
): LiveFlip[] {
  const flips: LiveFlip[] = [];
  for (const [personEventId, to] of next) {
    const from = previous.get(personEventId);
    // Not on the previous board: joined between polls. Not a flip — see above.
    if (from === undefined) continue;
    // The no-op rule, live. Nothing moved, so nothing is said about it.
    if (from === to) continue;
    flips.push({ personEventId, from, to, spark: isSparkTransition(from, to) });
  }
  return flips;
}
