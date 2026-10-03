/**
 * GTC-355 — Moment 3, "Who's on what?", Phase 1: assigning items directly to people.
 *
 * TEN LAYERS, 92 ASSERTIONS: the 79 the plan listed (PLAN RULINGS 2026-10-03 in
 * docs/tickets/GTC-355.md), and layer W's 13, added on the founder's instruction after the
 * RED run, before any source was written:
 *   A  the stage — an approved plan opens at Moment 3, and a returning host lands there
 *   B  the people panel — who appears, their icons, counts and the unplaced count
 *   C  the suggestions — structural, no AI, nothing written
 *   D  the completion panels
 *   E  the founder's words, typed HERE so a changed constant fails rather than agreeing
 *      with itself
 *   W  W2, W6 and W7, the approved new words, byte-exact and pinned where each is used
 *   F  the page and the view, read structurally
 *   G  the assignment rule — Q1(a): a person on no team, placed by host authority
 *   H  the round trip through the real routes, on the dev server
 *   I  the send reads what Moment 3 wrote (`readAskPreview`, in process)
 *
 * MODULES THAT DO NOT EXIST YET ARE LOADED BY A GUARDED IMPORT, so at RED each assertion
 * goes red on its own and the suite runs to its end; it never exits early. The two new
 * columns are written in their own guarded steps for the same reason: the fixture still
 * builds on a client that does not know them.
 *
 * NOTHING SENDS. No cron, no dispatcher, no press. `installProviderTrap` walls the process
 * after the real fetch is kept for the dev server on loopback, and H11 asserts the trap was
 * never reached and no OutboundMessage or InviteEvent exists on the fixture events.
 *
 * FIXTURES: every name and email carries this run's tag, no phone number is written, and
 * every row is removed by id in `finally`. Nothing it did not create is deleted.
 *
 * Needs the dev server on :3000, started as the constants file says (provider keys blank).
 * Run with: npm run test:moment-three
 */

import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { resolveSetupStage } from '../src/lib/setup/entry-stage';
import { whyTrigger } from '../src/lib/ledger';
import { mayHoldRow } from '../src/lib/assignment/same-team';
import { readAskPreview } from '../src/lib/preflight/ask-preview';
import { installProviderTrap, trapCount } from './helpers/provider-trap';

const ROOT = process.cwd();
const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';
const TAG = `GTC355-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;

const realFetch = globalThis.fetch;

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    red.push(label);
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}
function ok(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
async function okAsync(fn: () => Promise<boolean>): Promise<boolean> {
  try {
    return await fn();
  } catch {
    return false;
  }
}
async function load(rel: string): Promise<any | null> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}
function read(rel: string): string {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

// ── The founder's words, typed here (docs/moment-3-flow-document.md, and W1 to W7) ──
const DOC = {
  SENTENCE: "Now. Who's on what.",
  COUNTER_3_OF_7: '3 of 7 items assigned.',
  UNASSIGNED: 'unassigned',
  JUST_ATTENDING: 'Just attending',
  WANT_ME_TO_SUGGEST: 'Want me to suggest?',
  ALL_SORTED: 'All sorted →',
  ITEMS_STILL_4: '4 items still unassigned. You can come back to these anytime. Move on?',
  MOVE_ON: 'Move on →',
  KEEP_GOING: 'Keep going',
  EVERYONE_16_20: "Everyone's sorted. 16 people, 20 items, all decided.",
  PLAN_IS_HELD: "The plan is held. Now let's make sure everyone knows.",
  NO_PLAN_ITEMS: 'No plan items yet.',
  BACK_TO_PLAN: '← Back to the plan',
};
const W1 = "Who's on what?";
const W3 = (x: number) =>
  `${x} people have nothing to bring yet. That's fine — they can just attend. Move on?`;
const W3_ONE = "1 person has nothing to bring yet. That's fine — they can just attend. Move on?";
const W4 = '1 item still unassigned. You can come back to it anytime. Move on?';
const W2 = (x: number) => `${x} people with nothing yet.`;
const W2_ONE = '1 person with nothing yet.';
const W6 = "That didn't save. Try again.";
const W7_REMOVE = (name: string) => `Remove ${name}`;
const W7_GIVE = (item: string, name: string) => `Give ${item} to ${name}`;
const W7_DISMISS = 'Dismiss';
const W7_NOT_JA = 'Not just attending';

const PAGE = 'src/app/plan/[eventId]/setup/page.tsx';
const VIEW = 'src/components/plan/Moment3AssignView.tsx';
const ARC = 'src/components/plan/MomentArc.tsx';
const SUGGEST = 'src/lib/moment3/suggest.ts';

