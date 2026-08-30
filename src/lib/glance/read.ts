/**
 * GTC-192 (J1, phase 1) — the person-keyed read.
 *
 * Moment 4 §10.8 fixes the shape before any screen exists: "People are the boxes; items
 * live inside the person." The chosen design (`docs/design/moment4-glance-reference.md`)
 * keeps that and changes the geometry — card = household = channel, strip = person =
 * state — so the payload groups people by household and gives the household no colour.
 *
 * ── WHY THIS IS A MODULE AND NOT AN HTTP ROUTE ────────────────────────────────
 *
 * "Where the screen lives — its route and entry point" is recorded on this ticket as still
 * open. A route here would answer half of it by accident, and phase 1's own line is "no
 * UI". Phase 2's server component calls this directly; when the route is ruled, it is a
 * wrapper over `readEventGlance` rather than a second assembly.
 *
 * ── THE SELECT IS THE FENCE ───────────────────────────────────────────────────
 *
 * Ruling 1 fences the replay to state changes, "never behaviour. No opens, no views, no
 * hesitations, ever." Applied from birth rather than from phase 6: a payload that already
 * carries the field only needs somebody to render it. Every read below is an explicit
 * `select` — never an `include` — so no whole row can spread in, and
 * `tests/glance-read-test.ts` asserts both the absence of the denied names in this source
 * and the absence of `include:` itself.
 *
 * `PersonEvent.sentAt` is read and is not a breach: it records when GATHER SENT, which is
 * the anchor E1's cadence counts from. What the fence excludes is what the GUEST did.
 */

import type { Prisma } from '@prisma/client';
import {
  decideByAtFor,
  derivePersonState,
  deriveItemState,
  memberRank,
  nextNudgeFor,
  summarisePeople,
  type EventGlance,
  type GlanceEvent,
  type GlanceHousehold,
  type GlanceItemInput,
  type GlancePerson,
} from './state';

/** Accepts a client or a transaction, the shape `createHostHousehold` already takes. */
type Db = Prisma.TransactionClient;

/** A person is on the board if they are on the event. Roles do not gate the guest list. */
const PERSON_EVENT_SELECT = {
  id: true,
  personId: true,
  role: true,
  householdId: true,
  householdRole: true,
  nudgeMark: true,
  attendanceAnswer: true,
  sentAt: true,
  person: { select: { id: true, name: true } },
} satisfies Prisma.PersonEventSelect;

const ASSIGNMENT_SELECT = {
  id: true,
  personId: true,
  response: true,
  item: {
    select: {
      id: true,
      name: true,
      critical: true,
      dropOffAt: true,
      decideByOffsetHours: true,
    },
  },
} satisfies Prisma.AssignmentSelect;

/**
 * The whole board for one event, as of `now`.
 *
 * @param now injected so the decide-by and cadence boundaries are testable exactly, the
 *   convention `isDecideByExpired` and `dueNudgeIndices` both take.
 */
export async function readEventGlance(
  db: Db,
  eventId: string,
  now: Date = new Date()
): Promise<EventGlance> {
  const event = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      status: true,
      sentAt: true,
      endDate: true,
      decideByOffsetHours: true,
      nudgePace: true,
    },
  });

  const glanceEvent: GlanceEvent = {
    status: event.status,
    sentAt: event.sentAt,
    endDate: event.endDate,
    decideByOffsetHours: event.decideByOffsetHours,
    nudgePace: event.nudgePace,
  };

  const [memberships, assignments, households] = await Promise.all([
    db.personEvent.findMany({ where: { eventId }, select: PERSON_EVENT_SELECT }),
    db.assignment.findMany({
      where: { item: { team: { eventId } } },
      select: ASSIGNMENT_SELECT,
    }),
    db.household.findMany({
      where: { eventId },
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  // Rows are keyed by Person, not by PersonEvent (`Assignment.personId` is a Person id),
  // so they are grouped once here rather than re-scanned per member.
  const heldBy = new Map<string, GlanceItemInput[]>();
  for (const a of assignments) {
    const held = heldBy.get(a.personId) ?? [];
    held.push({
      itemId: a.item.id,
      assignmentId: a.id,
      name: a.item.name,
      critical: a.item.critical,
      response: a.response,
      item: { dropOffAt: a.item.dropOffAt, decideByOffsetHours: a.item.decideByOffsetHours },
    });
    heldBy.set(a.personId, held);
  }

  function toPerson(row: (typeof memberships)[number]): GlancePerson {
    const isHost = row.personId === event.hostId || row.role === 'HOST';
    const items = heldBy.get(row.personId) ?? [];
    const context = {
      isHost,
      // ANCHOR(GTC-251): exhaustion has no source until E6 lands. NULL says "no signal",
      // which is a different claim from "not exhausted" — see ExhaustionFact in state.ts.
      exhaustion: null,
    };
    const { state, reasons } = derivePersonState(
      {
        ...context,
        nudgeMark: row.nudgeMark,
        attendanceAnswer: row.attendanceAnswer,
        items,
      },
      glanceEvent,
      now
    );

    return {
      personEventId: row.id,
      personId: row.personId,
      name: row.person.name,
      isHost,
      householdRole: row.householdRole,
      state,
      reasons,
      nextNudgeAt: nextNudgeFor(row.sentAt, row.nudgeMark, glanceEvent, now)?.toISOString() ?? null,
      items: items.map((i) => {
        const derived = deriveItemState(i, glanceEvent, context, now);
        return {
          itemId: i.itemId,
          assignmentId: i.assignmentId,
          name: i.name,
          critical: i.critical,
          state: derived.state,
          reason: derived.reason,
          decideByAt: decideByAtFor(i.response, i.item, glanceEvent),
        };
      }),
    };
  }

  const people = memberships.map(toPerson);
  const byId = new Map(memberships.map((row, i) => [row.id, people[i]]));

  const hostHouseholdId =
    memberships.find((row) => row.personId === event.hostId)?.householdId ?? null;

  const cards: GlanceHousehold[] = households.map((hh) => {
    const members = memberships
      .filter((row) => row.householdId === hh.id)
      .sort(
        (a, b) =>
          memberRank(a.householdRole) - memberRank(b.householdRole) ||
          a.person.name.localeCompare(b.person.name) ||
          a.id.localeCompare(b.id)
      );
    const primary = members.find((row) => row.householdRole === 'PRIMARY_CONTACT');
    return {
      householdId: hh.id,
      primaryContactName: primary?.person.name ?? null,
      isHostHousehold: hh.id === hostHouseholdId,
      members: members.map((row) => byId.get(row.id)!),
    };
  });

  // Ruling 3: fixed positions, the host's own household first. "The board is a map, not a
  // queue" — the rest hold capture order, which is the geography Kate learns.
  cards.sort((a, b) => Number(b.isHostHousehold) - Number(a.isHostHousehold));

  const unhoused = memberships
    .filter((row) => row.householdId === null)
    .sort((a, b) => a.person.name.localeCompare(b.person.name) || a.id.localeCompare(b.id))
    .map((row) => byId.get(row.id)!);

  return {
    eventId: event.id,
    asOf: now.toISOString(),
    summary: summarisePeople(people.map((p) => p.state)),
    households: cards,
    unhoused,
  };
}
