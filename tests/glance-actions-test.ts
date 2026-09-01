/**
 * GTC-192 (J1, phase 4) — tap-for-actions, the second layer.
 *
 * §3: "Behind a tap: all actions (remind, reassign, take over a silence) — looking never
 * becomes operating." This file proves the three actions reach the EXISTING routes and
 * their existing guards, and that the surface cannot reach around any of them.
 *
 * ── WHAT IS UNDER TEST IS THE WIRING, NOT THE DELIVERY ────────────────────────
 *
 * [[GTC-247]]: no send path in this environment authenticates — not Twilio, not TNZ, not
 * Resend. A manual nudge from this surface therefore FAILS AT THE PROVIDER, and that
 * failure is asserted rather than stubbed away. What is under test is that the guards fire
 * BEFORE the provider is reached and that nothing is logged as sent when nothing was.
 *
 * FOUR LAYERS:
 *  1. Pure — the action layer's refusals, its request shapes, and its candidate filter.
 *     No network, no database.
 *  2. Fetch spy — the action layer driven with an injected fetch, so "the surface refused
 *     before the network" is a COUNT OF CALLS rather than a claim about intent.
 *  3. HTTP — the real routes over the real server, with a real host session cookie. The
 *     assign and nudge routes read `cookies()`, so they cannot be driven in process (the
 *     reason tests/child-assignment-eligibility-test.ts gives); a round trip is the only
 *     honest proof that the action lands.
 *  4. Structural — the surface's source: one definition of the same-team rule, one
 *     definition of the mark, no second send path, no new API route, and reds tappable
 *     while nothing else is.
 *
 * Ruling 1's behaviour fence is NOT duplicated here — it lives in
 * `tests/glance-read-test.ts`, which this phase extends to the two new sources.
 *
 * Run: npm run test:glance-actions   (requires `npm run dev` on localhost:3000)
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getHostNudgeMessage } from '../src/lib/sms/nudge-templates';
import { SAME_TEAM_ERROR } from '../src/lib/assignment/same-team';
import { HOST_NOT_ADDRESSABLE_MESSAGE } from '../src/lib/eligibility/host-exclusion';

const prisma = new PrismaClient();

const TAG = 'GTC192P4';
const BASE = process.env.GLANCE_TEST_BASE_URL ?? 'http://localhost:3000';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

function raw(rel: string): string {
  try {
    return readFileSync(join(__dirname, '..', rel), 'utf8');
  } catch {
    return '';
  }
}

/** Source with comments stripped — prose about a rule must not satisfy an assertion. */
function code(rel: string): string {
  return raw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** A spy standing in for `fetch`. Records every call; answers whatever it is told to. */
function spyFetch(reply: { status: number; body: unknown }) {
  const calls: { url: string; init: any }[] = [];
  const impl = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    } as any;
  };
  return { calls, impl: impl as unknown as typeof fetch };
}

/** A glance item, as the payload shapes one. */
function item(over: Record<string, unknown> = {}): any {
  return {
    itemId: 'i1',
    assignmentId: 'a1',
    name: 'The pavlova',
    critical: true,
    state: 'RED',
    reason: 'DECIDE_BY_EXPIRED',
    decideByAt: null,
    kind: 'ITEM',
    teamId: 't-mains',
    ...over,
  };
}

/** A glance person, as the payload shapes one. */
function person(over: Record<string, unknown> = {}): any {
  return {
    personEventId: 'pe1',
    personId: 'p1',
    name: 'Amelia Turner',
    isHost: false,
    role: 'PARTICIPANT',
    teamId: 't-mains',
    householdRole: 'PRIMARY_CONTACT',
    nudgeMark: null,
    state: 'RED',
    reasons: ['DECIDE_BY_EXPIRED'],
    nextNudgeAt: null,
    items: [item()],
    ...over,
  };
}

