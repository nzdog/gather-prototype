/**
 * [[GTC-251]] — the server-side half of `chase-exhaustion.ts`: what each recipient has been sent.
 *
 * ⚠ THE ONE PLACE THE BOARD'S EXHAUSTION TOUCHES A SEND INSTANT. `tests/glance-fence.ts` denies
 * `firstNudgeSentAt` and `secondNudgeSentAt` to every glance source so the board takes a DECISION
 * rather than telemetry. This module sits outside that fence on purpose: it reads the instants,
 * `isChaseExhausted` turns them into a yes or no, and only the `ExhaustionFact` reaches the board.
 *
 * THE ROWS ARE THE RECORD. Since [[GTC-189]] slice 8b every reminder is an `OutboundMessage` row,
 * and `recordAcceptance` also stamps the membership. A stamp with no row (written before the rows
 * existed) still counts as a reminder sent, at the stamp — the sweep treats it as taken, so it is
 * never sent again, and ignoring it here would leave that guest amber for ever.
 */

import type { Prisma } from '@prisma/client';
import { resolveNudgeOffsetDays, type NudgeMark, type NudgePace } from '@/lib/nudge-cadence';
import type { ChaseLeg, ChaseLegKind, ChaseSpend } from '@/lib/chase-exhaustion';

type Db = Prisma.TransactionClient;

/** The chase's rows. The ask is not one: its failures are the delivery fact's (slice 7a). */
const CHASE_KINDS = ['CHASE_FIRST', 'CHASE_SECOND'] as const;

/** Every membership's spend on this event, keyed by `PersonEvent` id. */
export async function readChaseSpend(db: Db, eventId: string): Promise<Map<string, ChaseSpend>> {
  const [event, memberships, rows] = await Promise.all([
    db.event.findUniqueOrThrow({ where: { id: eventId }, select: { nudgePace: true } }),
    db.personEvent.findMany({
      where: { eventId },
      select: { id: true, nudgeMark: true, firstNudgeSentAt: true, secondNudgeSentAt: true },
    }),
    db.outboundMessage.findMany({
      where: { eventId, kind: { in: [...CHASE_KINDS] } },
      select: {
        personEventId: true,
        kind: true,
        createdAt: true,
        acceptedAt: true,
        rejectedAt: true,
        withheldAt: true,
      },
    }),
  ]);

  const legsOf = new Map<string, ChaseLeg[]>();
  for (const r of rows) {
    const legs = legsOf.get(r.personEventId) ?? [];
    legs.push({
      kind: r.kind as ChaseLegKind,
      createdAt: r.createdAt,
      spentAt: r.acceptedAt ?? r.rejectedAt ?? r.withheldAt ?? null,
    });
    legsOf.set(r.personEventId, legs);
  }

  const spend = new Map<string, ChaseSpend>();
  for (const m of memberships) {
    const legs = legsOf.get(m.id) ?? [];
    const stamped: Array<[ChaseLegKind, Date | null]> = [
      ['CHASE_FIRST', m.firstNudgeSentAt],
      ['CHASE_SECOND', m.secondNudgeSentAt],
    ];
    for (const [kind, at] of stamped) {
      if (at && !legs.some((l) => l.kind === kind)) legs.push({ kind, createdAt: at, spentAt: at });
    }
    spend.set(m.id, {
      cadenceLength: resolveNudgeOffsetDays({
        person: { nudgeMark: m.nudgeMark as NudgeMark | null },
        event: { nudgePace: event.nudgePace as NudgePace | null },
      }).length,
      legs,
      // ANCHOR(GTC-251 slice 251c): the hand-back's storage lands with its migration.
      handBack: null,
    });
  }
  return spend;
}
