/**
 * GTC-189 slice 3 — the pre-flight preview, asserted against a database fixture.
 *
 * WHAT THIS SUITE IS FOR. Before this slice the preview listed every adult, checked nothing about
 * whether they could be reached, showed no child, and gave coordinators a stand-in link that the
 * press would never replace. Slice 3 makes it show what will actually happen: per recipient the
 * channel slice 1's chooser picks (never `contactMethod`), the children's asks their message
 * carries, the host's list with a reason on every line, the reply-to from `User.email`, and a
 * segment count only for the people being texted.
 *
 * ⚠ THE WARNING THIS SUITE EXISTS TO HOLD (build shape, slice 3): the chooser must count a JOB as
 * something a child holds. A child whose only row is a job, counted as holding nothing, is
 * `CHILD_WITHOUT_ITEM` — no carrier, no message, no line on the host's list. Five children in
 * the fixture hold nothing but a job, one on every route a child can take, and layer J asserts
 * each by name. Layer J's conservation assertion then accounts for EVERY assigned row on the
 * event exactly once, split by kind — so a filter anywhere, wearing any clothes, fails it.
 *
 * THE FIXTURE, and the standing warning's rules (GTC-192; GTC-292's proposed third rule):
 *  - Deletes only what it can prove it made: ids captured at creation, plus people reached by
 *    walking the fixture's own events' memberships before they go. Never by name or domain.
 *  - A decoy that shares the fixture's names and shapes — the event name, the host, Sarah and
 *    Ollie, a job called "dishes", and a memberless Ollie — is planted first and must survive
 *    cleanup (layer K). Then it is removed by its own ids.
 *  - Row counts are taken before anything is planted and after the decoy is gone, and must
 *    match. Idempotence is proved by running the suite twice and diffing the output.
 *  - The host's household goes through `createHostHousehold`, the capture the real route uses.
 *    The other households are written directly: the preview reads state and no ledger, and the
 *    fixture needs stored `contactMethod` values that contradict the person, which capture would
 *    not write.
 *  - The modules under test are loaded inside a `try`, so a missing export reads as a failed
 *    assertion rather than a crashed run.
 *
 * LAYERS
 *   F  fixture controls — the deck is stacked the way each assertion needs
 *   A  the route per person — the chooser's, not `contactMethod`'s
 *   J  jobs — held, carried, split by kind and never filtered
 *   C  carried asks — named, beside the carrier's own and never merged into it
 *   H  the host's list — both kinds of line, each with its why
 *   O  which opt-out fact the preview passes ([GTC-301])
 *   L  links — before and after `ensureEventTokens`, the positive control on the same build
 *   R  reply-to — `User.email`, and none when the host has no `User` (decision 12, unanswered)
 *   V  the view — segments only for text, subject and reply-to only for email, the stand-ins
 *   W  the words — as ruled, and in Gather's first person
 *   X  isolation — one event's rows only
 *   N  not the press — nothing sends, nothing is written, the button stays disabled
 *   P  wiring — the route delegates, the page composes through the view module
 *   K  cleanup — the decoy survives, the row counts return
 *
 * LABELS
 *   [DEFECT GTC-300]      an Australian number reads unusable; changes when that predicate is fixed
 *   [GTC-301]             the opt-out fact this slice passes to the chooser — per host, ruled
 *                         deliberate at slice 3 (answer 1); changes with GTC-288, which owns it
 *   [GTC-302 not tidied]  names reach the preview exactly as stored; GTC-302's display helper and
 *                         prompt changes are ordered after this slice
 *   [RULED words]         the screen's words as the founder ruled them at slice 3 — Gather says "I"
 *   [UNREACHABLE kept]    reasons the chooser cannot produce today, kept so that no new route
 *                         through it can produce a line with no words
 *                         — the text-reply sentence among them, ruled after "yet" was found wrong
 *
 * Run: npx tsx tests/ask-preview-test.ts
 * Writes only its own fixture rows and its decoy, and deletes both by id.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createHostHousehold } from '../src/lib/households/hostHousehold';
import { ensureEventTokens } from '../src/lib/tokens';

const ROOT = join(__dirname, '..');
const MODULE_REL = 'src/lib/preflight/ask-preview.ts';
const COMPOSE_REL = 'src/lib/preflight/ask-preview-compose.ts';
const ROUTE_REL = 'src/app/api/events/[id]/pre-flight/message/route.ts';
const PAGE_REL = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const BASE_URL = 'https://gather.test';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const red: string[] = [];

function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
    red.push(`[${layer}] ${label}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** An assertion body that may throw while the module under test does not exist. */
function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