const POOL = [
  { personId: 'p1', name: 'Amelia Turner', role: 'PARTICIPANT', teamId: 't-mains', state: 'RED' },
  {
    personId: 'p2',
    name: 'Charlotte Turner',
    role: 'PARTICIPANT',
    teamId: 't-mains',
    state: 'GREEN',
  },
  {
    personId: 'p3',
    name: 'Dessie Nguyen',
    role: 'PARTICIPANT',
    teamId: 't-desserts',
    state: 'AMBER',
  },
  { personId: 'host', name: 'Kate Whittaker', role: 'HOST', teamId: null, state: 'GREEN' },
];

/** Ruling 18's subject: on the item's own team, and out. */
const RAY_OUT = {
  personId: 'p-out',
  name: 'Ray Dalton',
  role: 'PARTICIPANT',
  teamId: 't-mains',
  state: 'OUT',
};
/** And the person Ruling 18 must NOT catch: the same team, marked, but still coming. */
const AOIFE_GREY = {
  personId: 'p-grey',
  name: 'Aoife OBrien',
  role: 'PARTICIPANT',
  teamId: 't-mains',
  state: 'NOT_CHASED',
};
const POOL_WITH_OUT = [...POOL, RAY_OUT, AOIFE_GREY];

const CTX = { eventName: 'Christmas', eventDate: 'Thursday 25 December' };

