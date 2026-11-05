import type { PrismaClient } from '@prisma/client';
import { hasAnyPlan, momentTwoBegun } from '@/lib/setup/entry-stage';

/**
 * [[GTC-454]] — THE DEMO TALLY: how far each sample got, counted just before the clean-up deletes
 * it. Founder decisions, 5 Nov 2026 (run sheet L1-D3): "I also want to understand who interacts
 * with the demo and if they come back for a paid event"; "Option 1 for demo count" — one line of
 * totals in the server log, read in Railway, no database change.
 *
 * LISTENING, NOT WATCHING. A sample is read only when it is finished: its two-hour visit is over
 * and the clean-up is about to delete it. Nothing is read while a visitor is using it.
 *
 * NO ONE IN THE PICTURE. The reading is counts and yes/no facts only. It never reads a name, an
 * address, a token value, a visitor tag, or a link-open's metadata. The log line carries totals
 * across the samples one run deletes; a run that deletes a single sample prints that sample's own
 * counts, with no id, name or address. That is accepted: the line stays in the private server log,
 * and the fewer-than-5 rule is for numbers shared outside (founder ruling, 5 Nov 2026, option A).
 *
 * NEVER IN THE WAY OF A DELETE. The reading is its own read, outside the copy's delete
 * transaction. If it fails, the copy is still deleted and counted as unread.
 *
 * What a sample saves, checked against the code on 5 Nov 2026:
 *   - it starts empty (`src/lib/demo/copy.ts`), so how far it got is its own work;
 *   - the guest view opens a sample guest's own link, and the first open stamps
 *     `AccessToken.openedAt` (`src/app/api/p/[token]/route.ts`); no demo code pre-stamps it;
 *   - pressing send writes nothing on a sample, and the pretend send records nothing
 *     (`src/lib/demo/pretend-send.ts`), so neither can be counted here;
 *   - errors go to the server log only, so they cannot be counted here either.
 */

export interface CopyReading {
  /** Any guest added beyond the host's own row. */
  addedGuests: boolean;
  /** "What's the plan?" begun: the setup screen's own rule, or a plan of any kind. */
  reachedM2: boolean;
  /** The plan approved. */
  reachedM3: boolean;
  /** The plan held, so the pre-flight was open to them. */
  reachedM4: boolean;
  /** A guest link on the sample was opened at least once. */
  guestView: boolean;
  /** Host saves in the sample's history. */
  saves: number;
}

/** Read one sample. Counts and yes/no facts only. */
export async function readCopy(db: PrismaClient, eventId: string): Promise<CopyReading | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, isDemo: true },
    select: {
      hostId: true,
      transitionedToConfirmingAt: true,
      setup: { select: { eventType: true, invitesOnly: true, planApprovedAt: true } },
    },
  });
  if (!event) return null;
  const [guests, teamCount, items, opened, saves] = await Promise.all([
    db.personEvent.count({ where: { eventId, personId: { not: event.hostId } } }),
    db.team.count({ where: { eventId } }),
    db.item.findMany({ where: { team: { eventId } }, select: { source: true } }),
    db.accessToken.count({ where: { eventId, scope: 'PARTICIPANT', openedAt: { not: null } } }),
    db.auditEntry.count({ where: { eventId, actorKind: 'HOST' } }),
  ]);
  return {
    addedGuests: guests > 0,
    reachedM2: momentTwoBegun(event.setup) || hasAnyPlan(items, teamCount),
    reachedM3: event.setup?.planApprovedAt != null,
    reachedM4: event.transitionedToConfirmingAt != null,
    guestView: opened > 0,
    saves,
  };
}

export interface DemoTally {
  samples: number;
  addedGuests: number;
  reachedM2: number;
  reachedM3: number;
  reachedM4: number;
  guestView: number;
  saves: number[];
  deletedByVisitor: number;
  unread: number;
}

export function emptyTally(): DemoTally {
  return {
    samples: 0,
    addedGuests: 0,
    reachedM2: 0,
    reachedM3: 0,
    reachedM4: 0,
    guestView: 0,
    saves: [],
    deletedByVisitor: 0,
    unread: 0,
  };
}

/** Add one deleted sample's reading. A null reading still counts as a sample, as unread. */
export function addReading(t: DemoTally, r: CopyReading | null): void {
  t.samples++;
  if (!r) {
    t.unread++;
    return;
  }
  if (r.addedGuests) t.addedGuests++;
  if (r.reachedM2) t.reachedM2++;
  if (r.reachedM3) t.reachedM3++;
  if (r.reachedM4) t.reachedM4++;
  if (r.guestView) t.guestView++;
  t.saves.push(r.saves);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The one log line per run. Totals only. */
export function tallyLine(t: DemoTally): string {
  const m = median(t.saves);
  return (
    `[demo-tally] samples ${t.samples}; added guests ${t.addedGuests}; reached M2 ` +
    `${t.reachedM2}, M3 ${t.reachedM3}, M4 ${t.reachedM4}; guest view ${t.guestView}; ` +
    `saves median ${m ?? 'none'}; deleted by visitor ${t.deletedByVisitor}; unread ${t.unread}`
  );
}