/** Source with comments stripped — naming a thing in prose must not read as using it. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceOf(rel: string): string {
  try {
    return readFileSync(join(ROOT, rel), 'utf-8');
  } catch {
    return '';
  }
}

const sameSet = (a: readonly string[] | undefined, b: readonly string[]) =>
  !!a && a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const HOST_LIST_WHYS = [
  'NO_CHANNEL',
  'SMS_OPTED_OUT',
  'PHONE_UNUSABLE',
  'HOST_HOUSEHOLD_CHILD',
  'NO_CARRIER',
  'HOUSEHOLD_MUTED',
] as const;

// ─── Row counts — what the suite must leave as it found ─────────────────────

async function rowCounts(): Promise<number[]> {
  return prisma.$transaction([
    prisma.user.count(),
    prisma.person.count(),
    prisma.personEvent.count(),
    prisma.event.count(),
    prisma.household.count(),
    prisma.team.count(),
    prisma.item.count(),
    prisma.assignment.count(),
    prisma.accessToken.count(),
    prisma.smsOptOut.count(),
    prisma.auditEntry.count(),
  ]);
}

// ─── The decoy — same names, same shapes, not the fixture's ─────────────────

interface Decoy {
  personIds: string[];
  eventId: string;
  householdId: string;
  personEventIds: string[];
  teamId: string;
  itemId: string;
  assignmentId: string;
}

async function plantDecoy(): Promise<Decoy> {
  const host = await prisma.person.create({ data: { name: 'Kate Whittaker' } });
  const sarah = await prisma.person.create({ data: { name: 'Sarah Nguyen' } });
  const ollie = await prisma.person.create({ data: { name: 'Ollie Nguyen' } });
  // GTC-292's shape: memberless, no email, the same name as a fixture child.
  const loose = await prisma.person.create({ data: { name: 'Ollie Nguyen', email: null } });
  const event = await prisma.event.create({
    data: {
      name: 'GTC-189 slice 3 preview',
      startDate: new Date('2026-12-23T00:00:00.000Z'),
      endDate: new Date('2026-12-23T00:00:00.000Z'),
      hostId: host.id,
    },
  });
  const household = await prisma.household.create({ data: { eventId: event.id } });
  const sarahPE = await prisma.personEvent.create({
    data: {
      personId: sarah.id,
      eventId: event.id,
      householdId: household.id,
      householdRole: 'PRIMARY_CONTACT',
    },
  });
  const olliePE = await prisma.personEvent.create({
    data: {
      personId: ollie.id,
      eventId: event.id,
      householdId: household.id,
      householdRole: 'CHILD',
    },
  });
  const team = await prisma.team.create({ data: { name: 'Jobs', eventId: event.id } });
  const item = await prisma.item.create({
    data: { name: 'dishes', kind: 'TASK', quantityState: 'NA', teamId: team.id },
  });
  const assignment = await prisma.assignment.create({
    data: { itemId: item.id, personId: ollie.id },
  });
  return {
    personIds: [host.id, sarah.id, ollie.id, loose.id],
    eventId: event.id,
    householdId: household.id,
    personEventIds: [sarahPE.id, olliePE.id],
    teamId: team.id,
    itemId: item.id,
    assignmentId: assignment.id,
  };
}

async function decoyStillThere(d: Decoy): Promise<boolean> {
  const [people, event, household, pes, team, item, assignment] = await Promise.all([
    prisma.person.count({ where: { id: { in: d.personIds } } }),
    prisma.event.count({ where: { id: d.eventId } }),
    prisma.household.count({ where: { id: d.householdId } }),
    prisma.personEvent.count({ where: { id: { in: d.personEventIds } } }),
    prisma.team.count({ where: { id: d.teamId } }),
    prisma.item.count({ where: { id: d.itemId } }),
    prisma.assignment.count({ where: { id: d.assignmentId } }),
  ]);
  return (
    people === d.personIds.length &&
    event === 1 &&
    household === 1 &&
    pes === d.personEventIds.length &&
    team === 1 &&
    item === 1 &&
    assignment === 1
  );
}

async function removeDecoy(d: Decoy) {
  await prisma.assignment.deleteMany({ where: { id: d.assignmentId } });
  await prisma.item.deleteMany({ where: { id: d.itemId } });
  await prisma.team.deleteMany({ where: { id: d.teamId } });
  await prisma.personEvent.deleteMany({ where: { id: { in: d.personEventIds } } });
  await prisma.household.deleteMany({ where: { id: d.householdId } });
  await prisma.event.deleteMany({ where: { id: d.eventId } });
  await prisma.person.deleteMany({ where: { id: { in: d.personIds } } });
}

// ─── The fixture ────────────────────────────────────────────────────────────

interface Created {
  eventIds: string[];
  personIds: string[];
  userIds: string[];
}

interface Fixture {
  mainId: string;
  otherId: string;
  hostEmail: string;
  hostPersonId: string;
  hostPEId: string;
  pe: Record<string, string>;
  person: Record<string, string>;
}

async function buildFixture(created: Created, stamp: string): Promise<Fixture> {
  const email = (key: string) => `gtc189-s3-${key}-${stamp}@example.com`;
  const person: Record<string, string> = {};
  const pe: Record<string, string> = {};

  const user = await prisma.user.create({ data: { email: email('host') } });
  created.userIds.push(user.id);

  const newPerson = async (key: string, data: Record<string, unknown>) => {
    const p = await prisma.person.create({ data: data as any });
    created.personIds.push(p.id);
    person[key] = p.id;
    return p;
  };

  const kate = await newPerson('kate', {
    name: 'Kate Whittaker',
    email: user.email,
    phoneNumber: '+64211000100',
    userId: user.id,
  });

  const main = await prisma.event.create({
    data: {
      name: 'GTC-189 slice 3 preview',
      startDate: new Date('2026-12-23T00:00:00.000Z'),
      endDate: new Date('2026-12-23T00:00:00.000Z'),
      venueName: "Kate's place",
      hostId: kate.id,
      status: 'CONFIRMING',
    },
  });
  created.eventIds.push(main.id);

  // The host's household through the real capture: Kate, her partner Sam, and Poppy — a helper,
  // which capture roles CHILD. Poppy's only row will be a job.
  await prisma.$transaction((tx) =>
    createHostHousehold(tx, {
      eventId: main.id,
      hostPersonId: kate.id,
      sentAt: null,
      input: {
        alone: false,
        name: 'Kate Whittaker',
        partner: { name: 'Sam Whittaker', email: email('sam') },
        helpers: [{ name: 'Poppy Whittaker' }],
      },
    })
  );
  const captured = await prisma.personEvent.findMany({
    where: { eventId: main.id },
    select: { id: true, personId: true, person: { select: { name: true } } },
  });
  for (const c of captured) {
    const key = c.person.name.split(' ')[0].toLowerCase();
    pe[key] = c.id;
    person[key] = c.personId;
  }

  const food = await prisma.team.create({ data: { name: 'Food', eventId: main.id } });
  const jobs = await prisma.team.create({ data: { name: 'Jobs', eventId: main.id } });

  const give = async (key: string, name: string, kind: 'ITEM' | 'TASK', eventTeam = food.id) => {
    const item = await prisma.item.create({
      data:
        kind === 'TASK'
          ? { name, kind, quantityState: 'NA', teamId: jobs.id }
          : { name, kind, teamId: eventTeam },
    });
    await prisma.assignment.create({ data: { itemId: item.id, personId: person[key] } });
  };

  const member = async (
    key: string,
    name: string,
    fields: {
      email?: string | null;
      phoneNumber?: string | null;
      smsOptedOut?: boolean;
      userId?: string;
      role?: 'PARTICIPANT' | 'COORDINATOR';
      householdId?: string | null;
      householdRole?: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD' | null;
      contactMethod?: 'EMAIL' | 'SMS' | 'NONE';
      eventId?: string;
    }
  ) => {
    const p = person[key]
      ? { id: person[key] }
      : await newPerson(key, {
          name,
          email: fields.email ?? null,
          phoneNumber: fields.phoneNumber ?? null,
          smsOptedOut: fields.smsOptedOut ?? false,
          userId: fields.userId,
        });
    const row = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId: fields.eventId ?? main.id,
        role: fields.role ?? 'PARTICIPANT',
        householdId: fields.householdId ?? null,
        householdRole: fields.householdRole ?? null,
        contactMethod: fields.contactMethod ?? 'NONE',
      },
    });
    if (!fields.eventId) pe[key] = row.id;
    return row;
  };

  // Household A — Sarah: email and phone, stored contactMethod SMS (wrong for the ask, which is
  // email first). Ollie holds ONLY a job. Mia holds a dish and a job. Nell holds nothing.
  const hhA = await prisma.household.create({ data: { eventId: main.id } });
  await member('sarah', 'Sarah Nguyen', {
    email: email('sarah'),
    phoneNumber: '+64211000001',
    householdId: hhA.id,
    householdRole: 'PRIMARY_CONTACT',
    contactMethod: 'SMS',
  });
  await member('ollie', 'Ollie Nguyen', { householdId: hhA.id, householdRole: 'CHILD' });
  await member('mia', 'Mia Nguyen', { householdId: hhA.id, householdRole: 'CHILD' });
  await member('nell', 'Nell Nguyen', { householdId: hhA.id, householdRole: 'CHILD' });

  // Household B — Ray: a usable NZ phone and no email, stored contactMethod EMAIL (wrong). Finn
  // holds only a job, so his ask travels by text.
  const hhB = await prisma.household.create({ data: { eventId: main.id } });
  await member('ray', 'Ray Dalton', {
    phoneNumber: '+64211000002',
    householdId: hhB.id,
    householdRole: 'PRIMARY_CONTACT',
    contactMethod: 'EMAIL',
  });
  await member('finn', 'Finn Dalton', { householdId: hhB.id, householdRole: 'CHILD' });

  // Household C — Tom: no email, no phone. Jack holds only a job, and his carrier cannot be
  // reached, so Jack is a line on the host's list naming Tom.
  const hhC = await prisma.household.create({ data: { eventId: main.id } });
  await member('tom', 'Tom Baker', { householdId: hhC.id, householdRole: 'PRIMARY_CONTACT' });
  await member('jack', 'Jack Baker', { householdId: hhC.id, householdRole: 'CHILD' });

  // Household D — switched off. Lena is still asked herself; Ava's dish comes to the host.
  const hhD = await prisma.household.create({ data: { eventId: main.id, messagesMuted: true } });
  await member('lena', 'Lena Park', {
    email: email('lena'),
    householdId: hhD.id,
    householdRole: 'PRIMARY_CONTACT',
  });
  await member('ava', 'Ava Park', { householdId: hhD.id, householdRole: 'CHILD' });

  // Household E — picked the host as its contact (ruling A2). Leo holds only a job, carried to her.
  const hhE = await prisma.household.create({
    data: { eventId: main.id, contactPersonEventId: pe.kate },
  });
  await member('grace', 'Grace Tui', {
    email: email('grace'),
    householdId: hhE.id,
    householdRole: 'PRIMARY_CONTACT',
  });
  await member('leo', 'Leo Tui', { householdId: hhE.id, householdRole: 'CHILD' });

  // Unhoused adults.
  await member('opal', 'Opal Reid', { phoneNumber: '+64211000003', smsOptedOut: true });
  await member('otto', 'Otto Lang', { phoneNumber: '+64211000004' });
  await member('pia', 'Pia Moss', { phoneNumber: '+64211000005' });
  await member('uma', 'Uma Singh', { phoneNumber: '+61412345678' });
  await member('cora', 'Cora Hill', { email: email('cora'), role: 'COORDINATOR' });
  await member('ivy', 'Ivy Chen', { email: email('ivy') });
  // The host's third identity path: a second Person on the host's own User.
  await member('kate2', 'K. Whittaker', { email: email('kate2'), userId: user.id });

  // Opt-out rows: Otto's under this event's host; Pia's under a different host.
  const olive = await newPerson('olive', { name: 'Olive Elsewhere' });
  await prisma.smsOptOut.create({ data: { phoneNumber: '+64211000004', hostId: kate.id } });
  await prisma.smsOptOut.create({ data: { phoneNumber: '+64211000005', hostId: olive.id } });

  // Rows.
  await give('kate', 'pavlova', 'ITEM');
  await give('sam', 'cheeseboard', 'ITEM');
  await give('poppy', 'table setting', 'TASK');
  await give('sarah', 'Glazed Ham (bone-in leg)', 'ITEM');
  await give('sarah', 'Berry Trifle', 'ITEM');
  await give('sarah', 'potato salad', 'ITEM');
  await give('sarah', 'bbq', 'TASK');
  await give('ollie', 'dishes', 'TASK');
  await give('mia', 'fruit salad', 'ITEM');
  await give('mia', 'bins', 'TASK');
  await give('ray', 'sausages', 'ITEM');
  await give('finn', 'recycling', 'TASK');
  await give('tom', 'chairs', 'ITEM');
  await give('jack', 'sweeping', 'TASK');
  await give('lena', 'bread', 'ITEM');
  // Long names on an EMAILED recipient, so her message outruns every texted one by more than a
  // segment — the control that lets layer V's text-only summary fail.
  await give(
    'lena',
    'Seafood platter with prawns, mussels, smoked salmon and lemon wedges',
    'ITEM'
  );
  await give(
    'lena',
    'Pavlova with whipped cream, passionfruit, kiwifruit and strawberries',
    'ITEM'
  );
  await give('lena', 'Christmas ham with a honey and mustard glaze, sliced on the bone', 'ITEM');
  await give('lena', 'Summer salad of roasted kumara, feta, spinach and pumpkin seeds', 'ITEM');
  await give('ava', 'lemonade', 'ITEM');
  await give('grace', 'green salad', 'ITEM');
  await give('leo', 'ice', 'TASK');
  await give('opal', 'cheese', 'ITEM');
  await give('otto', 'crackers', 'ITEM');
  await give('pia', 'dip', 'ITEM');
  await give('uma', 'ice cream', 'ITEM');
  await give('cora', 'wine', 'ITEM');

  // A second event: its host has no User (decision 12), and Ray is on it too, holding a row the
  // main event's preview must not show.
  const hana = await newPerson('hana', { name: 'Hana Norris' });
  const other = await prisma.event.create({
    data: {
      name: 'GTC-189 slice 3 preview, no account',
      startDate: new Date('2026-12-24T00:00:00.000Z'),
      endDate: new Date('2026-12-24T00:00:00.000Z'),
      hostId: hana.id,
    },
  });
  created.eventIds.push(other.id);
  await member('guy', 'Guy Brooks', { email: email('guy'), eventId: other.id });
  await member('ray', 'Ray Dalton', { eventId: other.id });
  const otherTeam = await prisma.team.create({ data: { name: 'Food', eventId: other.id } });
  const elsewhere = await prisma.item.create({
    data: { name: 'sausages for another event', teamId: otherTeam.id },
  });
  await prisma.assignment.create({ data: { itemId: elsewhere.id, personId: person.ray } });

  return {
    mainId: main.id,
    otherId: other.id,
    hostEmail: user.email,
    hostPersonId: kate.id,
    hostPEId: pe.kate,
    pe,
    person,
  };
}

/** By ids captured at creation, and by people walked from the fixture's own events. */
async function cleanupFixture(created: Created) {
  const walked = await prisma.personEvent.findMany({
    where: { eventId: { in: created.eventIds } },
    select: { personId: true },
  });
  const personIds = [...new Set([...created.personIds, ...walked.map((w) => w.personId)])];
  for (const eventId of created.eventIds) {
    await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
    await prisma.item.deleteMany({ where: { team: { eventId } } });
    await prisma.team.deleteMany({ where: { eventId } });
    await prisma.accessToken.deleteMany({ where: { eventId } });
    await prisma.personEvent.deleteMany({ where: { eventId } });
    await prisma.household.deleteMany({ where: { eventId } });
    await prisma.auditEntry.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
  }
  await prisma.smsOptOut.deleteMany({ where: { hostId: { in: personIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
}

// ─── The suite ──────────────────────────────────────────────────────────────

async function main() {
  const stamp = `${Date.now()}`;
  const created: Created = { eventIds: [], personIds: [], userIds: [] };

  let AP: any = null;
  let APC: any = null;
  try {
    AP = await import(join(ROOT, MODULE_REL.replace(/\.ts$/, '')));
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m ${MODULE_REL} did not load: ${String(err).split('\n')[0]}`);
  }
  try {
    APC = await import(join(ROOT, COMPOSE_REL.replace(/\.ts$/, '')));
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m ${COMPOSE_REL} did not load: ${String(err).split('\n')[0]}`);
  }

  const countsBefore = await rowCounts();
  const decoy = await plantDecoy();
  let fx: Fixture | null = null;
  let buildError: string | null = null;

  const read = async (eventId: string) => {
    try {
      return await AP.readAskPreview(prisma, eventId, BASE_URL);
    } catch {
      return null;
    }
  };

  try {
    try {
      fx = await buildFixture(created, stamp);
    } catch (err) {
      buildError = String(err).split('\n')[0];
    }

    // ══ F — fixture controls ═══════════════════════════════════════════════
    section('Layer F: the fixture is the deck each assertion needs');

    assert('F', 'the fixture built', fx !== null, buildError ?? undefined);
    // A labelled block rather than `return`: a return here would skip the summary below and exit 0.
    suite: {
      if (!fx) break suite;
      const f = fx;

      const stored = await prisma.personEvent.findMany({
        where: { id: { in: [f.pe.sarah, f.pe.ray, f.pe.poppy, f.pe.kate] } },
        select: {
          id: true,
          contactMethod: true,
          householdRole: true,
          role: true,
          householdId: true,
        },
      });
      const storedOf = (id: string) => stored.find((s) => s.id === id);
      assert(
        'F',
        'CONTROL: stored contactMethod contradicts the ask — Sarah SMS with an email, Ray EMAIL with none',
        storedOf(f.pe.sarah)?.contactMethod === 'SMS' &&
          storedOf(f.pe.ray)?.contactMethod === 'EMAIL'
      );
      assert(
        'F',
        "CONTROL: capture made Poppy a CHILD in the host's household, and Kate its HOST",
        storedOf(f.pe.poppy)?.householdRole === 'CHILD' &&
          storedOf(f.pe.kate)?.role === 'HOST' &&
          storedOf(f.pe.poppy)?.householdId === storedOf(f.pe.kate)?.householdId
      );
      const jobOnly = await prisma.assignment.findMany({
        where: { item: { team: { eventId: f.mainId } } },
        select: { personId: true, item: { select: { kind: true } } },
      });
      const kindsOf = (key: string) =>
        jobOnly.filter((a) => a.personId === f.person[key]).map((a) => a.item.kind);
      assert(
        'F',
        'CONTROL: Ollie, Finn, Jack, Poppy and Leo each hold exactly one row, and it is a job',
        ['ollie', 'finn', 'jack', 'poppy', 'leo'].every(
          (k) => kindsOf(k).length === 1 && kindsOf(k)[0] === 'TASK'
        )
      );
      const otto = await prisma.person.findUnique({ where: { id: f.person.otto } });
      const optRows = await prisma.smsOptOut.findMany({
        where: { phoneNumber: { in: ['+64211000004', '+64211000005'] } },
        select: { phoneNumber: true, hostId: true },
      });
      assert(
        'F',
        "CONTROL: Otto's person flag is false and only the table says he opted out; Pia's row is another host's",
        otto?.smsOptedOut === false &&
          optRows.some((r) => r.phoneNumber === '+64211000004' && r.hostId === f.hostPersonId) &&
          optRows.some((r) => r.phoneNumber === '+64211000005' && r.hostId === f.person.olive)
      );
      assert(
        'F',
        'CONTROL: no participant token exists on the event yet',
        (await prisma.accessToken.count({ where: { eventId: f.mainId } })) === 0
      );

      const p = await read(f.mainId);
      const tokensAfterRead = await prisma.accessToken.count({ where: { eventId: f.mainId } });
      const rec = (name: string) => p?.recipients?.find((r: any) => r.name === name);
      const line = (name: string) => p?.hostList?.find((l: any) => l.name === name);

      // ══ A — the route per person ═══════════════════════════════════════════
      section('Layer A: the route per person — the chooser decides, not contactMethod');

      assert('A', 'the preview reads', p !== null && Array.isArray(p?.recipients));
      assert(
        'A',
        'Sarah, with an email and a phone, is reached by EMAIL — though her stored contactMethod says SMS',
        ok(() => rec('Sarah Nguyen').channel === 'EMAIL')
      );
      assert(
        'A',
        'Ray, with a usable phone and no email, is reached by TEXT — though his stored contactMethod says EMAIL',
        ok(() => rec('Ray Dalton').channel === 'TEXT')
      );
      assert(
        'A',
        'Lena is asked herself by EMAIL — a switched-off household closes only the carrier route',
        ok(() => rec('Lena Park').channel === 'EMAIL')
      );
      assert(
        'A',
        'Ivy, holding nothing, is asked like any adult (slice 1 answer 4)',
        ok(() => rec('Ivy Chen').channel === 'EMAIL' && rec('Ivy Chen').itemNames.length === 0)
      );
      assert(
        'A',
        'Cora, a coordinator, is a recipient by EMAIL',
        ok(() => rec('Cora Hill').channel === 'EMAIL')
      );
      assert(
        'A',
        'Tom, Opal, Otto and Uma are not recipients — they are lines on the host list',
        ok(() =>
          ['Tom Baker', 'Opal Reid', 'Otto Lang', 'Uma Singh'].every((n) => !rec(n) && !!line(n))
        )
      );
      assert(
        'A',
        'no child is ever a recipient',
        ok(() =>
          p.recipients.every(
            (r: any) =>
              !['Poppy', 'Ollie', 'Mia', 'Nell', 'Finn', 'Jack', 'Ava', 'Leo'].includes(
                r.name.split(' ')[0]
              )
          )
        )
      );
      assert(
        'A',
        'the host is not sent her own ask — no row of hers carries her own items',
        ok(() => {
          const kate = rec('Kate Whittaker');
          return (
            p.recipients.length > 0 &&
            (!kate || (kate.hostAsCarrier === true && kate.itemNames.length === 0))
          );
        })
      );
      assert(
        'A',
        "the host's third identity path — a second Person on her User — is neither a recipient nor a line",
        ok(() => p.recipients.length > 0 && !rec('K. Whittaker') && !line('K. Whittaker'))
      );
      assert(
        'A',
        'Nell, holding nothing, is on no route at all — not a recipient, not carried, not a line',
        ok(
          () =>
            p.recipients.length > 0 &&
            !rec('Nell Nguyen') &&
            !line('Nell Nguyen') &&
            p.recipients.every((r: any) => r.carried.every((c: any) => c.name !== 'Nell Nguyen'))
        )
      );
      assert(
        'A',
        'the recipients are exactly Sam, Sarah, Ray, Lena, Grace, Pia, Cora, Ivy and the host as carrier',
        ok(() =>
          sameSet(
            p.recipients.map((r: any) => r.name),
            [
              'Sam Whittaker',
              'Sarah Nguyen',
              'Ray Dalton',
              'Lena Park',
              'Grace Tui',
              'Pia Moss',
              'Cora Hill',
              'Ivy Chen',
              'Kate Whittaker',
            ]
          )
        ),
        p ? JSON.stringify(p.recipients?.map((r: any) => r.name)) : undefined
      );

      // ══ J — jobs ═══════════════════════════════════════════════════════════
      section('Layer J: a job is something a child holds — carried, split by kind, never filtered');

      const carriedOf = (carrier: string, child: string) =>
        rec(carrier)?.carried?.find((c: any) => c.name === child);

      assert(
        'J',
        "⚠ OLLIE HOLDS ONLY A JOB AND IS CARRIED — named in Sarah's message, the job in jobNames",
        ok(
          () =>
            sameSet(carriedOf('Sarah Nguyen', 'Ollie Nguyen').jobNames, ['dishes']) &&
            carriedOf('Sarah Nguyen', 'Ollie Nguyen').itemNames.length === 0 &&
            carriedOf('Sarah Nguyen', 'Ollie Nguyen').firstName === 'Ollie'
        )
      );
      assert(
        'J',
        "⚠ FINN HOLDS ONLY A JOB AND IS CARRIED BY TEXT — in Ray's message",
        ok(
          () =>
            rec('Ray Dalton').channel === 'TEXT' &&
            sameSet(carriedOf('Ray Dalton', 'Finn Dalton').jobNames, ['recycling'])
        )
      );
      assert(
        'J',
        '⚠ JACK HOLDS ONLY A JOB AND HIS CARRIER CANNOT BE REACHED — a line on the host list, his job named',
        ok(
          () =>
            line('Jack Baker').why === 'NO_CHANNEL' &&
            line('Jack Baker').child === true &&
            sameSet(line('Jack Baker').jobNames, ['sweeping'])
        )
      );
      assert(
        'J',
        "⚠ POPPY HOLDS ONLY A JOB IN THE HOST'S HOUSEHOLD — a line on the host list, her job named",
        ok(
          () =>
            line('Poppy Whittaker').why === 'HOST_HOUSEHOLD_CHILD' &&
            sameSet(line('Poppy Whittaker').jobNames, ['table setting'])
        )
      );
      assert(
        'J',
        '⚠ LEO HOLDS ONLY A JOB AND HIS HOUSEHOLD PICKED THE HOST — carried to her (ruling A2)',
        ok(() => sameSet(carriedOf('Kate Whittaker', 'Leo Tui').jobNames, ['ice']))
      );
      assert(
        'J',
        'Mia holds a dish and a job — the dish in itemNames, the job in jobNames',
        ok(
          () =>
            sameSet(carriedOf('Sarah Nguyen', 'Mia Nguyen').itemNames, ['fruit salad']) &&
            sameSet(carriedOf('Sarah Nguyen', 'Mia Nguyen').jobNames, ['bins'])
        )
      );
      assert(
        'J',
        "Sarah's own rows are split the same way — three dishes, one job",
        ok(
          () =>
            sameSet(rec('Sarah Nguyen').itemNames, [
              'Glazed Ham (bone-in leg)',
              'Berry Trifle',
              'potato salad',
            ]) && sameSet(rec('Sarah Nguyen').jobNames, ['bbq'])
        )
      );

      // Conservation: every assigned row held by a membership of the event, other than the host's
      // own, appears exactly once — against its holder, in the list for its kind.
      const roster = await prisma.personEvent.findMany({
        where: { eventId: f.mainId },
        select: { id: true, personId: true },
      });
      const peByPerson = new Map(roster.map((r) => [r.personId, r.id]));
      const rows = await prisma.assignment.findMany({
        where: { item: { team: { eventId: f.mainId } } },
        select: { personId: true, item: { select: { name: true, kind: true } } },
      });
      const hostIdentities = new Set([f.person.kate, f.person.kate2]);
      const expected = rows
        .filter((r) => peByPerson.has(r.personId) && !hostIdentities.has(r.personId))
        .map((r) => `${peByPerson.get(r.personId)}|${r.item.kind}|${r.item.name}`)
        .sort();
      const actual = p
        ? (() => {
            const out: string[] = [];
            const push = (holder: string, x: any) => {
              for (const n of x.itemNames ?? []) out.push(`${holder}|ITEM|${n}`);
              for (const n of x.jobNames ?? []) out.push(`${holder}|TASK|${n}`);
            };
            for (const r of p.recipients ?? []) {
              push(r.personEventId, r);
              for (const c of r.carried ?? []) push(c.personEventId, c);
            }
            for (const l of p.hostList ?? []) push(l.personEventId, l);
            return out.sort();
          })()
        : [];
      assert(
        'J',
        'NOTHING FILTERED — every assigned row on the event appears exactly once, against its holder, in the list for its kind',
        expected.length === 26 && expected.join('\n') === actual.join('\n'),
        `expected ${expected.length}, got ${actual.length}`
      );
      assert(
        'J',
        "the host's own pavlova appears nowhere in the preview",
        p !== null && !JSON.stringify(p).includes('pavlova')
      );

      // ══ C — carried asks ═══════════════════════════════════════════════════
      section("Layer C: carried asks — named, beside the carrier's own, never merged into it");

      assert(
        'C',
        "Sarah carries Mia and Ollie, in name order, and no child's row is in her own lists",
        ok(
          () =>
            rec('Sarah Nguyen')
              .carried.map((c: any) => c.name)
              .join(',') === 'Mia Nguyen,Ollie Nguyen' &&
            !rec('Sarah Nguyen').jobNames.includes('dishes') &&
            !rec('Sarah Nguyen').itemNames.includes('fruit salad')
        )
      );
      assert(
        'C',
        'the host as carrier carries Leo and nothing of her own — no items, no jobs (ruling A2)',
        ok(
          () =>
            rec('Kate Whittaker').hostAsCarrier === true &&
            rec('Kate Whittaker').carried.length === 1 &&
            rec('Kate Whittaker').itemNames.length === 0 &&
            rec('Kate Whittaker').jobNames.length === 0
        )
      );
      assert(
        'C',
        'no ordinary recipient is marked as the host carrying',
        ok(
          () =>
            p.recipients
              .filter((r: any) => r.hostAsCarrier)
              .map((r: any) => r.name)
              .join() === 'Kate Whittaker'
        )
      );
      assert(
        'C',
        "Grace is asked for her own salad and carries nothing — Leo went to the household's pick, not to her",
        ok(
          () =>
            rec('Grace Tui').carried.length === 0 &&
            sameSet(rec('Grace Tui').itemNames, ['green salad'])
        )
      );

      // ══ H — the host's list ════════════════════════════════════════════════
      section("Layer H: the host's list — both kinds of line, each with its why");

      assert(
        'H',
        'the list is exactly Poppy, Tom, Jack, Ava, Opal, Otto and Uma',
        ok(() =>
          sameSet(
            p.hostList.map((l: any) => l.name),
            [
              'Poppy Whittaker',
              'Tom Baker',
              'Jack Baker',
              'Ava Park',
              'Opal Reid',
              'Otto Lang',
              'Uma Singh',
            ]
          )
        ),
        p ? JSON.stringify(p.hostList?.map((l: any) => [l.name, l.why])) : undefined
      );
      assert(
        'H',
        'Tom — an adult with no channel — is named with his own item, and names no carrier',
        ok(
          () =>
            line('Tom Baker').why === 'NO_CHANNEL' &&
            line('Tom Baker').child === false &&
            sameSet(line('Tom Baker').itemNames, ['chairs']) &&
            line('Tom Baker').carrierName === null
        )
      );
      assert(
        'H',
        'Jack names the carrier who could not be reached',
        ok(() => line('Jack Baker').carrierName === 'Tom Baker')
      );
      assert(
        'H',
        "Ava's household is switched off — HOUSEHOLD_MUTED, her dish named",
        ok(
          () =>
            line('Ava Park').why === 'HOUSEHOLD_MUTED' &&
            sameSet(line('Ava Park').itemNames, ['lemonade'])
        )
      );
      assert(
        'H',
        'Opal — opted out of texts and no email — SMS_OPTED_OUT',
        ok(() => line('Opal Reid').why === 'SMS_OPTED_OUT')
      );
      assert(
        'H',
        '[DEFECT GTC-300] Uma — an Australian number and no email — PHONE_UNUSABLE',
        ok(() => line('Uma Singh').why === 'PHONE_UNUSABLE')
      );

      // ══ O — which opt-out fact ═════════════════════════════════════════════
      section('Layer O: the opt-out fact the preview passes to the chooser ([GTC-301])');

      assert(
        'O',
        "[GTC-301] Otto is opted out by the table's row for THIS event's host, with his person flag false",
        ok(() => line('Otto Lang').why === 'SMS_OPTED_OUT')
      );
      assert(
        'O',
        "[GTC-301] Pia's row is under ANOTHER host, and she is texted — the table is read per host, as sendSms reads it",
        ok(() => rec('Pia Moss').channel === 'TEXT')
      );

      // ══ L — links ══════════════════════════════════════════════════════════
      section('Layer L: links — what the press issues, measured on either side of it');

      assert(
        'L',
        'before tokens: an ordinary guest is AT_PRESS with no link',
        ok(() => rec('Sarah Nguyen').linkState === 'AT_PRESS' && rec('Sarah Nguyen').link === null)
      );
      assert(
        'L',
        'before tokens: a coordinator is NONE_COORDINATOR — the press issues her no guest link (GTC-294)',
        ok(
          () => rec('Cora Hill').linkState === 'NONE_COORDINATOR' && rec('Cora Hill').link === null
        )
      );
      assert(
        'L',
        'before tokens: the host as carrier is NONE_HOST_CARRIER — her one-off link is GTC-297',
        ok(() => rec('Kate Whittaker').linkState === 'NONE_HOST_CARRIER')
      );

      await ensureEventTokens(f.mainId);
      const after = await read(f.mainId);
      const recAfter = (name: string) => after?.recipients?.find((r: any) => r.name === name);
      const participantTokens = await prisma.accessToken.findMany({
        where: { eventId: f.mainId, scope: 'PARTICIPANT' },
        select: { personId: true, token: true },
      });
      const tokenOf = (personId: string) =>
        participantTokens.find((t) => t.personId === personId)?.token;

      assert(
        'L',
        'POSITIVE CONTROL — after the tokens are issued, every guest who was AT_PRESS is READY, carrying their own token',
        ok(() => {
          const was = p.recipients.filter((r: any) => r.linkState === 'AT_PRESS');
          return (
            was.length >= 5 &&
            was.every((r: any) => {
              const now = after.recipients.find((x: any) => x.personEventId === r.personEventId);
              const t = tokenOf(r.personId);
              return (
                now.linkState === 'READY' &&
                !!t &&
                now.link.includes(t) &&
                now.link.startsWith(BASE_URL)
              );
            })
          );
        })
      );
      assert(
        'L',
        'after the tokens: the coordinator is still NONE_COORDINATOR, and the database holds no guest token for her',
        ok(() => recAfter('Cora Hill').linkState === 'NONE_COORDINATOR' && !tokenOf(f.person.cora))
      );
      assert(
        'L',
        'after the tokens: the host as carrier is still NONE_HOST_CARRIER, and holds no guest token',
        ok(
          () =>
            recAfter('Kate Whittaker').linkState === 'NONE_HOST_CARRIER' && !tokenOf(f.person.kate)
        )
      );

      // ══ R — reply-to ═══════════════════════════════════════════════════════
      section('Layer R: reply-to — User.email (ruling F)');

      assert(
        'R',
        "the reply-to is the host's User.email",
        ok(() => p.replyTo === f.hostEmail)
      );
      const noAccount = await read(f.otherId);
      assert(
        'R',
        'a host with no User has no reply-to — null, not a guess (decision 12 is unanswered)',
        noAccount !== null && noAccount.replyTo === null && noAccount.recipients.length === 2
      );

      // ══ V — the view ═══════════════════════════════════════════════════════
      section('Layer V: the view — segments for text only, subject and reply-to for email only');

      let view: any = null;
      try {
        view = APC.composePreview(p, null);
      } catch {
        view = null;
      }
      const row = (name: string) => view?.rows?.find((r: any) => r.recipient.name === name);
      const textRows = () => view.rows.filter((r: any) => r.recipient.channel === 'TEXT');
      const emailRows = () =>
        view.rows.filter((r: any) => r.recipient.channel === 'EMAIL' && r.ask);

      assert(
        'V',
        "every texted recipient shows a segment count, and it is their own message's",
        ok(
          () =>
            textRows().length === 2 &&
            textRows().every(
              (r: any) => typeof r.segments === 'number' && r.segments === r.ask.segments
            )
        )
      );
      assert(
        'V',
        'no emailed recipient shows a segment count',
        ok(() => emailRows().length >= 6 && emailRows().every((r: any) => r.segments === null))
      );
      assert(
        'V',
        'CONTROL: an emailed message is longer in texts than any texted one, so the summary below can fail',
        ok(
          () =>
            Math.max(...emailRows().map((r: any) => r.ask.segments)) >
            Math.max(...textRows().map((r: any) => r.ask.segments))
        )
      );
      assert(
        'V',
        'the longest-message summary is over texted recipients only',
        ok(() => view.longestText === Math.max(...textRows().map((r: any) => r.ask.segments)))
      );
      assert(
        'V',
        'email rows carry the subject and the reply-to; text rows carry neither',
        ok(
          () =>
            emailRows().every((r: any) => r.subject === r.ask.subject && r.replyTo === p.replyTo) &&
            textRows().every((r: any) => r.subject === null && r.replyTo === null)
        )
      );
      assert(
        'V',
        "the host as carrier's message is not composed — its voice is decision 20, unruled",
        ok(() => row('Kate Whittaker').ask === null && row('Kate Whittaker').segments === null)
      );
      assert(
        'V',
        "Sarah's message carries Ollie's job as done, and her own as done — the split reaches the words",
        ok(
          () =>
            row('Sarah Nguyen').ask.text.includes('Ollie has been asked to do the dishes.') &&
            row('Sarah Nguyen').ask.text.includes(', and do the bbq?') &&
            !row('Sarah Nguyen').ask.text.includes('bring the dishes') &&
            !row('Sarah Nguyen').ask.text.includes('bring the bbq')
        )
      );
      assert(
        'V',
        "Ray's text carries Finn's job",
        ok(() => row('Ray Dalton').ask.text.includes('Finn has been asked to do the recycling.'))
      );
      assert(
        'V',
        '[GTC-302 not tidied] names reach the words exactly as stored — capitals and the bracketed qualifier',
        ok(
          () =>
            row('Sarah Nguyen').ask.text.includes('the Glazed Ham (bone-in leg)') &&
            row('Sarah Nguyen').ask.text.includes('the Berry Trifle')
        )
      );
      assert(
        'V',
        "a coordinator's stand-in is not the at-the-press one — it does not promise a link the press will not issue",
        ok(
          () =>
            typeof APC.LINK_AT_PRESS === 'string' &&
            typeof APC.LINK_NONE === 'string' &&
            APC.LINK_AT_PRESS !== APC.LINK_NONE &&
            row('Cora Hill').ask.text.endsWith(APC.LINK_NONE) &&
            row('Sarah Nguyen').ask.text.endsWith(APC.LINK_AT_PRESS)
        )
      );
      let afterView: any = null;
      try {
        afterView = APC.composePreview(after, null);
      } catch {
        afterView = null;
      }
      assert(
        'V',
        "once issued, a guest's message ends with their real link",
        ok(() => {
          const s = afterView.rows.find((r: any) => r.recipient.name === 'Sarah Nguyen');
          return s.recipient.linkState === 'READY' && s.ask.text.endsWith(s.recipient.link);
        })
      );
      // ══ W — the words, as ruled ═══════════════════════════════════════════
      section('Layer W: the words on this screen, as ruled — Gather says "I"');

      const reason = (why: string, child: boolean, carrierName: string | null = null) => {
        try {
          return APC.hostListReason({ why, child, carrierName }) as string;
        } catch {
          return undefined;
        }
      };
      const RULED_REASONS: Array<[string, boolean, string | null, string]> = [
        ['NO_CHANNEL', false, null, 'No email or mobile number.'],
        ['SMS_OPTED_OUT', false, null, 'No email, and has opted out of texts.'],
        ['PHONE_UNUSABLE', false, null, "No email, and I can't text that number."],
        ['HOST_HOUSEHOLD_CHILD', true, null, 'Yours — in your own household.'],
        ['NO_CARRIER', true, null, 'Their household has no adult to pass it on.'],
        ['HOUSEHOLD_MUTED', true, null, 'Messages to their household are switched off.'],
        ['NO_CHANNEL', true, 'Tom Baker', "Tom would pass it on, but I can't reach Tom."],
        ['SMS_OPTED_OUT', true, 'Tom Baker', "Tom would pass it on, but I can't reach Tom."],
        ['PHONE_UNUSABLE', true, 'Tom Baker', "Tom would pass it on, but I can't reach Tom."],
      ];
      for (const [why, child, carrier, words] of RULED_REASONS) {
        const who = child
          ? carrier
            ? 'a child whose carrier cannot be reached'
            : 'a child'
          : 'an adult';
        assert(
          'W',
          `[RULED words] ${who}, ${why}: "${words}"`,
          reason(why, child, carrier) === words,
          `got ${JSON.stringify(reason(why, child, carrier))}`
        );
      }
      const UNREACHABLE: Array<[string, boolean, string]> = [
        ['HOST_HOUSEHOLD_CHILD', false, 'Yours — in your own household.'],
        ['NO_CARRIER', false, 'No one to pass it on.'],
        ['HOUSEHOLD_MUTED', false, 'Messages to their household are switched off.'],
        ['NO_CHANNEL', true, 'No one in their household can be reached.'],
        ['SMS_OPTED_OUT', true, 'No one in their household can be reached.'],
        ['PHONE_UNUSABLE', true, 'No one in their household can be reached.'],
      ];
      for (const [why, child, words] of UNREACHABLE) {
        assert(
          'W',
          `[UNREACHABLE kept] ${child ? 'a child with no carrier named' : 'an adult'}, ${why}: "${words}"`,
          reason(why, child) === words,
          `got ${JSON.stringify(reason(why, child))}`
        );
      }
      assert(
        'W',
        'every reason has words for every case — adult, child, and child with a carrier — so no route yields a blank line',
        HOST_LIST_WHYS.every((why) =>
          [reason(why, false), reason(why, true), reason(why, true, 'Tom Baker')].every(
            (w) => typeof w === 'string' && w.trim().length > 0
          )
        )
      );
      assert(
        'W',
        "[RULED words] on the fixture: Jack's line names Tom, Poppy's is hers, Uma's number cannot be texted",
        ok(
          () =>
            reason(line('Jack Baker').why, true, line('Jack Baker').carrierName) ===
              "Tom would pass it on, but I can't reach Tom." &&
            APC.hostListReason(line('Poppy Whittaker')) === 'Yours — in your own household.' &&
            APC.hostListReason(line('Uma Singh')) === "No email, and I can't text that number."
        )
      );
      assert(
        'W',
        '[RULED words] the heading, the line under it, and the empty state',
        ok(
          () =>
            APC.HOST_LIST_HEADING === 'Yours to handle' &&
            APC.HOST_LIST_BLURB ===
              'Gather will not message these people. Each is named with what they have been asked for, and why it comes to you.' &&
            APC.HOST_LIST_EMPTY === 'Nobody.'
        )
      );
      assert(
        'W',
        '[RULED words] the reply-to line names the address, and says a text reply will not reach her',
        ok(
          () =>
            APC.replyToLine('nigel@mckorbett.co.nz') ===
            "Replies to an email come to nigel@mckorbett.co.nz. A text reply won't reach you — I have no way to pass it on."
        )
      );
      assert(
        'W',
        'the line shown when there is no reply-to, unchanged',
        ok(
          () =>
            APC.NO_REPLY_TO_LINE ===
            'No reply-to address: this event’s host has no account, so there is no email for replies to go to. What the press does then is not decided (GTC-189 decision 12).'
        )
      );
      const screenWords = (() => {
        try {
          return [
            APC.HOST_LIST_HEADING,
            APC.HOST_LIST_BLURB,
            APC.HOST_LIST_EMPTY,
            APC.replyToLine('someone@example.com'),
            APC.NO_REPLY_TO_LINE,
            ...HOST_LIST_WHYS.flatMap((why) => [
              reason(why, false),
              reason(why, true),
              reason(why, true, 'Tom Baker'),
            ]),
          ];
        } catch {
          return [];
        }
      })();
      assert(
        'W',
        'Gather says "I", never "we" — no word the view module puts on this screen says we, our or us',
        screenWords.length === 23 &&
          screenWords.every((w) => typeof w === 'string' && !/\b(we|our|us)\b/i.test(w))
      );
      assert(
        'W',
        'no reason names Gather in the third person',
        screenWords.length === 23 && screenWords.slice(5).every((w) => !/Gather/.test(w as string))
      );

      // ══ X — isolation ══════════════════════════════════════════════════════
      section("Layer X: isolation — one event's rows");

      assert(
        'X',
        "Ray holds a row on another event, and the main preview shows only this event's",
        ok(() => sameSet(rec('Ray Dalton').itemNames, ['sausages']))
      );
      const mainPEs = new Set(roster.map((r) => r.id));
      assert(
        'X',
        "every membership the preview names belongs to the event — the decoy's same-named Sarah and Ollie included",
        ok(() => {
          const named: string[] = [];
          for (const r of p.recipients) {
            named.push(r.personEventId);
            for (const c of r.carried) named.push(c.personEventId);
          }
          for (const l of p.hostList) named.push(l.personEventId);
          return (
            named.length >= 20 &&
            named.every((id) => mainPEs.has(id)) &&
            !named.some((id) => decoy.personEventIds.includes(id))
          );
        })
      );

      // ══ N — not the press ══════════════════════════════════════════════════
      section('Layer N: not the press');

      const moduleCode = codeOnly(sourceOf(MODULE_REL));
      const composeCode = codeOnly(sourceOf(COMPOSE_REL));
      const routeCode = codeOnly(sourceOf(ROUTE_REL));
      const pageCode = codeOnly(sourceOf(PAGE_REL));

      assert(
        'N',
        'the read wrote nothing — no token appeared on the event because the preview was read',
        p !== null && tokensAfterRead === 0
      );
      assert(
        'N',
        'the preview module exists and holds no write',
        moduleCode.length > 0 &&
          !/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(moduleCode)
      );
      assert(
        'N',
        'the Send button is still disabled outright',
        /<button[^>]*\sdisabled\s[^>]*>\s*Send\b/.test(pageCode)
      );
      assert(
        'N',
        'the page calls no send route',
        pageCode.length > 0 && !/confirm-invites-sent|\/send\b/.test(pageCode)
      );
      assert(
        'N',
        'the message route still exports GET and PATCH and nothing else',
        [...routeCode.matchAll(/export async function (\w+)/g)].map((m) => m[1]).join() ===
          'GET,PATCH'
      );

      // ══ P — wiring ═════════════════════════════════════════════════════════
      section('Layer P: wiring — the route delegates, the page composes through the view');

      assert(
        'P',
        "the route's GET answers with readAskPreview's result",
        /const (\w+) = await readAskPreview\(prisma, eventId[^)]*\);[\s\S]*?NextResponse\.json\(\1\)/.test(
          routeCode
        )
      );
      assert(
        'P',
        'the route no longer assembles recipients itself — no assignment query, no child filter',
        routeCode.length > 0 && !/prisma\.assignment|MESSAGEABLE_PERSON_EVENT/.test(routeCode)
      );
      assert(
        'P',
        'the preview module routes every membership through chooseAskRoute, imported from the chooser',
        /from '@\/lib\/eligibility\/channel-chooser'/.test(moduleCode) &&
          /\bchooseAskRoute\(/.test(moduleCode)
      );
      assert(
        'P',
        'the preview module reads no stored contactMethod',
        moduleCode.length > 0 && !/contactMethod/.test(moduleCode)
      );
      assert(
        'P',
        'the page composes through composePreview and never calls composeAsk itself',
        /\bcomposePreview\(/.test(pageCode) && !/\bcomposeAsk\(/.test(pageCode)
      );
      assert(
        'P',
        'the page passes no empty jobNames or carried — nothing is held back from composition',
        pageCode.length > 0 && !/jobNames:\s*\[\s*\]|carried:\s*\[\s*\]/.test(pageCode)
      );
      assert(
        'P',
        'the page renders the host list and its reasons',
        /\.hostList\b/.test(pageCode) && /\bhostListReason\(/.test(pageCode)
      );
      assert(
        'P',
        'the page renders the ruled words from the view module, and holds no copy of its own',
        /\{HOST_LIST_HEADING\}/.test(pageCode) &&
          /\{HOST_LIST_BLURB\}/.test(pageCode) &&
          /\{HOST_LIST_EMPTY\}/.test(pageCode) &&
          /\breplyToLine\(/.test(pageCode) &&
          /\{NO_REPLY_TO_LINE\}/.test(pageCode) &&
          !/Yours to handle|Replies to an email|No reply-to address|A text reply/.test(pageCode)
      );
      assert(
        'P',
        'no line on the page says "we"',
        pageCode.length > 0 && !/\b[Ww]e\b/.test(pageCode)
      );
      assert(
        'P',
        'the view module is client-safe — no database handle, no token module',
        composeCode.length > 0 && !/PrismaClient|@\/lib\/prisma|@\/lib\/tokens/.test(composeCode)
      );
    }
  } finally {
    // ══ K — cleanup ════════════════════════════════════════════════════════
    await cleanupFixture(created);
    section('Layer K: cleanup — only what the suite made');

    assert(
      'K',
      'every fixture event is gone',
      (await prisma.event.count({ where: { id: { in: created.eventIds } } })) === 0 &&
        created.eventIds.length === 2
    );
    assert(
      'K',
      "THE DECOY SURVIVES — its event, household, memberships, job and people, all sharing the fixture's names",
      await decoyStillThere(decoy)
    );
    await removeDecoy(decoy);
    const countsAfter = await rowCounts();
    assert(
      'K',
      'every table holds the row count it held before the suite began',
      countsAfter.join(',') === countsBefore.join(','),
      `before ${countsBefore.join(',')} after ${countsAfter.join(',')}`
    );
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of red) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log('\x1b[32mGREEN — the preview shows what the press will do.\x1b[0m');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