async function main() {
  const createdEventIds: string[] = [];
  const createdPersonIds: string[] = [];
  const createdUserIds: string[] = [];

  let A: any = null; // src/lib/glance/actions
  const modules: [string, () => Promise<unknown>, (m: unknown) => void][] = [
    ['src/lib/glance/actions', () => import('../src/lib/glance/actions'), (m) => (A = m)],
  ];
  for (const [name, load, set] of modules) {
    try {
      set(await load());
    } catch (e) {
      console.error(`  (module not loadable: ${name} — ${(e as Error).message})`);
    }
  }

  try {
    // ══ LAYER 1 — the action layer, pure ═════════════════════════════════
    //
    // RULING 14 AT THE ACTION LAYER. Greys are not tappable this phase, so a marked
    // person cannot reach these functions through the screen. The refusal is asserted
    // anyway because Ruling 14 is a rule about the system, not about one screen's
    // buttons: "the fix-it action a red would offer is the exact thing the mark forbids."
    assert(
      'Ruling 14',
      "a don't-chase person is REFUSED the remind — the mark forbids the fix-it action",
      ok(() => typeof A.remindRefusal(person({ nudgeMark: 'DONT_CHASE' })) === 'string')
    );
    assert(
      'Ruling 14',
      'and the refusal SAYS WHY — the host is told the mark, not given a dead button',
      ok(() => /chase/i.test(A.remindRefusal(person({ nudgeMark: 'DONT_CHASE' }))))
    );
    assert(
      'Ruling 14',
      'it keys on the MARK, not on the strip colour — a RED person carrying the mark is still refused',
      ok(() => A.remindRefusal(person({ state: 'RED', nudgeMark: 'DONT_CHASE' })) !== null)
    );
    assert(
      'Ruling 14',
      'GENTLE is a volume control, not an off-switch — it is NOT refused',
      ok(() => A.remindRefusal(person({ nudgeMark: 'GENTLE' })) === null)
    );
    assert(
      'Ruling 14',
      'and an unmarked person is not refused',
      ok(() => A.remindRefusal(person({ nudgeMark: null })) === null)
    );

    // The requests. Each names an EXISTING route — this phase wires doors.
    assert(
      'existing routes',
      'REMIND posts to the existing manual-nudge route, unchanged',
      ok(() => {
        const r = A.remindRequest('ev1', person(), CTX);
        return r.method === 'POST' && r.url === '/api/events/ev1/people/p1/nudge';
      })
    );
    assert(
      'existing routes',
      'and its body is the shape that route already validates — a valid variant plus a message',
      ok(() => {
        const b = A.remindRequest('ev1', person(), CTX).body;
        return (
          ['warm', 'casual', 'gentle', 'direct'].includes(b.template) &&
          typeof b.message === 'string' &&
          b.message.trim().length > 0
        );
      })
    );
    assert(
      'one definition',
      'the message IS the shared host-nudge template — the surface writes no copy of its own',
      ok(() => {
        const b = A.remindRequest('ev1', person(), CTX).body;
        return (
          b.message ===
          getHostNudgeMessage(b.template, {
            guestFirstName: 'Amelia',
            taskItem: 'The pavlova',
            eventName: CTX.eventName,
            eventDate: CTX.eventDate,
          })
        );
      })
    );
    assert(
      'existing routes',
      'REASSIGN posts to the existing item-assign route, with the new holder',
      ok(() => {
        const r = A.reassignRequest('ev1', item(), 'p2');
        return (
          r.method === 'POST' &&
          r.url === '/api/events/ev1/items/i1/assign' &&
          r.body.personId === 'p2'
        );
      })
    );
    assert(
      'Ruling 9',
      'TAKE OVER is a reassign to the host — the SAME request, not a second mechanism',
      ok(() => {
        const t = A.takeOverRequest('ev1', item(), 'host');
        const r = A.reassignRequest('ev1', item(), 'host');
        return JSON.stringify(t) === JSON.stringify(r);
      })
    );

    // The candidate filter, through the SHARED same-team rule.
    assert(
      'same-team',
      'a candidate on the item’s own team is offered',
      ok(() =>
        A.reassignCandidates(POOL, item(), 'HOST', 'host', []).some((p: any) => p.personId === 'p2')
      )
    );
    assert(
      'same-team',
      'a candidate on ANOTHER team is not — GTC-171’s coordinator scoping, unchanged',
      ok(
        () =>
          !A.reassignCandidates(POOL, item(), 'HOST', 'host', []).some(
            (p: any) => p.personId === 'p3'
          )
      )
    );
    assert(
      'same-team',
      'a TASK row admits everyone — the rule has no referent for a team nobody can join',
      ok(() => A.reassignCandidates(POOL, item({ kind: 'TASK' }), 'HOST', 'host', []).length === 4)
    );
    assert(
      'Ruling 9',
      'the host is eligible when SHE is picking — the self-pick exemption, not a widened rule',
      ok(() =>
        A.reassignCandidates(POOL, item(), 'HOST', 'host', []).some(
          (p: any) => p.personId === 'host'
        )
      )
    );
    assert(
      'Ruling 9',
      'and NOT when a coordinator is picking — the exemption is conditioned on the actor',
      ok(
        () =>
          !A.reassignCandidates(POOL, item(), 'COORDINATOR', 'host', []).some(
            (p: any) => p.personId === 'host'
          )
      )
    );
    assert(
      'same-team',
      'the exclusion list is presentation only — it removes names, it never widens the rule',
      ok(() => {
        const all = A.reassignCandidates(POOL, item(), 'HOST', 'host', []);
        const some = A.reassignCandidates(POOL, item(), 'HOST', 'host', ['p2']);
        return some.length === all.length - 1 && !some.some((p: any) => p.personId === 'p2');
      })
    );

    // ── RULING 18 (2026-09-01): an OUT person is not offered ─────────────
    //
    // "Handing an item to someone who declined is a mistake the surface should not offer;
    // Ruling 7's absence-recedes argues the same way."
    //
    // ⚠ A SURFACE FILTER ON THIS PICKER, NOT A ROUTE CHANGE — the ruling says so in those
    // words, and the boundary is asserted in both directions: the picker refuses him here,
    // and the HTTP layer below proves the ROUTE still accepts him, because a host
    // reassigning to an out person deliberately (they are dropping it off anyway) stays
    // possible through the plan's own assignment UI.
    assert(
      'Ruling 18',
      'an OUT person on the item’s own team is NOT offered — the surface does not propose a mistake',
      ok(
        () =>
          !A.reassignCandidates(POOL_WITH_OUT, item(), 'HOST', 'host', []).some(
            (p: any) => p.personId === 'p-out'
          )
      )
    );
    assert(
      'Ruling 18',
      'and the filter is on OUT alone — a don’t-chase person on the team is STILL offered',
      ok(() =>
        A.reassignCandidates(POOL_WITH_OUT, item(), 'HOST', 'host', []).some(
          (p: any) => p.personId === 'p-grey'
        )
      )
    );
    assert(
      'Ruling 18',
      'the mark suppresses CHASING, never HOLDING — that distinction is the reason for the line above',
      ok(() => {
        const offered = A.reassignCandidates(POOL_WITH_OUT, item(), 'HOST', 'host', []).map(
          (p: any) => p.personId
        );
        return offered.includes('p-grey') && !offered.includes('p-out');
      })
    );
    assert(
      'Ruling 18',
      'and OUT is filtered on a TASK row too — the same-team exception does not reopen the door',
      ok(
        () =>
          !A.reassignCandidates(POOL_WITH_OUT, item({ kind: 'TASK' }), 'HOST', 'host', []).some(
            (p: any) => p.personId === 'p-out'
          )
      )
    );

    // ══ LAYER 2 — the spy: refusals happen BEFORE the network ════════════
    //
    // DIFFERENTIAL, NOT ABSOLUTE. "No request was issued" is trivially true of a module
    // that does not exist, so the marked person is asserted AGAINST the unmarked one: the
    // same function, the same spy shape, one call and zero calls.
    const refused = spyFetch({ status: 200, body: { success: true } });
    const refusedOutcome = A
      ? await A.remind('ev1', person({ nudgeMark: 'DONT_CHASE' }), CTX, { fetchImpl: refused.impl })
      : null;

    const sent = spyFetch({ status: 200, body: { success: true, contactMethod: 'sms' } });
    const sentOutcome = A ? await A.remind('ev1', person(), CTX, { fetchImpl: sent.impl }) : null;

    assert(
      'Ruling 14',
      'the refusal happens AT THE SURFACE — the marked person issues NO request, the unmarked one does',
      ok(() => refused.calls.length === 0 && sent.calls.length === 1)
    );
    assert(
      'Ruling 14',
      'and the outcome says so — refusedAtSurface, so a caller cannot mistake it for a 4xx',
      ok(() => refusedOutcome.ok === false && refusedOutcome.refusedAtSurface === true)
    );
    assert(
      'existing routes',
      'a chaseable person issues EXACTLY ONE request, to the existing nudge route',
      ok(() => sent.calls.length === 1 && sent.calls[0].url === '/api/events/ev1/people/p1/nudge')
    );
    assert(
      'staleness',
      'and it does NOT claim the board will move — a nudge changes nothing until they reply',
      ok(() => sentOutcome.ok === true && !/reload/i.test(sentOutcome.note))
    );

    const moved = spyFetch({ status: 200, body: { assignment: { id: 'a2' } } });
    const movedOutcome = A
      ? await A.reassign('ev1', item(), 'p2', 'Charlotte Turner', { fetchImpl: moved.impl })
      : null;
    assert(
      'existing routes',
      'REASSIGN issues exactly one request, to the existing assign route',
      ok(() => moved.calls.length === 1 && moved.calls[0].url === '/api/events/ev1/items/i1/assign')
    );
    assert(
      'staleness',
      'and it SAYS the board is now stale — no polling this phase, so it must not pretend',
      ok(() => movedOutcome.ok === true && /reload/i.test(movedOutcome.note))
    );

    const took = spyFetch({ status: 200, body: { assignment: { id: 'a3' } } });
    const tookOutcome = A
      ? await A.takeOver('ev1', item(), 'host', { fetchImpl: took.impl })
      : null;
    assert(
      'existing routes',
      'TAKE OVER issues exactly one request, to the same existing assign route',
      ok(() => took.calls.length === 1 && took.calls[0].url === '/api/events/ev1/items/i1/assign')
    );
    assert(
      'staleness',
      'and it too says the board is stale',
      ok(() => tookOutcome.ok === true && /reload/i.test(tookOutcome.note))
    );

    const refusedByRoute = spyFetch({ status: 403, body: { error: 'nope' } });
    const routeOutcome = A
      ? await A.remind('ev1', person(), CTX, { fetchImpl: refusedByRoute.impl })
      : null;
    assert(
      'guards',
      'a route refusal is surfaced as the ROUTE’s refusal — not swallowed, not relabelled',
      ok(
        () =>
          routeOutcome.ok === false &&
          routeOutcome.refusedAtSurface === false &&
          routeOutcome.status === 403 &&
          routeOutcome.error === 'nope'
      )
    );

    assert(
      'no new surface',
      'no action ever posts to a glance path — the surface owns no endpoint of its own',
      ok(() => {
        const calls = [...refused.calls, ...sent.calls, ...moved.calls, ...took.calls];
        return calls.length === 3 && calls.every((c) => !/glance/.test(c.url));
      })
    );

    // ══ LAYER 3 — the real routes, over HTTP ═════════════════════════════
    //
    // `requireEventRole` reads a session cookie, so these cannot be driven in process.
    //
    // The probe is the GLANCE ROUTE ITSELF, unauthenticated: 401 proves the app is serving
    // routes AND that the guard is live. A 500 from a stale `.next` would answer too, which
    // is why "did it answer" is not the question asked.
    let probeStatus = 0;
    try {
      probeStatus = (await fetch(`${BASE}/api/events/none/glance`)).status;
    } catch {
      probeStatus = 0;
    }
    assert(
      'http',
      `the dev server is healthy on ${BASE} — the glance route answers 401, not 500`,
      probeStatus === 401
    );

    const now = new Date();
    const user = await prisma.user.create({ data: { email: `${TAG}-${Date.now()}@example.com` } });
    createdUserIds.push(user.id);
    const token = randomBytes(24).toString('hex');
    await prisma.session.create({
      data: { userId: user.id, token, expiresAt: new Date(now.getTime() + DAY) },
    });
    const COOKIE = { Cookie: `session=${token}`, 'Content-Type': 'application/json' };

    const hostPerson = await prisma.person.create({
      data: {
        name: `${TAG} Kate`,
        email: `${TAG}-kate-${Date.now()}@example.com`,
        userId: user.id,
      },
    });
    createdPersonIds.push(hostPerson.id);

    const event = await prisma.event.create({
      data: {
        name: `${TAG} phase 4`,
        startDate: new Date(now.getTime() + 100 * HOUR),
        endDate: new Date(now.getTime() + 130 * HOUR),
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt: new Date(now.getTime() - 10 * DAY),
      },
    });
    createdEventIds.push(event.id);
    await prisma.eventRole.create({
      data: { userId: user.id, eventId: event.id, role: 'HOST' },
    });

    const mains = await prisma.team.create({ data: { eventId: event.id, name: `${TAG} Mains` } });
    const desserts = await prisma.team.create({
      data: { eventId: event.id, name: `${TAG} Desserts` },
    });

    await prisma.personEvent.create({
      data: {
        personId: hostPerson.id,
        eventId: event.id,
        role: 'HOST',
        householdRole: 'PRIMARY_CONTACT',
        sentAt: new Date(now.getTime() - 10 * DAY),
      },
    });

    async function guest(name: string, teamId: string | null, over: Record<string, unknown> = {}) {
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG}-${name}-${Date.now()}@example.com`,
          phoneNumber: '+64211234567',
        },
      });
      createdPersonIds.push(p.id);
      await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          teamId,
          householdRole: 'GUEST',
          sentAt: new Date(now.getTime() - 10 * DAY),
          ...over,
        },
      });
      return p;
    }

    const amelia = await guest('Amelia', mains.id);
    const charlotte = await guest('Charlotte', mains.id);
    const dessie = await guest('Dessie', desserts.id);
    const kid = await guest('Kid', mains.id, { householdRole: 'CHILD' });

    const pavlova = await prisma.item.create({
      data: { teamId: mains.id, name: `${TAG} pavlova`, kind: 'ITEM', critical: true },
    });
    await prisma.assignment.create({
      data: { itemId: pavlova.id, personId: amelia.id, response: 'PENDING' },
    });

    async function post(path: string, body: unknown, headers: Record<string, string>) {
      const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        /* some responses have no body */
      }
      return { status: res.status, json };
    }

    const ASSIGN = `/api/events/${event.id}/items/${pavlova.id}/assign`;
    const NUDGE = (personId: string) => `/api/events/${event.id}/people/${personId}/nudge`;

    // ── The auth gate ─────────────────────────────────────────────────────
    const anonAssign = await post(ASSIGN, { personId: charlotte.id }, JSON_ONLY());
    assert(
      'auth gate',
      'the assign route refuses an unauthenticated caller — 401, before anything moves',
      anonAssign.status === 401
    );
    const anonNudge = await post(
      NUDGE(amelia.id),
      { template: 'warm', message: 'hi' },
      JSON_ONLY()
    );
    assert(
      'auth gate',
      'and so does the nudge route — 401, before any provider is reached',
      anonNudge.status === 401
    );
    const afterAnon = await prisma.assignment.findFirst({ where: { itemId: pavlova.id } });
    assert(
      'auth gate',
      'and nothing moved: the pavlova is still with the person who held it',
      anonAssign.status === 401 && anonNudge.status === 401 && afterAnon!.personId === amelia.id
    );

    // ── REASSIGN, round-tripped ───────────────────────────────────────────
    const reassigned = await post(ASSIGN, { personId: charlotte.id }, COOKIE);
    assert(
      'round trip',
      'REASSIGN lands through the existing route, with NO reason — a gap never blocks (GTC-196)',
      reassigned.status === 200
    );
    assert(
      'round trip',
      'and the row actually moved in the database',
      (await prisma.assignment.findFirst({ where: { itemId: pavlova.id } }))!.personId ===
        charlotte.id
    );

    // ── The same-team guard, refusing ─────────────────────────────────────
    const wrongTeam = await post(ASSIGN, { personId: dessie.id }, COOKIE);
    assert(
      'guards',
      'a person on another team is REFUSED — GTC-171’s rule, reached through the door',
      wrongTeam.status === 400 && wrongTeam.json?.error === SAME_TEAM_ERROR
    );
    assert(
      'guards',
      'and the refusal changed nothing — the row is still where it was',
      (await prisma.assignment.findFirst({ where: { itemId: pavlova.id } }))!.personId ===
        charlotte.id
    );

    // ── TAKE OVER — Ruling 9's self-pick, already exempted ────────────────
    const takenOver = await post(ASSIGN, { personId: hostPerson.id }, COOKIE);
    assert(
      'Ruling 9',
      'TAKE OVER lands — the host holds the row, through the exemption already in the rule',
      takenOver.status === 200
    );
    assert(
      'Ruling 9',
      'and the database agrees — she holds it, and she is still on no team',
      (await prisma.assignment.findFirst({ where: { itemId: pavlova.id } }))!.personId ===
        hostPerson.id &&
        (await prisma.personEvent.findUnique({
          where: { personId_eventId: { personId: hostPerson.id, eventId: event.id } },
        }))!.teamId === null
    );

    // ── RULING 18's BOUNDARY — the ROUTE stays permissive ────────────────
    //
    // The picker will not offer Ray, and the route will still take him. That split is the
    // ruling's own instruction, and it is worth an assertion precisely because it looks
    // like an inconsistency: a host who genuinely wants to hand a row to someone who
    // declined (they are dropping it off anyway) does it through the plan's assignment
    // UI, and nothing in this phase closes that door. "If that split ever feels wrong in
    // practice, it gets its own ruling."
    const rayOut = await guest('RayOut', mains.id, { attendanceAnswer: 'NO' });
    const outAssign = await post(ASSIGN, { personId: rayOut.id }, COOKIE);
    assert(
      'Ruling 18 boundary',
      'the ROUTE still assigns to an OUT person — the filter is the surface’s, not the rule’s',
      outAssign.status === 200
    );
    assert(
      'Ruling 18 boundary',
      'and the row really moved to him — attendance gates no assignment anywhere in the tree',
      (await prisma.assignment.findFirst({ where: { itemId: pavlova.id } }))!.personId === rayOut.id
    );

    // ── REMIND — the guards fire BEFORE the provider ──────────────────────
    const childNudge = await post(NUDGE(kid.id), { template: 'warm', message: 'hi' }, COOKIE);
    assert(
      'guards',
      'the CHILD rule refuses the remind — §10.6 is absolute, and a host press is no exemption',
      childNudge.status === 403 && /child/i.test(childNudge.json?.error ?? '')
    );
    assert(
      'before the provider',
      'and NOTHING was logged as sent to the child — the guard fired before any send',
      childNudge.status === 403 &&
        (await prisma.inviteEvent.count({
          where: { eventId: event.id, personId: kid.id },
        })) === 0
    );

    const hostNudge = await post(NUDGE(hostPerson.id), { template: 'warm', message: 'hi' }, COOKIE);
    assert(
      'guards',
      'the HOST cannot be reminded, including by herself — GTC-256 Ruling 5',
      hostNudge.status === 403 && hostNudge.json?.error === HOST_NOT_ADDRESSABLE_MESSAGE
    );
    assert(
      'before the provider',
      'and nothing was logged as sent to her either',
      hostNudge.status === 403 &&
        (await prisma.inviteEvent.count({
          where: { eventId: event.id, personId: hostPerson.id },
        })) === 0
    );

    // ── RULING 19 (2026-09-01) — the ROUTE now refuses the mark too ──────
    //
    // Until this ruling the surface's refusal was the ONLY one: the route had never gated
    // a host's own press. It does now, and this asserts it through the same HTTP door the
    // glance uses — so the surface's own `remindRefusal` becomes belt-and-braces (the
    // treatment the child rule already gets) rather than the single point of failure.
    const marked = await guest('Marked', mains.id, { nudgeMark: 'DONT_CHASE' });
    const markedNudge = await post(NUDGE(marked.id), { template: 'warm', message: 'hi' }, COOKIE);
    assert(
      'Ruling 19',
      'the ROUTE refuses a marked person — 403, whichever surface pressed the button',
      markedNudge.status === 403 && /chase/i.test(markedNudge.json?.error ?? '')
    );
    assert(
      'before the provider',
      'and nothing was logged as sent to them — the gate fires before any send',
      markedNudge.status === 403 &&
        (await prisma.inviteEvent.count({
          where: { eventId: event.id, personId: marked.id },
        })) === 0
    );

    // ── REMIND — the honest provider failure ([[GTC-247]]) ────────────────
    const realNudge = await post(
      NUDGE(amelia.id),
      A ? A.remindRequest(event.id, person({ personId: amelia.id }), CTX).body : {},
      COOKIE
    );
    assert(
      'GTC-247',
      'a real remind reaches the provider and FAILS there — 502, not a stubbed success',
      realNudge.status === 502
    );
    assert(
      'GTC-247',
      'and the route never claims it sent — no NUDGE_SENT_HOST is logged for a failed send',
      realNudge.status === 502 &&
        (await prisma.inviteEvent.count({
          where: { eventId: event.id, personId: amelia.id, type: 'NUDGE_SENT_HOST' },
        })) === 0
    );

    // ══ LAYER 4 — the structural fences ══════════════════════════════════
    const actionsSrc = code('src/lib/glance/actions.ts');
    const surfaceSrc = code('src/components/glance/PersonSurface.tsx');
    const boardSrc = code('src/components/glance/GlanceBoard.tsx');
    const nudgeRouteSrc = code('src/app/api/events/[id]/people/[personId]/nudge/route.ts');
    const assignRouteSrc = code('src/app/api/events/[id]/items/[itemId]/assign/route.ts');
    const sourcesExist = [actionsSrc, surfaceSrc, boardSrc].every((s) => s.length > 0);

    assert('phase 4 source', 'the action layer and the surface both exist', sourcesExist);
    assert(
      'one definition',
      'the action layer reads the same-team rule from src/lib/assignment/same-team.ts',
      sourcesExist && /from '@\/lib\/assignment\/same-team'/.test(actionsSrc)
    );
    assert(
      'one definition',
      'and writes no team comparison of its own — no second copy of GTC-171’s rule',
      sourcesExist && !/teamId\s*===|teamId\s*!==/.test(actionsSrc)
    );
    assert(
      'one definition',
      'it reads the mark through isChaseable — the predicate the auto-sweeps already use',
      sourcesExist && /isChaseable/.test(actionsSrc)
    );
    // The QUOTED literal, not the bare word — see the same note in
    // tests/nudge-cadence-controls-test.ts. Ruling 19 gave the refusal a shared message
    // constant whose name contains the mark, and importing it is the opposite of copying it.
    assert(
      'one definition',
      "and never spells 'DONT_CHASE' as a literal — that would be a second definition",
      sourcesExist && !/['\"`]DONT_CHASE['\"`]/.test(actionsSrc)
    );
    assert(
      'one definition',
      'the message comes from the shared template module, not from copy written here',
      sourcesExist &&
        /getHostNudgeMessage/.test(actionsSrc) &&
        !/just checking in|Quick one|gentle reminder|confirming you/i.test(actionsSrc)
    );
    assert(
      'no second send path',
      'the surface reaches no provider and no database — it can only ask the routes',
      sourcesExist &&
        !/sendSms|sendNudgeEmail|@\/lib\/prisma|PrismaClient|twilio|resend/i.test(
          actionsSrc + surfaceSrc
        )
    );
    assert(
      'no new surface',
      'the only endpoints the action layer names are the two existing routes',
      ok(() => {
        const paths = [...actionsSrc.matchAll(/`\/api\/[^`]*`/g)].map((m) => m[0]);
        return (
          paths.length === 2 &&
          paths.some((p) => /people\/\$\{[^}]+\}\/nudge/.test(p)) &&
          paths.some((p) => /items\/\$\{[^}]+\}\/assign/.test(p))
        );
      })
    );
    // The phase 4 guard "the manual-nudge route enforces NO mark of its own — the surface
    // is the only refuser" is RETIRED by Ruling 19 rather than deleted quietly. It
    // recorded a boundary that the founder has now moved: the refusal lives at the route,
    // and what replaces it is the pair of assertions below.
    assert(
      'Ruling 19',
      'the route reaches the mark through resolveManualNudgeRecipient, not a copy of its own',
      nudgeRouteSrc.length > 0 &&
        /resolveManualNudgeRecipient/.test(nudgeRouteSrc) &&
        !/isChaseable|nudgeMark/.test(nudgeRouteSrc)
    );
    assert(
      'the boundary',
      'and the assign route still holds the same-team rule itself, not by the surface’s courtesy',
      assignRouteSrc.length > 0 && /mayHoldRow\(/.test(assignRouteSrc)
    );
    assert(
      'Ruling 18 boundary',
      'no attendance gate was added to the assignment path — Ruling 18 is a picker filter',
      assignRouteSrc.length > 0 &&
        !/attendanceAnswer|deriveAttendance/.test(
          assignRouteSrc + code('src/lib/assignment/same-team.ts')
        )
    );
    assert(
      'Ruling 19',
      'the manual-nudge route now enforces the mark, through the SHARED predicate',
      ok(() => {
        const src = code('src/lib/sms/manual-nudge-recipient.ts');
        return src.length > 0 && /isChaseable/.test(src) && !/['"`]DONT_CHASE['"`]/.test(src);
      })
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } }).catch(() => {});
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.eventRole.deleteMany({ where: { eventId } });
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

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log('\x1b[32mGREEN — a red opens, actions round-trip, the guards refuse.\x1b[0m');
}

function JSON_ONLY(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