async function main() {
  const createdEventIds: string[] = [];
  const createdPersonIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    const people = await load('../src/lib/moment3/people');
    const suggest = await load('../src/lib/moment3/suggest');
    const completion = await load('../src/lib/moment3/completion');
    const words = await load('../src/lib/moment3/words');

    // ══ LAYER A — the stage ═════════════════════════════════════════════════════════
    section('Layer A — an approved plan opens at Moment 3');
    const stage = resolveSetupStage as (input: any) => string;
    assert(
      'A1 an approved plan with generated items opens at moment3',
      ok(
        () =>
          stage({
            items: [{ source: 'GENERATED' }],
            hasSetup: true,
            householdCount: 0,
            planApproved: true,
          }) === 'moment3'
      )
    );
    assert(
      'A2 an approved plan with no items still opens at moment3 (she may approve an empty plan)',
      ok(
        () =>
          stage({ items: [], hasSetup: true, householdCount: 0, planApproved: true }) === 'moment3'
      )
    );
    assert(
      'A3 CONTROL: a generated plan not yet approved opens at the plan, as today',
      ok(
        () =>
          stage({
            items: [{ source: 'GENERATED' }],
            hasSetup: true,
            householdCount: 0,
            planApproved: false,
          }) === 'plan'
      )
    );
    assert(
      'A4 CONTROL: the flag with no EventSetup (the V1 shape) still opens at the opening screen',
      ok(
        () =>
          stage({
            items: [{ source: 'GENERATED' }],
            hasSetup: false,
            householdCount: 0,
            planApproved: true,
          }) === 'opening'
      )
    );

    const now = new Date();
    const hostUser = await prisma.user.create({ data: { email: `${TAG}-host@example.com` } });
    createdUserIds.push(hostUser.id);
    const token = randomBytes(24).toString('hex');
    await prisma.session.create({
      data: { userId: hostUser.id, token, expiresAt: new Date(now.getTime() + DAY) },
    });
    const COOKIE = { Cookie: `session=${token}`, 'Content-Type': 'application/json' };
    const kate = await prisma.person.create({
      data: { name: `${TAG} Kate`, email: `${TAG}-kate@example.com`, userId: hostUser.id },
    });
    createdPersonIds.push(kate.id);

    async function makeEvent(suffix: string) {
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} ${suffix}`,
          startDate: new Date(now.getTime() + 30 * DAY),
          endDate: new Date(now.getTime() + 30 * DAY + 6 * 60 * 60 * 1000),
          hostId: kate.id,
          status: 'DRAFT',
        },
      });
      createdEventIds.push(ev.id);
      await prisma.eventRole.create({
        data: { userId: hostUser.id, eventId: ev.id, role: 'HOST' },
      });
      await prisma.eventSetup.create({ data: { eventId: ev.id, eventType: 'BBQ' } });
      return ev;
    }

    // A5 — over rows read from the database, the way the page reads them.
    const aEvent = await makeEvent('stage');
    const aTeam = await prisma.team.create({
      data: { eventId: aEvent.id, name: 'Mains', source: 'GENERATED' },
    });
    await prisma.item.create({
      data: { teamId: aTeam.id, name: 'Glazed ham', source: 'GENERATED' },
    });
    await okAsync(async () => {
      await (prisma.eventSetup as any).update({
        where: { eventId: aEvent.id },
        data: { planApprovedAt: new Date() },
      });
      return true;
    });
    assert(
      'A5 from the database: planApprovedAt set, read as the page reads it, gives moment3',
      await okAsync(async () => {
        const ev: any = await (prisma.event as any).findUniqueOrThrow({
          where: { id: aEvent.id },
          select: { setup: { select: { id: true, planApprovedAt: true } } },
        });
        const items = await prisma.item.findMany({
          where: { team: { eventId: aEvent.id } },
          select: { source: true },
        });
        return (
          stage({
            items,
            hasSetup: Boolean(ev.setup),
            householdCount: 0,
            planApproved: Boolean(ev.setup?.planApprovedAt),
          }) === 'moment3'
        );
      })
    );

    // ── The main fixture: a Moment-flow event with Moment 1's households ──
    const ev = await makeEvent('moment 3');
    const mains = await prisma.team.create({
      data: { eventId: ev.id, name: 'Mains', source: 'GENERATED' },
    });
    const setUp = await prisma.team.create({
      data: { eventId: ev.id, name: 'Set up', source: 'GENERATED' },
    });
    const hostHh = await prisma.household.create({ data: { eventId: ev.id } });
    const mumHh = await prisma.household.create({ data: { eventId: ev.id, littleCount: 1 } });

    async function member(
      name: string,
      householdId: string,
      householdRole: 'PRIMARY_CONTACT' | 'PARTNER' | 'CHILD' | 'GUEST',
      over: { email?: boolean; teamId?: string | null; isYoungPerson?: boolean } = {}
    ) {
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: over.email === false ? null : `${TAG}-${name.toLowerCase()}@example.com`,
        },
      });
      createdPersonIds.push(p.id);
      await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: ev.id,
          role: 'PARTICIPANT',
          householdId,
          householdRole,
          isYoungPerson: over.isYoungPerson ?? false,
          teamId: over.teamId ?? null,
        },
      });
      return p;
    }

    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId: ev.id,
        role: 'HOST',
        householdId: hostHh.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    const ana = await member('Ana', hostHh.id, 'GUEST');
    const cara = await member('Cara', hostHh.id, 'GUEST', { teamId: mains.id });
    const mum = await member('Mum', mumHh.id, 'PRIMARY_CONTACT');
    const ross = await member('Ross', mumHh.id, 'PARTNER');
    const kid = await member('Ollie', mumHh.id, 'CHILD', { email: false, isYoungPerson: true });

    const ribs = await prisma.item.create({
      data: { teamId: mains.id, name: 'Smoked ribs', kind: 'ITEM', source: 'GENERATED' },
    });
    const rolls = await prisma.item.create({
      data: { teamId: mains.id, name: 'Bread rolls', kind: 'ITEM', source: 'GENERATED' },
    });
    const pavlova = await prisma.item.create({
      data: { teamId: mains.id, name: 'Pavlova', kind: 'ITEM', source: 'GENERATED' },
    });
    const chips = await prisma.item.create({
      data: { teamId: mains.id, name: 'Chips', kind: 'ITEM', source: 'GENERATED' },
    });
    const wash = await prisma.item.create({
      data: { teamId: setUp.id, name: 'Wash the glasses', kind: 'TASK', source: 'GENERATED' },
    });
    await prisma.assignment.create({ data: { itemId: pavlova.id, personId: cara.id } });
    await prisma.assignment.create({ data: { itemId: chips.id, personId: cara.id } });

    // Walls up. The real fetch is kept for loopback, which the walls leave open.
    installProviderTrap();
    const trapBefore = trapCount();
    async function call(method: string, rel: string, body?: unknown, headers = COOKIE) {
      const res = await realFetch(`${BASE}${rel}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    }
    const assignPath = (itemId: string) => `/api/events/${ev.id}/items/${itemId}/assign`;
    const personPath = (personId: string) => `/api/events/${ev.id}/people/${personId}`;
    async function justAttendingOf(personId: string): Promise<boolean | undefined> {
      const pe: any = await (prisma.personEvent as any).findUniqueOrThrow({
        where: { personId_eventId: { personId, eventId: ev.id } },
        select: { justAttending: true },
      });
      return pe.justAttending;
    }

    const notYes = await okAsync(async () => {
      const r = await call('POST', `/api/events/${ev.id}/setup`, { planApproved: 'yes' });
      return r.status === 400;
    });
    const approve = await call('POST', `/api/events/${ev.id}/setup`, { planApproved: true }).catch(
      () => ({ status: 0, json: null })
    );
    assert(
      'A6 HTTP: POST /setup {planApproved: true} answers 200 and stamps planApprovedAt',
      approve.status === 200 &&
        (await okAsync(async () => {
          const s: any = await (prisma.eventSetup as any).findUniqueOrThrow({
            where: { eventId: ev.id },
            select: { planApprovedAt: true },
          });
          return s.planApprovedAt instanceof Date;
        })),
      `status ${approve.status}`
    );
    assert("A7 HTTP: {planApproved: 'yes'} answers 400", notYes);
    assert(
      'A8 HTTP: GET /api/events/[id] carries setup.planApprovedAt',
      await okAsync(async () => {
        const r = await call('GET', `/api/events/${ev.id}`);
        const setup = r.json?.event?.setup;
        return (
          r.status === 200 &&
          setup != null &&
          Object.prototype.hasOwnProperty.call(setup, 'planApprovedAt') &&
          setup.planApprovedAt !== null
        );
      })
    );

    // ══ LAYER B — the people panel ══════════════════════════════════════════════════
    section('Layer B — the people panel');
    const M = (
      personId: string,
      householdRole: string,
      over: { role?: string; isYoungPerson?: boolean; justAttending?: boolean } = {}
    ) => ({
      personId,
      role: over.role ?? 'PARTICIPANT',
      householdRole,
      isYoungPerson: over.isYoungPerson ?? false,
      justAttending: over.justAttending ?? false,
      person: { id: personId, name: personId },
    });
    const HH = [
      { id: 'h-host', littleCount: 2, members: [M('host', 'PRIMARY_CONTACT', { role: 'HOST' })] },
      {
        id: 'h-mum',
        littleCount: 0,
        // Deliberately out of order: the panel orders them, not the wire.
        members: [
          M('gus', 'GUEST'),
          M('ana', 'GUEST', { justAttending: true }),
          M('kid', 'CHILD', { isYoungPerson: true }),
          M('ross', 'PARTNER'),
          M('mum', 'PRIMARY_CONTACT'),
          M('zed', 'GUEST', { justAttending: true }),
        ],
      },
    ];
    const I = (id: string, assignee: string | null, kind = 'ITEM') => ({
      id,
      kind,
      assignment: assignee ? { person: { id: assignee } } : null,
    });
    const ITEMS = [
      I('i1', 'ross'),
      I('i2', 'ross'),
      I('i3', 'ana'),
      I('i4', null),
      I('i5', null),
      I('i6', null),
      I('i7', null),
    ];
    const rows = (): any[] => people.buildPeoplePanel(HH, ITEMS, 'host');
    const row = (id: string) => rows().find((r: any) => r.personId === id);
    assert(
      'B1 rows for the primary contact, partner, kid with a job and guests; littleCount adds none',
      ok(() => {
        const ids = rows().map((r: any) => r.personId);
        return (
          ids.length === 7 &&
          ['host', 'mum', 'ross', 'kid', 'gus', 'ana', 'zed'].every((x) => ids.includes(x))
        );
      })
    );
    assert(
      'B2 icons: 👫 partner, 👦 a kid with a job, 👤 everyone else',
      ok(
        () =>
          row('ross').icon === '👫' &&
          row('kid').icon === '👦' &&
          row('mum').icon === '👤' &&
          row('gus').icon === '👤' &&
          row('host').icon === '👤'
      )
    );
    assert(
      "B3 each person's count is the items they hold",
      ok(() => row('ross').count === 2 && row('ana').count === 1 && row('gus').count === 0)
    );
    assert(
      'B4 nothing held and unmarked is unplaced; marked is not; the count agrees',
      ok(
        () =>
          row('gus').nothingYet === true &&
          row('zed').nothingYet === false &&
          people.unplacedCount(rows()) === 4
      )
    );
    assert(
      'B5 a marked person holding an item counts it and is not unplaced',
      ok(() => row('ana').count === 1 && row('ana').nothingYet === false)
    );
    assert(
      'B6 order: households as Moment 1 lists them, then primary, partner, kids, guests',
      ok(
        () =>
          rows()
            .map((r: any) => r.personId)
            .join(',') === 'host,mum,ross,kid,gus,ana,zed'
      )
    );
    assert(
      'B7 the host appears',
      ok(() => row('host')?.isHost === true)
    );
    assert(
      'B8 the counter reads "3 of 7 items assigned."',
      ok(() => people.assignedCounterLine(ITEMS) === DOC.COUNTER_3_OF_7)
    );

    // ══ LAYER C — the suggestions ═══════════════════════════════════════════════════
    section('Layer C — the suggestions: structural, no AI, nothing written');
    const P = (
      personId: string,
      count: number,
      over: { isHost?: boolean; justAttending?: boolean; isKidWithJob?: boolean } = {}
    ) => ({
      personId,
      count,
      isHost: over.isHost ?? false,
      justAttending: over.justAttending ?? false,
      isKidWithJob: over.isKidWithJob ?? false,
    });
    const S = (id: string, kind = 'ITEM', assigneePersonId: string | null = null) => ({
      id,
      kind,
      assigneePersonId,
    });
    const run = (items: any[], ppl: any[]): any[] => suggest.suggestAssignments(items, ppl);
    const to = (out: any[], itemId: string) => out.find((s: any) => s.itemId === itemId)?.personId;
    assert(
      'C1 each unassigned row goes to the person holding fewest',
      ok(() => to(run([S('i1')], [P('a', 2), P('b', 0), P('c', 1)]), 'i1') === 'b')
    );
    assert(
      'C2 a batch spreads: 4 rows, 2 people holding nothing, 2 each',
      ok(() => {
        const out = run([S('i1'), S('i2'), S('i3'), S('i4')], [P('a', 0), P('b', 0)]);
        const a = out.filter((s: any) => s.personId === 'a').length;
        const b = out.filter((s: any) => s.personId === 'b').length;
        return out.length === 4 && a === 2 && b === 2;
      })
    );
    assert(
      'C3 never the host (GTC-256 Ruling 9)',
      ok(() => to(run([S('i1')], [P('host', 0, { isHost: true }), P('a', 3)]), 'i1') === 'a')
    );
    assert(
      'C4 never a person marked just attending',
      ok(() => to(run([S('i1')], [P('ja', 0, { justAttending: true }), P('a', 3)]), 'i1') === 'a')
    );
    assert(
      'C5 a kid with a job only on a job (TASK) row',
      ok(() => {
        const out = run(
          [S('i1'), S('j1', 'TASK')],
          [P('kid', 0, { isKidWithJob: true }), P('a', 3)]
        );
        return to(out, 'i1') === 'a' && to(out, 'j1') === 'kid';
      })
    );
    assert(
      'C6 an assigned row gets no suggestion',
      ok(() => run([S('i1', 'ITEM', 'a')], [P('a', 1), P('b', 0)]).length === 0)
    );
    assert(
      'C7 a tie goes to the person first in the panel',
      ok(() => to(run([S('i1')], [P('a', 0), P('b', 0)]), 'i1') === 'a')
    );
    assert(
      'C8 no candidate means no suggestion, not a throw',
      ok(() => {
        const out = run([S('i1')], [P('host', 0, { isHost: true })]);
        return Array.isArray(out) && out.length === 0;
      })
    );
    const suggestSrc = read(SUGGEST);
    assert(
      'C9 no AI: the module imports nothing from src/lib/ai or @anthropic-ai, and calls no fetch',
      suggestSrc.length > 0 &&
        !/from\s+['"](@\/lib\/ai|[^'"]*\/lib\/ai)[/'"]/.test(suggestSrc) &&
        !/@anthropic-ai/.test(suggestSrc) &&
        !/\bfetch\(/.test(suggestSrc)
    );
    assert(
      'C10 it writes nothing: no prisma import, no route path',
      suggestSrc.length > 0 && !/prisma/i.test(suggestSrc) && !/\/api\//.test(suggestSrc)
    );

    // ══ LAYER D — the completion panels ═════════════════════════════════════════════
    section('Layer D — the completion panels');
    const panel = (u: number, p: number, h = 16, i = 20): any =>
      completion.completionPanel({
        unassignedItems: u,
        unplacedPeople: p,
        headcount: h,
        itemCount: i,
      });
    assert(
      'D1 unassigned items give the items panel with X',
      ok(
        () => panel(4, 2).kind === 'ITEMS_UNASSIGNED' && panel(4, 2).lines[0] === DOC.ITEMS_STILL_4
      )
    );
    assert(
      'D2 one unassigned item gives W4',
      ok(() => panel(1, 0).lines[0] === W4)
    );
    assert(
      'D3 all assigned and people unplaced gives W3 with X (and its singular)',
      ok(
        () =>
          panel(0, 3).kind === 'PEOPLE_UNPLACED' &&
          panel(0, 3).lines[0] === W3(3) &&
          panel(0, 1).lines[0] === W3_ONE
      )
    );
    assert(
      'D4 all decided gives "Everyone\'s sorted." with the headcount and item count, then the second line',
      ok(() => {
        const d = panel(0, 0, 16, 20);
        return (
          d.kind === 'ALL_DECIDED' &&
          d.lines.length === 2 &&
          d.lines[0] === DOC.EVERYONE_16_20 &&
          d.lines[1] === DOC.PLAN_IS_HELD
        );
      })
    );
    assert(
      'D5 every panel carries "Move on →" and "Keep going"',
      ok(() =>
        [panel(4, 2), panel(0, 3), panel(0, 0)].every(
          (d: any) => d.moveOn === DOC.MOVE_ON && d.keepGoing === DOC.KEEP_GOING
        )
      )
    );

    // ══ LAYER E — the words ═════════════════════════════════════════════════════════
    section("Layer E — the founder's words, typed here");
    const Wd = words?.M3_WORDS ?? {};
    const eq = (label: string, fn: () => boolean) => assert(label, ok(fn));
    eq('E1 "Now. Who\'s on what."', () => Wd.SENTENCE === DOC.SENTENCE);
    eq('E2 "[X] of [Y] items assigned."', () => words.assignedCounter(3, 7) === DOC.COUNTER_3_OF_7);
    eq('E3 "unassigned"', () => Wd.UNASSIGNED === DOC.UNASSIGNED);
    eq('E4 "Just attending"', () => Wd.JUST_ATTENDING === DOC.JUST_ATTENDING);
    eq('E5 "Want me to suggest?"', () => Wd.WANT_ME_TO_SUGGEST === DOC.WANT_ME_TO_SUGGEST);
    eq('E6 "All sorted →"', () => Wd.ALL_SORTED === DOC.ALL_SORTED);
    eq(
      'E7 "[X] items still unassigned. You can come back to these anytime. Move on?"',
      () => words.itemsStillUnassigned(4) === DOC.ITEMS_STILL_4
    );
    eq('E8 "Move on →"', () => Wd.MOVE_ON === DOC.MOVE_ON);
    eq('E9 "Keep going"', () => Wd.KEEP_GOING === DOC.KEEP_GOING);
    eq(
      'E10 "Everyone\'s sorted. [X] people, [X] items, all decided."',
      () => words.everyoneSorted(16, 20) === DOC.EVERYONE_16_20
    );
    eq(
      'E11 "The plan is held. Now let\'s make sure everyone knows."',
      () => Wd.PLAN_IS_HELD === DOC.PLAN_IS_HELD
    );
    eq('E12 "No plan items yet."', () => Wd.NO_PLAN_ITEMS === DOC.NO_PLAN_ITEMS);
    eq('E13 "← Back to the plan"', () => Wd.BACK_TO_PLAN === DOC.BACK_TO_PLAN);
    const arc = read(ARC);
    assert(
      'E14 the arc\'s third label is "Who\'s on what?" (W1)',
      /number:\s*3,\s*label:\s*"Who's on what\?"/.test(arc)
    );
    assert(
      "E15 CONTROL: the arc's labels 1, 2 and 4 are unchanged",
      /number:\s*1,\s*label:\s*"Who's coming\?"/.test(arc) &&
        /number:\s*2,\s*label:\s*"What's the plan\?"/.test(arc) &&
        /number:\s*4,\s*label:\s*'Is everyone sorted\?'/.test(arc)
    );

    const page = read(PAGE);
    const view = read(VIEW);

    // ══ LAYER W — W2, W6 and W7, approved 2026-10-03, pinned byte-exact and where used ══
    section('Layer W — the approved new words, byte-exact and where each is used');
    assert(
      'W2a W2 both forms: "[X] people with nothing yet." and "1 person with nothing yet."',
      ok(
        () =>
          words.peopleWithNothing(3) === W2(3) &&
          words.peopleWithNothing(1) === W2_ONE &&
          words.peopleWithNothing(2) === W2(2)
      )
    );
    assert(
      "W2b W2 through the panel: the people panel's line for 4 unplaced, and for 1",
      ok(() => {
        const one = people.buildPeoplePanel(
          [
            {
              id: 'h',
              littleCount: 0,
              members: [
                M('host', 'PRIMARY_CONTACT', { role: 'HOST', justAttending: true }),
                M('gus', 'GUEST'),
              ],
            },
          ],
          [],
          'host'
        );
        return people.unplacedLine(rows()) === W2(4) && people.unplacedLine(one) === W2_ONE;
      })
    );
    assert(
      'W2c W2 heads the people panel: the view renders the panel line at its head',
      view.length > 0 && /data-m3="people-head"[\s\S]{0,300}?unplacedLine\(/.test(view)
    );
    assert(
      'W6a W6 "That didn\'t save. Try again."',
      ok(() => Wd.SAVE_FAILED === W6)
    );
    assert(
      'W6b W6 shows on a failed save: the view toasts it as an error',
      view.length > 0 && /toast\.error\(\s*M3_WORDS\.SAVE_FAILED\s*\)/.test(view)
    );
    assert(
      'W7a W7 "Remove [name]"',
      ok(() => words.removeLabel('Ross') === W7_REMOVE('Ross'))
    );
    assert(
      'W7b W7 "Give [item] to [name]"',
      ok(() => words.giveLabel('Smoked ribs', 'Ross') === W7_GIVE('Smoked ribs', 'Ross'))
    );
    assert(
      'W7c W7 "Dismiss"',
      ok(() => Wd.DISMISS_LABEL === W7_DISMISS)
    );
    assert(
      'W7d W7 "Not just attending"',
      ok(() => Wd.NOT_JUST_ATTENDING_LABEL === W7_NOT_JA)
    );
    assert(
      'W7e × on an item has W7\'s "Remove [name]" as its accessible name',
      view.length > 0 && /aria-label=\{removeLabel\(/.test(view)
    );
    assert(
      'W7f ✓ on a suggestion has W7\'s "Give [item] to [name]" as its accessible name',
      view.length > 0 && /aria-label=\{giveLabel\(/.test(view)
    );
    assert(
      'W7g × on a suggestion has W7\'s "Dismiss" as its accessible name',
      view.length > 0 && /aria-label=\{M3_WORDS\.DISMISS_LABEL\}/.test(view)
    );
    assert(
      'W7h × on the mark has W7\'s "Not just attending" as its accessible name',
      view.length > 0 && /aria-label=\{M3_WORDS\.NOT_JUST_ATTENDING_LABEL\}/.test(view)
    );

    // ══ LAYER F — the page and the view, structurally ═══════════════════════════════
    section('Layer F — the page and the view, read structurally');
    const sourcesExist = view.length > 0 && page.length > 0;
    const both = page + '\n' + view;
    assert(
      'F1 the setup page has the moment3 stage and renders the view',
      sourcesExist && page.includes("'moment3'") && /<Moment3AssignView[\s>]/.test(page)
    );
    assert(
      'F2 onApprove posts planApproved then opens Moment 3, with no button between',
      sourcesExist &&
        /onApprove=\{async \(\) => \{[\s\S]{0,1500}?planApproved: true[\s\S]{0,800}?applyStage\('moment3'\)/.test(
          page
        )
    );
    assert(
      'F3 the view never toasts on success and never calls confirm',
      sourcesExist && !/toast\.(success|info)\(/.test(view) && !/\bconfirm\(/.test(view)
    );
    assert(
      'F4 the view shows the arc at 3, with 1 and 2 done',
      sourcesExist && /<MomentArc\s+currentMoment=\{3\}\s+completedMoments=\{\[1, 2\]\}/.test(view)
    );
    assert(
      'F5 "Move on →" goes to /plan/[id]/pre-flight',
      sourcesExist && /\/plan\/\$\{[^}]+\}\/pre-flight/.test(both)
    );
    const viewFetches = view.match(/fetch\(\s*`[^`]*`/g) ?? [];
    assert(
      'F6 it assigns only through the existing assign route (and writes only the routes it reuses)',
      sourcesExist &&
        viewFetches.some((f) => /\/items\/\$\{[^}]+\}\/assign`/.test(f)) &&
        viewFetches.every((f) =>
          /`\/api\/events\/\$\{[^}]+\}\/(items\/\$\{[^}]+\}\/assign|people\/\$\{[^}]+\}|check)`/.test(
            f
          )
        )
    );
    assert(
      'F7 it posts /check after a change, only when lastCheckPlanAt is set',
      sourcesExist && /lastCheckPlanAt/.test(view) && /\/check`/.test(view)
    );
    assert(
      'F8a each change goes through askForReason',
      sourcesExist &&
        /askForReason\(/.test(view) &&
        view.includes("'CREATE_ASSIGNMENT'") &&
        view.includes("'DELETE_ASSIGNMENT'")
    );
    assert(
      'F8b CONTROL: whyTrigger on CREATE_ASSIGNMENT for an unsent event is null — no prompt before the send',
      ok(
        () =>
          whyTrigger(
            { action: 'CREATE_ASSIGNMENT', targetType: 'Assignment', targetId: 'x' } as any,
            { status: 'DRAFT', sentAt: null, endDate: new Date(now.getTime() + 30 * DAY) } as any
          ) === null
      )
    );
    assert(
      "F9 unassigned rows and people with nothing are marked from the model's flags",
      sourcesExist && /nothingYet/.test(view) && /border-dotted/.test(view)
    );
    assert(
      'F10 ArrowUp, ArrowDown, Enter and Escape are handled',
      sourcesExist &&
        ["'ArrowUp'", "'ArrowDown'", "'Enter'", "'Escape'"].every((k) => view.includes(k))
    );
    const sortedAt = view.indexOf('data-m3="all-sorted"');
    const beforeSorted = sortedAt > 0 ? view.slice(Math.max(0, sortedAt - 400), sortedAt) : '';
    assert(
      'F11 "All sorted →" is rendered outside any condition (a structural read of the source)',
      sourcesExist && sortedAt > 0 && !/&&|\?\s*\(|\?\s*</.test(beforeSorted)
    );
    assert(
      'F12 no "Set up teams instead →" in Phase 1',
      sourcesExist && !both.includes('Set up teams instead')
    );

    // ══ LAYER G — the assignment rule ═══════════════════════════════════════════════
    section('Layer G — Q1(a): a person on no team, placed by host authority');
    const guestNoTeam = { personId: 'g', role: 'PARTICIPANT', teamId: null };
    const dish = { kind: 'ITEM', teamId: 'mains' };
    assert(
      'G1 a guest on no team may hold a dish on any team when the host places them',
      mayHoldRow(guestNoTeam, dish, 'HOST', 'the-host') === true
    );
    assert(
      'G2 and when a co-host places them',
      mayHoldRow(guestNoTeam, dish, 'COHOST', 'the-host') === true
    );
    assert(
      'G3 CONTROL: not when a coordinator places them',
      mayHoldRow(guestNoTeam, dish, 'COORDINATOR', 'the-host') === false
    );
    assert(
      'G4 CONTROL: a guest on a team is still fenced to it, even placed by the host',
      mayHoldRow(
        { personId: 'g', role: 'PARTICIPANT', teamId: 'desserts' },
        dish,
        'HOST',
        'the-host'
      ) === false
    );
    assert(
      'G5 CONTROL: the host picking for herself, unchanged',
      mayHoldRow({ personId: 'the-host', role: 'HOST', teamId: null }, dish, 'HOST', 'the-host') ===
        true
    );

    // ══ LAYER H — the round trip ════════════════════════════════════════════════════
    section('Layer H — the round trip through the real routes');
    const unauth = await call('POST', assignPath(ribs.id), { personId: ross.id }, {
      'Content-Type': 'application/json',
    } as any).catch(() => ({ status: 0, json: null }));
    assert(
      'H0 the dev server is healthy: the assign route answers 401 with no cookie',
      unauth.status === 401,
      `status ${unauth.status}`
    );
    const h1 = await call('POST', assignPath(ribs.id), { personId: ross.id });
    assert(
      'H1 the host gives Ross (no team) a Mains dish: 200',
      h1.status === 200,
      `status ${h1.status} ${h1.json?.error ?? ''}`
    );
    const ribRows1 = await prisma.assignment.findMany({ where: { itemId: ribs.id } });
    assert(
      "H2 the dish has exactly one Assignment, Ross's",
      ribRows1.length === 1 && ribRows1[0].personId === ross.id
    );
    const h3 = await call('POST', assignPath(ribs.id), { personId: mum.id });
    const ribRows2 = await prisma.assignment.findMany({ where: { itemId: ribs.id } });
    assert(
      "H3 giving it to Mum moves it: still one row, now Mum's (acceptance 4)",
      h3.status === 200 && ribRows2.length === 1 && ribRows2[0].personId === mum.id,
      `status ${h3.status}`
    );
    const h4 = await call('DELETE', assignPath(chips.id), {});
    assert(
      'H4 CONTROL: × on a seeded assignment answers 200, and none is left',
      h4.status === 200 && (await prisma.assignment.count({ where: { itemId: chips.id } })) === 0,
      `status ${h4.status}`
    );
    const h5 = await call('POST', assignPath(wash.id), { personId: ross.id });
    assert(
      'H5 CONTROL: a job to a guest on no team answers 200',
      h5.status === 200,
      `status ${h5.status}`
    );
    const h6 = await call('POST', assignPath(rolls.id), { personId: kid.id });
    assert(
      'H6 a kid with a job (no team) is given a dish: 200',
      h6.status === 200,
      `status ${h6.status}`
    );
    const h7 = await call('PATCH', personPath(ana.id), { justAttending: true });
    assert(
      'H7 PATCH {justAttending: true} answers 200 and it is stored',
      h7.status === 200 && (await okAsync(async () => (await justAttendingOf(ana.id)) === true)),
      `status ${h7.status}`
    );
    const h8 = await call('PATCH', personPath(ana.id), { justAttending: 'yes' });
    assert("H8 PATCH {justAttending: 'yes'} answers 400", h8.status === 400, `status ${h8.status}`);
    const h9a = await call('PATCH', personPath(cara.id), { justAttending: true });
    const caraSet = await okAsync(async () => (await justAttendingOf(cara.id)) === true);
    const h9b = await call('PATCH', personPath(cara.id), { justAttending: false });
    assert(
      'H9 PATCH {justAttending: false} clears it',
      h9a.status === 200 &&
        caraSet &&
        h9b.status === 200 &&
        (await okAsync(async () => (await justAttendingOf(cara.id)) === false)),
      `status ${h9a.status}/${h9b.status}`
    );
    const caraPe = await prisma.personEvent.findUnique({
      where: { personId_eventId: { personId: cara.id, eventId: ev.id } },
    });
    const caraPav = await prisma.assignment.findUnique({ where: { itemId: pavlova.id } });
    assert(
      'H10 CONTROL: the mark leaves team, role and every assignment of theirs untouched',
      caraPe?.teamId === mains.id && caraPe?.role === 'PARTICIPANT' && caraPav?.personId === cara.id
    );

    // ══ LAYER I — the send reads what Moment 3 wrote ═════════════════════════════════
    section('Layer I — the pre-flight and the press read the same Assignment');
    const preview = await readAskPreview(prisma, ev.id, BASE).catch(() => null);
    const recipient = (personId: string) =>
      preview?.recipients.find((r) => r.personId === personId);
    assert(
      'I1 Mum is a recipient with the Mains dish in her itemNames (acceptance 9)',
      ok(() => (recipient(mum.id)?.itemNames ?? []).some((n) => /ribs/i.test(n)))
    );
    assert(
      'I2 the marked adult holding nothing is stored as marked AND still a recipient, itemless (note 6)',
      (await okAsync(async () => (await justAttendingOf(ana.id)) === true)) &&
        ok(() => {
          const r = recipient(ana.id);
          return r !== undefined && r.itemNames.length === 0 && r.jobNames.length === 0;
        })
    );
    assert(
      'I3 CONTROL: the preview reads the fixture — the control guest shows with their seeded item',
      ok(() => (recipient(cara.id)?.itemNames ?? []).some((n) => /pavlova/i.test(n)))
    );

    // H11 last, so it covers every request above.
    const outbound = await prisma.outboundMessage.count({
      where: { eventId: { in: createdEventIds } },
    });
    const invites = await prisma.inviteEvent.count({ where: { eventId: { in: createdEventIds } } });
    assert(
      'H11 nothing left the process, and the fixture events have no OutboundMessage and no InviteEvent',
      trapCount() === trapBefore && trapCount() === 0 && outbound === 0 && invites === 0,
      `trap ${trapCount()}, outbound ${outbound}, invites ${invites}`
    );
  } catch (err) {
    assert('the suite ran to completion', false, String(err));
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.auditEntry.deleteMany({ where: { eventId } }).catch(() => {});
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.eventRole.deleteMany({ where: { eventId } });
      await prisma.eventSetup.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    if (createdUserIds.length) {
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  }

  console.log('\n\x1b[1m\x1b[33m=== Summary ===\x1b[0m');
  console.log(`Total: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  if (failed > 0) {
    console.error('\nRED:');
    for (const r of red) console.error(`  ${r.split(' ')[0]}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
