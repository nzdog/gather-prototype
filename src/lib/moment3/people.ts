/**
 * [[GTC-355]] — Moment 3's people panel, from what the screen already loads.
 *
 * Pure and client-safe. The inputs are the wire shapes of `GET /api/events/[id]/households`
 * (members with their membership columns and `person`) and `GET /api/events/[id]/items`
 * (each item with `assignment.person`), read as loosely as the screen needs them.
 *
 * WHO APPEARS: every member of a Moment 1 household — the document's "Kate's guest list from
 * Moment 1" (founder ruling Q13: people with no household are not shown). Kids without jobs
 * are a household's `littleCount`, not people, so they never appear. Kids with jobs are
 * members and appear. The host appears like anyone (Q12).
 *
 * UNPLACED ("nothing yet"): holding nothing and not marked "Just attending". A marked person
 * who is later given something counts it and is simply not unplaced; the mark stays until
 * they hold nothing again.
 */

import { assignedCounter, peopleWithNothing } from './words';

export interface PanelMemberInput {
  personId: string;
  /** `PersonEvent.role`. */
  role: string;
  householdRole: string | null;
  isYoungPerson?: boolean;
  justAttending?: boolean;
  person: { id: string; name: string };
}

export interface PanelHouseholdInput {
  id: string;
  littleCount?: number;
  members: PanelMemberInput[];
}

export interface PanelItemInput {
  id: string;
  kind?: string;
  assignment: { person: { id: string } } | null;
}

export type PanelIcon = '👫' | '👦' | '👤';

export interface PanelPersonRow {
  personId: string;
  name: string;
  icon: PanelIcon;
  isHost: boolean;
  isKidWithJob: boolean;
  justAttending: boolean;
  /** Items held, real assignments only — never a suggestion. */
  count: number;
  /** Unplaced: holding nothing and not marked "Just attending". */
  nothingYet: boolean;
}

/** GTC-172: "kid with a job" is CHILD, or a young person the host roled as an adult. */
function isKidWithJob(m: PanelMemberInput): boolean {
  return m.householdRole === 'CHILD' || m.isYoungPerson === true;
}

/** Primary contact, partner, kids, guests — the order Moment 1's card lists them in. */
function rank(m: PanelMemberInput): number {
  if (m.householdRole === 'PRIMARY_CONTACT') return 0;
  if (m.householdRole === 'PARTNER') return 1;
  if (isKidWithJob(m)) return 2;
  return 3;
}

export function buildPeoplePanel(
  households: readonly PanelHouseholdInput[],
  items: readonly PanelItemInput[],
  hostPersonId: string | null
): PanelPersonRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const holder = item.assignment?.person.id;
    if (holder) counts.set(holder, (counts.get(holder) ?? 0) + 1);
  }

  const rows: PanelPersonRow[] = [];
  for (const household of households) {
    const ordered = household.members
      .map((m, i) => ({ m, i }))
      .sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i)
      .map(({ m }) => m);
    for (const m of ordered) {
      const count = counts.get(m.personId) ?? 0;
      const justAttending = m.justAttending === true;
      const kid = isKidWithJob(m);
      rows.push({
        personId: m.personId,
        name: m.person.name,
        icon: m.householdRole === 'PARTNER' ? '👫' : kid ? '👦' : '👤',
        isHost: m.personId === hostPersonId || m.role === 'HOST',
        isKidWithJob: kid,
        justAttending,
        count,
        nothingYet: count === 0 && !justAttending,
      });
    }
  }
  return rows;
}

export function unplacedCount(rows: readonly PanelPersonRow[]): number {
  return rows.filter((r) => r.nothingYet).length;
}

/** W2, the line that heads the people panel. */
export function unplacedLine(rows: readonly PanelPersonRow[]): string {
  return peopleWithNothing(unplacedCount(rows));
}

/** The document's counter over the plan's rows. */
export function assignedCounterLine(items: readonly PanelItemInput[]): string {
  return assignedCounter(items.filter((i) => i.assignment !== null).length, items.length);
}
