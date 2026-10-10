/**
 * [[GTC-251]] (E6) — HAS THE CHASE RUN OUT OF MOVES?
 *
 * GTC-305's principle: amber means Gather is chasing someone, and nobody else is amber. When the
 * last reminder has had its fair chance and nothing came back, Gather has no next move, and the
 * board's red ("gone quiet") says the guest is now the host's.
 *
 * Founder ruling Q2 (2026-09-29): *"The last reminder gets a fair chance: the same gap Gather
 * leaves between its two reminders. They stay amber for those three days, because that reminder is
 * still working, then turn red. The same three days would follow any extra reminders you give
 * them."* — whatever the pace.
 *
 * ── NO CADENCE IS NOT A SPENT CADENCE ────────────────────────────────────────────────────────
 *
 * GTC-179's recorded warning, absorbed here: a DONT_CHASE person, and everyone on an OFF event,
 * resolves to an empty cadence from moment zero. Reading that as "spent" would turn the person the
 * host asked Gather to leave alone red the instant she said so. An empty cadence is never
 * exhausted.
 *
 * ── A DECISION, NOT TELEMETRY ────────────────────────────────────────────────────────────────
 *
 * The board takes `ExhaustionFact` and never the send instants (`tests/glance-fence.ts` denies the
 * stamps to every glance source for exactly this reason). The instants are read server-side by
 * `readChaseSpend` in `chase-exhaustion-read.ts` and consumed here; nothing dated leaves.
 *
 * Client-safe and pure: no Prisma, no clock of its own. `now` is always handed in, so the same
 * predicate answers for the present board and for the replay's past (`since`).
 */

import type { ChaseRoute } from '@/lib/eligibility/channel-chooser';
import type { ExhaustionFact } from '@/lib/glance/state';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Q2's three days, in hours, so the boundary is an instant and never an end-of-day reading (the
 * divergence GTC-192 recorded under Ruling 15 is the lesson). The hand-back's spacing is the same
 * three days (Q3), and slice 251c reads this same constant for it.
 */
export const GONE_QUIET_AFTER_HOURS = 72;

/** The chase's own kinds. `CHASE_MORE` is the hand-back's further reminder (slice 251c). */
export type ChaseLegKind = 'CHASE_FIRST' | 'CHASE_SECOND' | 'CHASE_MORE';

/** The cadence's legs in order: leg 0 is the first reminder, leg 1 the second. */
const CADENCE_KINDS: readonly ChaseLegKind[] = ['CHASE_FIRST', 'CHASE_SECOND'];

/**
 * One reminder as the predicate needs it.
 *
 * `spentAt` is the instant the row reached an end state — accepted, finally rejected, or withheld —
 * and null while it is still in flight (never attempted, or waiting on a retry). A reminder that
 * was rejected or withheld counts as spent: Gather has no further move with it either way.
 */
export interface ChaseLeg {
  kind: ChaseLegKind;
  createdAt: Date;
  spentAt: Date | null;
}

/** The host's latest hand-back (Q3): how many further reminders, and from when. */
export interface ChaseHandBack {
  reminders: number;
  at: Date;
}

/** Everything the predicate reads for one recipient membership. */
export interface ChaseSpend {
  /** `resolveNudgeOffsetDays(...).length` for the recipient: 0, 1 or 2. */
  cadenceLength: number;
  legs: readonly ChaseLeg[];
  handBack: ChaseHandBack | null;
}

/**
 * Is this recipient's chase exhausted, as at `now`?
 *
 * "As at" is exact: a leg created after `now` did not exist then, and a leg spent after `now` was
 * still in flight then. That is what lets the replay ask the same question of the past.
 */
export function isChaseExhausted(spend: ChaseSpend | undefined, now: Date): boolean {
  if (!spend || spend.cadenceLength <= 0) return false;

  const t = now.getTime();
  const visible = spend.legs.filter((l) => l.createdAt.getTime() <= t);
  const spentBy = (l: ChaseLeg) => l.spentAt !== null && l.spentAt.getTime() <= t;

  // Anything still in flight is a move Gather has not finished making.
  if (visible.some((l) => !spentBy(l))) return false;

  const handBack = spend.handBack;
  /*
   * [[GTC-350]] plan ruling Q-C — WHILE A HAND-BACK IS IN FORCE, ITS COUNT IS ALL GATHER SENDS. A
   * guest handed back from a reply mid-cadence is sent no first or second reminder after it
   * (`findNudgeCandidates`), so their silence is spent once the further reminders are. From "gone
   * quiet" nothing changes: both cadence legs were always sent before that red.
   */
  if (!handBackInForce(spend, now)) {
    for (const kind of CADENCE_KINDS.slice(0, spend.cadenceLength)) {
      if (!visible.some((l) => l.kind === kind)) return false;
    }
  }

  if (handBack && handBack.at.getTime() <= t) {
    const since = handBack.at.getTime();
    const more = visible.filter((l) => l.kind === 'CHASE_MORE' && l.createdAt.getTime() >= since);
    if (more.length < handBack.reminders) return false;
  }

  // Q2: three days after the LAST reminder the guest actually got — so a mid-flight pace change
  // still waits after the later one.
  const last = Math.max(...visible.map((l) => l.spentAt!.getTime()));
  return t > last + GONE_QUIET_AFTER_HOURS * HOUR_MS;
}

/**
 * [[GTC-350]] plan ruling Q-C — is a hand-back in force at `now`? While one is, the sweep sends no
 * first or second reminder and the board's nudge day is the hand-back's own next leg.
 */
export function handBackInForce(
  spend: Pick<ChaseSpend, 'handBack'> | undefined,
  now: Date
): boolean {
  return !!spend?.handBack && spend.handBack.at.getTime() <= now.getTime();
}

/**
 * [[GTC-251]] Q3 — WHEN THE NEXT FURTHER REMINDER IS DUE, or null when none is owed.
 *
 * *"The first goes out next, the rest three days apart."* So the first is due at the hand-back
 * itself, and each later one `GONE_QUIET_AFTER_HOURS` after the previous further reminder's own end
 * instant — the same three days, counted the same way, as the red. Null when there is no hand-back
 * in force, when every leg asked for exists (the cap), or while a reminder is still in flight: one
 * move at a time.
 */
export function nextHandBackLegAt(spend: ChaseSpend | undefined, now: Date): Date | null {
  const handBack = spend?.handBack;
  if (!spend || !handBack) return null;
  const t = now.getTime();
  const since = handBack.at.getTime();
  if (since > t) return null;

  const visible = spend.legs.filter((l) => l.createdAt.getTime() <= t);
  if (visible.some((l) => l.spentAt === null || l.spentAt.getTime() > t)) return null;

  const more = visible.filter((l) => l.kind === 'CHASE_MORE' && l.createdAt.getTime() >= since);
  if (more.length >= handBack.reminders) return null;
  if (more.length === 0) return handBack.at;
  const last = Math.max(...more.map((l) => l.spentAt!.getTime()));
  return new Date(last + GONE_QUIET_AFTER_HOURS * HOUR_MS);
}

/** Is a further reminder due now? The sweep's question (`findNudgeCandidates`). */
export function handBackLegDue(spend: ChaseSpend | undefined, now: Date): boolean {
  const next = nextHandBackLegAt(spend, now);
  return next !== null && next.getTime() <= now.getTime();
}

/**
 * The next further reminder for a membership's route, for the reading panel's nudge day (GTC-192
 * Ruling 34: the system's own promise about what it will do next). Gated on the chooser as
 * `exhaustionFor` is.
 */
export function handBackNextFor(
  route: ChaseRoute | undefined,
  spendByRecipient: ReadonlyMap<string, ChaseSpend>,
  now: Date
): Date | null {
  if (!route || route.kind === 'NONE') return null;
  return nextHandBackLegAt(spendByRecipient.get(route.recipientId), now);
}

/**
 * The board's fact for one membership.
 *
 * GATED ON THE CHOOSER. A route of NONE means Gather will not chase this person at all — marked,
 * opted out, handed over, or unreachable — and each of those has its own colour on the board, so
 * none of them may read "gone quiet". Null only where there is no route: the host.
 *
 * A child's route is CARRIED and names the carrier: the reminders went to the carrier, so the
 * carrier's spend answers for the child, the shape ruling S gave the delivery fact.
 */
export function exhaustionFor(
  route: ChaseRoute | undefined,
  spendByRecipient: ReadonlyMap<string, ChaseSpend>,
  now: Date
): ExhaustionFact | null {
  if (!route) return null;
  if (route.kind === 'NONE') return { exhausted: false };
  return { exhausted: isChaseExhausted(spendByRecipient.get(route.recipientId), now) };
}
