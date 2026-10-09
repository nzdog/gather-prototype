/**
 * GTC-375 — invites only once a plan exists (with GTC-319, the date, and GTC-374's two fixes).
 *
 * Pins the founder's rulings at scoping (2026-10-09: "Put it away, bring it back"; "On the plan
 * itself"; the date "Like the event details card") and the PLAN RULINGS of 2026-10-09: W1 to W10 as
 * proposed with W3 as ruled; W1 also on Moment 2's opening for an event whose only items were added
 * by hand (Q4); Zone 3 accepted with no token code changed and no AccessToken row written (Q10); and
 * Q1 to Q3, Q5 to Q9 and Q11 to Q19 as recommended.
 *
 *   P  the pure rules: the ruled words, the guest page's footer line, the date rule's GTC-319 cases
 *   S  the source: the three pages' dates, the setup route's interim refusal gone, the fences
 *   R  what the screens render: the strip's underline, the plan's footer, Moment 2's opening
 *   D  the dev server over HTTP, on fixtures of its own: the put-away, the bring-back, the links
 *   C  headless Chrome, behind the three safeguards and the send wall: the walk, the three pages
 *   Z  every fixture row removed by id; the InviteEvent and OutboundMessage totals as found
 *
 * NOTHING SENDS. Send is never pressed and no pre-flight box is ticked. W1 holds the event, so it is
 * pressed only on this suite's own fixture, through `clickGuarded`; so is "Let’s do this →", which
 * brings the plan back. The hold mints that fixture's links (AccessToken rows), counted and removed
 * by id with it. One COORDINATOR token is written by the fixture itself, to watch what a put-away
 * does to it (Q10); the code under test writes none. Opening a guest link writes its InviteEvent and
 * `openedAt` on the fixture, removed with it. Never pressed: Send, "Send it again", "Generate plan →",
 * "↻ Regenerate this category", Moment 3's "Move on →", New Event. The browser fails every
 * plan-making request and every request to a door that sends before it leaves the page (both proven
 * on probe URLs first); every click is `clickGuarded`; a "leave site?" dialog is the only kind
 * answered, and every dialog is logged. `installProviderTrap` walls this process; headless Chrome
 * resolves nothing but localhost. Fixtures: example.com addresses, no phones, nothing queued.
 *
 * A check of something absent always carries a presence clause, so it cannot pass before the build.
 * Modules the build adds are loaded with `load`, so the suite runs (red) at HEAD rather than crashing.
 *
 * Needs the dev server on :3000 with the AI and provider keys blanked, and a global WebSocket
 * (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';
import MomentArc from '../src/components/plan/MomentArc';
import Moment2Opening from '../src/components/plan/Moment2Opening';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';
import { whenLine } from '../src/components/shared/EventDetails';
import { ToastProvider } from '../src/contexts/ToastContext';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  (${detail})` : ''}`);
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

const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

/** Source with comments removed, so a sentence quoted in a comment is never mistaken for code. */
function codeOnly(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

/** A render that never throws: an empty string when the component cannot render. */
function render(el: any): string {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    console.error('    render threw:', (e as Error).message.split('\n')[0]);
    return '';
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function gitDiff(...paths: string[]): string {
  try {
    return execFileSync('git', ['diff', 'HEAD', '--', ...paths], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return 'git diff failed';
  }
}

// ── The ruled words, verbatim (GTC-375, PLAN RULINGS 2026-10-09) ─────────────
const W1 = 'Put the plan away: invites only';
const W2 = 'Your plan is put away. “Let’s do this →” brings it back as you left it.';
const W3 = 'Your plan is put away. Go back to “What’s the plan?” to bring it back.';
const W4 = 'Your plan is back, as you left it.';
const W5_MANY = (n: number) =>
  `Your plan is back. ${n} things were with people no longer on this event, so nobody has them now.`;
const W5_ONE =
  'Your plan is back. 1 thing was with someone no longer on this event, so nobody has it now.';
const W6 = (first: string) => `Questions? Ask ${first}.`;
const W7 = 'Questions? Ask the host.';
/** GTC-374's words, reused unchanged while W1 works, if it fails, and for a co-host. */
const GTC374_W1 = 'Skip the plan: invites only';
const GTC374_W5 = 'Only the host can choose this, and send the invitations.';
const GTC374_W10 = 'Invites only: nobody’s asked to bring anything, just whether they can come.';
/** As they stand at HEAD, for the controls. */
const LETS_DO_THIS = 'Let’s do this →';
const EXIT = 'Invites, people and reminders →';
const COORDINATOR_LINE = 'Questions? Contact your coordinator';

/** The dates of the guest-page fixture: Fri 18 to Sun 20 Dec 2026, NZ, 12:00 to 16:00. */
const G_START = '2026-12-18T01:00:00.000Z';
const G_END = '2026-12-20T01:00:00.000Z';
const G_WHEN = 'Fri 18 Dec to Sun 20 Dec 2026, 12:00 to 16:00';
const G_DATES = 'Fri 18 Dec to Sun 20 Dec 2026';

// ══ IN MEMORY — P, S and R ═══════════════════════════════════════════════════
async function runInMemory() {
  const IO = await load('../src/lib/setup/invites-only');
  const words = IO?.INVITES_ONLY_WORDS ?? {};
  const QL = await load('../src/lib/guest/questions-line');

  // ── P — the ruled words ─────────────────────────────────────────────────────
  assert('P', 'P1 W1, letter for letter', words.PUT_AWAY === W1, String(words.PUT_AWAY));
  assert('P', 'P2 W2, letter for letter', words.PLAN_WAITING === W2, String(words.PLAN_WAITING));
  assert(
    'P',
    'P3 W3 as ruled, letter for letter',
    words.PREFLIGHT_WAITING === W3,
    String(words.PREFLIGHT_WAITING)
  );
  assert('P', 'P4 W4, letter for letter', words.BROUGHT_BACK === W4, String(words.BROUGHT_BACK));
  assert(
    'P',
    'P5 W5, plural and singular',
    ok(() => IO.notBroughtBackLine(2) === W5_MANY(2) && IO.notBroughtBackLine(1) === W5_ONE)
  );
  assert(
    'P',
    'P6 W6: the guest page with nobody named asks the host by first name',
    ok(() => QL.askHostLine('Kate') === W6('Kate'))
  );
  assert(
    'P',
    'P7 W7: with no first name stored, "Questions? Ask the host."',
    ok(() => QL.askHostLine('') === W7 && QL.askHostLine('   ') === W7)
  );
  const guestRaw = read('src/app/p/[token]/page.tsx');
  assert(
    'P',
    'P8 CONTROL: with a coordinator the footer keeps "Questions? Contact your coordinator"',
    codeOnly(guestRaw).includes(COORDINATOR_LINE)
  );
  assert(
    'P',
    'P9 CONTROL (GTC-319): one day reads one date, not a range of a date with itself',
    whenLine('2026-11-08T00:00:00Z', '2026-11-08T03:00:00Z') === 'Sun 8 Nov 2026'
  );
  assert(
    'P',
    'P10 CONTROL (GTC-319): two days in one month read both days, the month with each',
    whenLine('2026-09-13T01:00:00Z', '2026-09-15T01:00:00Z') === 'Sun 13 Sept to Tue 15 Sept 2026'
  );
  assert(
    'P',
    'P11 CONTROL (GTC-319): months that differ read both months',
    whenLine('2026-09-30T01:00:00Z', '2026-10-02T01:00:00Z') === 'Wed 30 Sept to Fri 2 Oct 2026'
  );

  // ── S — the source ──────────────────────────────────────────────────────────
  const guest = codeOnly(guestRaw);
  const host = codeOnly(read('src/app/h/[token]/page.tsx'));
  const dir = codeOnly(read('src/app/gather/[eventId]/directory/page.tsx'));
  const withTimes =
    /whenLine\(\s*data\.event\.startDate,\s*data\.event\.endDate,\s*data\.event\.venueTimingStart,\s*data\.event\.venueTimingEnd\s*\)/;
  assert(
    'S',
    'S1 the guest page writes its date by whenLine, with the times (W8), and has no formatDateRange',
    guest.length > 0 && !/formatDateRange/.test(guest) && withTimes.test(guest)
  );
  assert(
    'S',
    'S2 the host’s link page writes its date by whenLine, with the times (W9)',
    host.length > 0 && !/formatDateRange/.test(host) && withTimes.test(host)
  );
  assert(
    'S',
    'S3 the directory writes its date by whenLine, dates only (W10)',
    dir.length > 0 &&
      !/formatDateRange/.test(dir) &&
      /whenLine\(\s*data\.event\.startDate,\s*data\.event\.endDate\s*\)/.test(dir) &&
      !/venueTiming/.test(dir)
  );
  const fromCard =
    /import\s*\{[^}]*\bwhenLine\b[^}]*\}\s*from\s*'@\/components\/shared\/EventDetails'/;
  assert(
    'S',
    'S4 the three pages agree: each imports whenLine from the details card, none builds its own',
    [guest, host, dir].every((s) => fromCard.test(s) && !/Intl\.DateTimeFormat/.test(s))
  );
  const setupRoute = read('src/app/api/events/[id]/setup/route.ts');
  assert(
    'S',
    'S5 the setup route no longer refuses an event with an item "until GTC-375"',
    setupRoute.length > 0 && !setupRoute.includes('not built yet (GTC-375)')
  );
  assert(
    'S',
    'S6 CONTROL: the token code (Zone 3), auth, middleware, prisma/, Zones 7 and 9 and the transition route are unchanged',
    gitDiff(
      'src/lib/tokens.ts',
      'src/lib/auth.ts',
      'src/lib/auth',
      'src/app/api/auth',
      'middleware.ts',
      'prisma',
      'src/lib/sms/opt-out-service.ts',
      'src/lib/sms/opt-out-keywords.ts',
      'src/lib/eligibility/email-opt-out.ts',
      'src/lib/eligibility/email-block.ts',
      'src/app/api/events/[id]/transition/route.ts'
    ) === ''
  );
  const routesOnDisk: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${f}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (f === 'route.ts') routesOnDisk.push(rel);
    }
  };
  let routesAtHead: string[] = [];
  try {
    walk('src/app/api');
    routesAtHead = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'src/app/api'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => f.endsWith('/route.ts'));
  } catch {
    // an empty list fails the assertion below
  }
  assert(
    'S',
    `S7 CONTROL: no new API route (Zone 6): ${routesOnDisk.length} route files, as at HEAD`,
    routesOnDisk.length > 0 && same([...routesOnDisk].sort(), [...routesAtHead].sort())
  );

  // ── R — what the screens render ─────────────────────────────────────────────
  const arc = render(
    createElement(MomentArc as any, {
      currentMoment: 4,
      completedMoments: [1, 2, 3],
      notNeeded: [2, 3],
      doors: { 1: { href: '/a' }, 2: { href: '/b' }, 3: { href: '/c' } },
    })
  );
  /** Each element whose class names `underline` itself, from its tag to the first `</span>`. */
  const underlined = [...arc.matchAll(/<span class="([^"]*)"[^>]*>/g)]
    .filter((m) => /(^|\s)underline(\s|$)/.test(m[1]))
    .map((m) => arc.slice(m.index!, arc.indexOf('</span>', m.index!)));
  assert(
    'R',
    'R1 the strip: "· not needed" sits in no underlined element (a door that opens underlines its label only)',
    (arc.match(/not needed/g) ?? []).length === 2 &&
      underlined.length > 0 &&
      underlined.every((u) => !u.includes('not needed'))
  );
  assert(
    'R',
    'R2 CONTROL: a door that opens still underlines its label’s words',
    underlined.some((u) => u.includes('What&#x27;s the plan?')) &&
      underlined.some((u) => u.includes('Who&#x27;s coming?'))
  );
  const planProps = {
    eventId: 'e1',
    eventName: 'Boxing Day',
    guestCount: 10,
    categories: [],
    onUpdateItem: async () => {},
    onRemoveItem: async () => {},
    onAddItem: async () => {},
    onAddCategory: async () => {},
    onApprove: () => {},
    onBack: () => {},
    onRegeneratePlan: () => {},
    onRegenerateCategory: () => {},
    regeneratingScope: null,
    onEditGuests: () => {},
    onGoToDashboard: () => {},
  };
  const planWith = render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment2PlanView as any, { ...planProps, onInvitesOnly: () => {} })
    )
  );
  const exitAt = planWith.indexOf(`>${EXIT}</button>`);
  assert(
    'R',
    'R3 the plan’s footer: W1 a button beside "Invites, people and reminders →", after it',
    exitAt > 0 && planWith.indexOf(`>${W1}</button>`) > exitAt
  );
  const planWithout = render(
    createElement(ToastProvider as any, null, createElement(Moment2PlanView as any, planProps))
  );
  assert(
    'R',
    'R4 CONTROL: without the choice the plan’s footer has the exit and no W1',
    planWithout.includes(EXIT) && !planWithout.includes(W1)
  );
  const openingWith = render(
    createElement(Moment2Opening as any, {
      eventName: 'Boxing Day',
      onStart: () => {},
      onBack: () => {},
      onInvitesOnly: () => {},
      planWaiting: true,
    })
  );
  const w2At = openingWith.indexOf(W2);
  assert(
    'R',
    'R5 Moment 2’s opening with a plan put away: W2 under "Let’s do this →", above GTC-374’s W1',
    w2At > openingWith.indexOf(LETS_DO_THIS) &&
      openingWith.indexOf(LETS_DO_THIS) > 0 &&
      w2At < openingWith.indexOf(GTC374_W1)
  );
  const openingWithout = render(
    createElement(Moment2Opening as any, {
      eventName: 'Boxing Day',
      onStart: () => {},
      onBack: () => {},
      onInvitesOnly: () => {},
    })
  );
  assert(
    'R',
    'R6 CONTROL: with no plan put away the opening has no W2',
    openingWithout.includes(LETS_DO_THIS) && !openingWithout.includes(W2)
  );
}

// ══ LIVE — the dev server and headless Chrome, on fixtures of this suite's own ════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
};

/** The flag, read with raw SQL, as batch 7 reads it. */
async function flagOf(eventId: string): Promise<boolean | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ invitesOnly: boolean }[]>(
      'SELECT "invitesOnly" FROM "EventSetup" WHERE "eventId" = $1',
      eventId
    );
    return rows.length === 1 ? rows[0].invitesOnly : null;
  } catch {
    return null;
  }
}

async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  assert('D', 'D0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();
  const WF = await load('../src/lib/workflow');
  const PUT_AWAY_REASON: string | undefined = WF?.PUT_AWAY_REASON;

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc375-${l}-${stamp}@example.com`;
  const mkUser = async (label: string, name: string) => {
    const user = await prisma.user.create({ data: { email: mail(label) } });
    created.users.push(user.id);
    const person = await prisma.person.create({
      data: { name, email: user.email, userId: user.id },
    });
    created.people.push(person.id);
    const token = randomBytes(32).toString('hex');
    await prisma.session.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
    });
    return { userId: user.id, personId: person.id, token };
  };
  const kate = await mkUser('kate', 'Kate Lowe');
  const cara = await mkUser('cara', 'Cara Lowe');
  const g: Record<string, string> = {};
  for (const name of [
    'Jo Lowe',
    'Ross Lowe',
    'Gus Henderson',
    'Aroha Henderson',
    'Pat Ngata',
    'Lee Ngata',
    'Rob Tane',
  ]) {
    const p = await prisma.person.create({
      data: { name, email: mail(name.split(' ')[0].toLowerCase()) },
    });
    created.people.push(p.id);
    g[name.split(' ')[0]] = p.id;
  }
  const start = new Date(Date.now() + 30 * 864e5);

  /** An event of Kate's: her household, Jo and Ross, Gus and Aroha, and (optionally) more. */
  const mk = async (
    label: string,
    o: {
      setup?: boolean;
      approved?: boolean;
      sentAt?: Date;
      held?: boolean;
      cohost?: boolean;
      extra?: string[];
      start?: Date;
      end?: Date;
      times?: boolean;
    } = {}
  ) => {
    const ev = await prisma.event.create({
      data: {
        name: `GTC-375 b8 — ${label}`,
        startDate: o.start ?? start,
        endDate: o.end ?? o.start ?? start,
        hostId: kate.personId,
        status: o.sentAt || o.held ? 'CONFIRMING' : 'DRAFT',
        sentAt: o.sentAt ?? null,
        venueName: 'Kate’s place',
        venueTimingStart: o.times ? '12:00' : null,
        venueTimingEnd: o.times ? '16:00' : null,
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: kate.userId, role: 'HOST' } });
    if (o.cohost)
      await prisma.eventRole.create({
        data: { eventId: ev.id, userId: cara.userId, role: 'COHOST' },
      });
    if (o.setup)
      await prisma.eventSetup.create({
        data: { eventId: ev.id, ...(o.approved ? { planApprovedAt: new Date() } : {}) },
      });
    const sent = o.sentAt ? { sentAt: o.sentAt } : {};
    const hk = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: kate.personId,
        eventId: ev.id,
        role: 'HOST',
        householdId: hk.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    const pe: Record<string, string> = {};
    const households: string[][] = [
      ['Jo', 'Ross'],
      ['Gus', 'Aroha'],
      ...(o.extra ?? []).map((x) => [x]),
    ];
    for (const members of households) {
      const h = await prisma.household.create({ data: { eventId: ev.id } });
      for (let i = 0; i < members.length; i++) {
        const row = await prisma.personEvent.create({
          data: {
            personId: g[members[i]],
            eventId: ev.id,
            householdId: h.id,
            householdRole: i === 0 ? 'PRIMARY_CONTACT' : 'PARTNER',
            ...sent,
          },
        });
        pe[members[i]] = row.id;
      }
    }
    return { id: ev.id, pe };
  };
  /** A team with rows. `rows`: [name, kind, source, holder?, response?] in order. */
  const team = async (
    eventId: string,
    name: string,
    order: number,
    rows: Array<[string, 'ITEM' | 'TASK', string, string?, string?]>,
    extra: { coordinatorId?: string; domain?: string; dayId?: string; dayFor?: string } = {}
  ) => {
    const t = await prisma.team.create({
      data: {
        name,
        eventId,
        source: 'GENERATED',
        displayOrder: order,
        coordinatorId: extra.coordinatorId ?? null,
        ...(extra.domain ? { domain: extra.domain as any } : {}),
      },
    });
    let d = 0;
    for (const [rowName, kind, source, holder, response] of rows) {
      const it = await prisma.item.create({
        data: {
          name: rowName,
          kind,
          source: source as any,
          teamId: t.id,
          displayOrder: ++d,
          quantityState: kind === 'TASK' ? 'NA' : 'SPECIFIED',
          status: holder ? 'ASSIGNED' : 'UNASSIGNED',
          dayId: extra.dayFor === rowName ? (extra.dayId ?? null) : null,
        } as any,
      });
      if (holder)
        await prisma.assignment.create({
          data: { itemId: it.id, personId: holder, response: (response ?? 'PENDING') as any },
        });
    }
    return t.id;
  };

  const http = (path: string, token: string | null, init: RequestInit = {}) =>
    realFetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { cookie: `session=${token}` } : {}),
      },
    });
  const setFlag = (eventId: string, token: string, value: boolean) =>
    http(`/api/events/${eventId}/setup`, token, {
      method: 'POST',
      body: JSON.stringify({ invitesOnly: value }),
    });
  const itemsOf = (eventId: string) => prisma.item.count({ where: { team: { eventId } } });
  const statusOf = async (eventId: string) =>
    (await prisma.event.findUnique({ where: { id: eventId }, select: { status: true } }))?.status;
  const json = async (res: Response) => res.json().catch(() => ({}) as any);

  // ── D — the put-away and the bring-back, over HTTP ──────────────────────────
  const dP = await mk('D, a plan', { setup: true, approved: true, extra: ['Pat', 'Lee', 'Rob'] });
  const day = await prisma.day.create({
    data: { name: 'Christmas Day', date: start, eventId: dP.id },
  });
  const mainsId = await team(
    dP.id,
    'Mains',
    1,
    [
      ['Glazed ham', 'ITEM', 'GENERATED'],
      ['Roast lamb', 'ITEM', 'HOST_EDITED', g.Pat, 'PENDING'],
    ],
    { coordinatorId: g.Rob, domain: 'PROTEINS' }
  );
  const dessertsId = await team(
    dP.id,
    'Desserts',
    2,
    [
      ['Pavlova', 'ITEM', 'GENERATED', g.Jo, 'ACCEPTED'],
      ['Trifle', 'ITEM', 'GENERATED', g.Gus, 'MAYBE'],
    ],
    { coordinatorId: g.Lee, domain: 'DESSERTS', dayId: day.id, dayFor: 'Pavlova' }
  );
  await team(dP.id, 'Set up', 3, [['Put out chairs', 'TASK', 'GENERATED']], { domain: 'SETUP' });
  // The old dashboard's shapes, written directly: two coordinators on their teams, a member.
  await prisma.personEvent.update({
    where: { id: dP.pe.Rob },
    data: { role: 'COORDINATOR', teamId: mainsId },
  });
  await prisma.personEvent.update({
    where: { id: dP.pe.Lee },
    data: { role: 'COORDINATOR', teamId: dessertsId },
  });
  await prisma.personEvent.update({ where: { id: dP.pe.Jo }, data: { teamId: dessertsId } });
  await prisma.personEvent.update({ where: { id: dP.pe.Ross }, data: { justAttending: true } });
  await prisma.conflict.create({
    data: {
      eventId: dP.id,
      fingerprint: `gtc375-${dP.id}`,
      type: 'COVERAGE_GAP',
      severity: 'ADVISORY',
      claimType: 'RISK',
      resolutionClass: 'INFORMATIONAL',
      title: 'GTC-375 fixture clash',
      description: 'Exists so the put-away has a conflict to clear.',
    } as any,
  });
  // Q10: a coordinator's link, written by the fixture (the code under test writes none).
  const robToken = await prisma.accessToken.create({
    data: {
      token: randomBytes(32).toString('hex'),
      scope: 'COORDINATOR',
      eventId: dP.id,
      personId: g.Rob,
      teamId: mainsId,
      expiresAt: new Date(Date.now() + 864e5),
    },
  });
  const tokenIds = async (eventId: string) =>
    (await prisma.accessToken.findMany({ where: { eventId }, select: { id: true } }))
      .map((t) => t.id)
      .sort();
  const tokensBefore = await tokenIds(dP.id);
  const peBefore = await prisma.personEvent.count({ where: { eventId: dP.id } });

  const r1 = await setFlag(dP.id, kate.token, true);
  const b1 = await json(r1);
  assert(
    'D',
    'D1 W1 on an event with a plan: 200, the plan put away, and the flag true',
    r1.status === 200 && (await flagOf(dP.id)) === true && b1?.putAway === true,
    String(r1.status)
  );
  const cleared = [
    await itemsOf(dP.id),
    await prisma.team.count({ where: { eventId: dP.id } }),
    await prisma.day.count({ where: { eventId: dP.id } }),
    await prisma.conflict.count({ where: { eventId: dP.id } }),
  ];
  assert(
    'D',
    'D2 the plan is cleared: no row, no team, no day, no conflict',
    same(cleared, [0, 0, 0, 0]),
    cleared.join(',')
  );
  const revs = await prisma.planRevision.findMany({ where: { eventId: dP.id } });
  const rev: any = revs[0];
  const revTeams: any[] = Array.isArray(rev?.teams) ? rev.teams : [];
  const revItems = revTeams.flatMap((t) => t.items ?? []);
  const members = (name: string) =>
    (revTeams.find((t) => t.name === name)?.members ?? []).map((m: any) => m.personId);
  assert(
    'D',
    'D3 one revision holds it whole: three teams with their members, five rows in order, the answers',
    typeof PUT_AWAY_REASON === 'string' &&
      revs.length === 1 &&
      rev.reason === PUT_AWAY_REASON &&
      same(revTeams.map((t) => t.name).sort(), ['Desserts', 'Mains', 'Set up']) &&
      revItems.length === 5 &&
      revItems.some((i: any) => i.kind === 'TASK') &&
      revItems.every((i: any) => typeof i.displayOrder === 'number') &&
      revItems.find((i: any) => i.name === 'Pavlova')?.assignment?.response === 'ACCEPTED' &&
      members('Mains').includes(g.Rob) &&
      members('Desserts').includes(g.Jo),
    `${revs.length} revisions, ${revItems.length} rows`
  );
  const peAfter = await prisma.personEvent.findMany({
    where: { eventId: dP.id },
    select: { id: true, role: true, teamId: true, justAttending: true },
  });
  const peById = new Map(peAfter.map((p) => [p.id, p]));
  assert(
    'D',
    'D4 people stay: every membership, its role and the "Just attending" mark; their teams emptied',
    peAfter.length === peBefore &&
      peById.get(dP.pe.Ross)?.justAttending === true &&
      peById.get(dP.pe.Rob)?.role === 'COORDINATOR' &&
      peById.get(dP.pe.Lee)?.role === 'COORDINATOR' &&
      peById.get(dP.pe.Rob)?.teamId === null &&
      peById.get(dP.pe.Jo)?.teamId === null
  );
  const setupAfter = await prisma.eventSetup.findUnique({ where: { eventId: dP.id } });
  assert(
    'D',
    'D5 CONTROL: planApprovedAt is kept, so the plan comes back where she left it',
    setupAfter?.planApprovedAt instanceof Date
  );
  const robAfter = await prisma.accessToken.findUnique({ where: { id: robToken.id } });
  assert(
    'D',
    'D6 Zone 3 (Q10): no link written or removed; the coordinator’s link has lost its team',
    same(await tokenIds(dP.id), tokensBefore) && robAfter !== null && robAfter.teamId === null
  );

  // While the plan is away, two people leave the event: Pat (who held the lamb) and Lee
  // (who looked after Desserts). Their memberships are this suite's own fixture rows.
  await prisma.personEvent.deleteMany({ where: { id: { in: [dP.pe.Pat, dP.pe.Lee] } } });

  const r7 = await setFlag(dP.id, kate.token, false);
  const b7 = await json(r7);
  assert(
    'D',
    'D7 "Let’s do this →" brings it back: 200, the flag false',
    r7.status === 200 && (await flagOf(dP.id)) === false && b7?.broughtBack === true,
    String(r7.status)
  );
  const back = await prisma.team.findMany({
    where: { eventId: dP.id },
    orderBy: { displayOrder: 'asc' },
    include: {
      items: {
        orderBy: { displayOrder: 'asc' },
        include: { assignment: true, day: true },
      },
    },
  });
  const shape = back.map((t) => [
    t.name,
    t.items.map((i) => [i.name, i.kind, i.source, i.displayOrder, i.day?.name ?? null]),
  ]);
  const row = (name: string) => back.flatMap((t) => t.items).find((i) => i.name === name);
  assert(
    'D',
    'D8 as she left it: the teams and rows in their order, kinds, sources, the day, and the answers',
    same(shape, [
      [
        'Mains',
        [
          ['Glazed ham', 'ITEM', 'GENERATED', 1, null],
          ['Roast lamb', 'ITEM', 'HOST_EDITED', 2, null],
        ],
      ],
      [
        'Desserts',
        [
          ['Pavlova', 'ITEM', 'GENERATED', 1, 'Christmas Day'],
          ['Trifle', 'ITEM', 'GENERATED', 2, null],
        ],
      ],
      ['Set up', [['Put out chairs', 'TASK', 'GENERATED', 1, null]]],
    ]) &&
      b7?.broughtBack === true &&
      back[0]?.id !== mainsId &&
      back[0]?.coordinatorId === g.Rob &&
      row('Pavlova')?.assignment?.personId === g.Jo &&
      row('Pavlova')?.assignment?.response === 'ACCEPTED' &&
      row('Trifle')?.assignment?.personId === g.Gus &&
      row('Trifle')?.assignment?.response === 'MAYBE',
    JSON.stringify(shape)
  );
  const newMains = back.find((t) => t.name === 'Mains')?.id;
  const newDesserts = back.find((t) => t.name === 'Desserts')?.id;
  const robPe = await prisma.personEvent.findUnique({ where: { id: dP.pe.Rob } });
  const joPe = await prisma.personEvent.findUnique({ where: { id: dP.pe.Jo } });
  assert(
    'D',
    'D9 memberships come back for people still on the event, roles untouched',
    !!newMains &&
      newMains !== mainsId &&
      robPe?.teamId === newMains &&
      robPe?.role === 'COORDINATOR' &&
      !!newDesserts &&
      joPe?.teamId === newDesserts
  );
  const lamb = row('Roast lamb');
  assert(
    'D',
    'D10 Q9: the lamb, held by someone since removed, comes back with nobody holding it (W5’s count)',
    !!lamb && lamb.assignment === null && lamb.status === 'UNASSIGNED' && b7?.notBroughtBack === 1
  );
  assert(
    'D',
    'D11 Q9: Desserts, whose coordinator has left, comes back with no coordinator',
    back.find((t) => t.name === 'Desserts')?.coordinatorId === null
  );
  const before12 = await itemsOf(dP.id);
  const r12 = await setFlag(dP.id, kate.token, false);
  const b12 = await json(r12);
  assert(
    'D',
    'D12 CONTROL: once brought back it is spent: a second false brings nothing back',
    r12.status === 200 &&
      b12?.broughtBack !== true &&
      (await itemsOf(dP.id)) === before12 &&
      (await flagOf(dP.id)) === false
  );

  const dH = await mk('D, held', { setup: true, held: true });
  await team(dH.id, 'Drinks', 1, [['Ice', 'ITEM', 'GENERATED']]);
  const r13 = await setFlag(dH.id, kate.token, true);
  assert(
    'D',
    'D13 a held event with a plan: put away, the flag true, and it stays held',
    r13.status === 200 &&
      (await flagOf(dH.id)) === true &&
      (await statusOf(dH.id)) === 'CONFIRMING' &&
      (await itemsOf(dH.id)) === 0,
    String(r13.status)
  );
  const dS = await mk('D, sent', { setup: true, sentAt: new Date(Date.now() - 864e5) });
  await team(dS.id, 'Drinks', 1, [['Ice', 'ITEM', 'GENERATED']]);
  const r14 = await setFlag(dS.id, kate.token, true);
  assert(
    'D',
    'D14 CONTROL: after the press it is fixed: 409, the plan untouched',
    r14.status === 409 && (await itemsOf(dS.id)) === 1 && (await flagOf(dS.id)) === false,
    String(r14.status)
  );
  const dC = await mk('D, a co-host', { setup: true, cohost: true });
  await team(dC.id, 'Drinks', 1, [['Ice', 'ITEM', 'GENERATED']]);
  const r15 = await setFlag(dC.id, cara.token, true);
  assert(
    'D',
    'D15 CONTROL: a co-host is refused 403, the plan untouched',
    r15.status === 403 && (await itemsOf(dC.id)) === 1 && (await flagOf(dC.id)) === false,
    String(r15.status)
  );
  const dN = await mk('D, no plan', { setup: true });
  const r16 = await setFlag(dN.id, kate.token, true);
  assert(
    'D',
    'D16 CONTROL: no item and no team: the flag alone, no revision written',
    r16.status === 200 &&
      (await flagOf(dN.id)) === true &&
      (await prisma.planRevision.count({ where: { eventId: dN.id } })) === 0,
    String(r16.status)
  );

  const dG = await mk('D, the guest page', {
    setup: true,
    sentAt: new Date(Date.now() - 864e5),
    start: new Date(G_START),
    end: new Date(G_END),
    times: true,
  });
  const drinks = await team(dG.id, 'Drinks', 1, [['Ice', 'ITEM', 'GENERATED']], {
    coordinatorId: g.Rob,
  });
  await prisma.personEvent.update({ where: { id: dG.pe.Gus }, data: { teamId: drinks } });
  const linkFor = async (personId: string, scope: 'PARTICIPANT' | 'HOST') =>
    (
      await prisma.accessToken.create({
        data: {
          token: randomBytes(32).toString('hex'),
          scope,
          eventId: dG.id,
          personId,
          expiresAt: new Date(Date.now() + 864e5),
        },
      })
    ).token;
  const joLink = await linkFor(g.Jo, 'PARTICIPANT');
  const gusLink = await linkFor(g.Gus, 'PARTICIPANT');
  const hostLink = await linkFor(kate.personId, 'HOST');
  const r17 = await http(`/api/p/${joLink}`, null);
  const b17 = await json(r17);
  assert(
    'D',
    'D17 the guest page’s payload carries the times she typed (W8)',
    r17.status === 200 &&
      b17?.event?.venueTimingStart === '12:00' &&
      b17?.event?.venueTimingEnd === '16:00',
    String(r17.status)
  );
  const r18 = await http(`/api/events/${dH.id}/pre-flight`, kate.token);
  const b18 = await json(r18);
  assert(
    'D',
    'D18 the pre-flight knows a plan is put away (for W3)',
    r18.status === 200 && b18?.event?.planPutAway === true,
    String(r18.status)
  );
  const r19 = await http(`/api/events/${dN.id}/pre-flight`, kate.token);
  const b19 = await json(r19);
  assert(
    'D',
    'D19 CONTROL: an invites-only event that never had a plan has none put away',
    r19.status === 200 && b19?.event?.invitesOnly === true && b19?.event?.planPutAway !== true,
    String(r19.status)
  );
  const r20 = await http(`/api/h/${hostLink}`, null);
  const b20 = await json(r20);
  assert(
    'D',
    'D20 the host’s link page’s payload carries the times (W9)',
    r20.status === 200 &&
      b20?.event?.venueTimingStart === '12:00' &&
      b20?.event?.venueTimingEnd === '16:00',
    String(r20.status)
  );

  // ── C — headless Chrome ─────────────────────────────────────────────────────
  const cP = await mk('C, the walk', { setup: true });
  await team(cP.id, 'Mains', 1, [
    ['Glazed ham', 'ITEM', 'GENERATED'],
    ['Roast lamb', 'ITEM', 'GENERATED'],
  ]);
  await team(cP.id, 'Desserts', 2, [['Pavlova', 'ITEM', 'GENERATED', g.Jo, 'ACCEPTED']]);
  const cK = await mk('C, a co-host', { setup: true, cohost: true });
  await team(cK.id, 'Mains', 1, [['Glazed ham', 'ITEM', 'GENERATED']]);

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventSetup.count({ where: evIn }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.household.count({ where: evIn }),
      await prisma.personEvent.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { userId: { in: created.users } } }),
      await prisma.team.count({ where: evIn }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.day.count({ where: evIn }),
      await prisma.conflict.count({ where: evIn }),
      await prisma.planSnapshot.count({ where: evIn }),
      await prisma.planRevision.count({ where: evIn }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  const refusals: string[] = [];
  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9475 });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    // The dialog rule: only a "leave site?" is answered (by leaving); every dialog is logged.
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc375-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc375-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    await c.setSessionCookie(kate.token);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /** Tag what `js` finds, then click it — guarded. 'absent' (not a refusal) when not found. */
    const tap = async (js: string, settleMs = 900) => {
      const found = await ev<boolean>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`
      );
      if (!found) return 'absent';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    const byWords = (words: string, sel = 'button, a') =>
      `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.trim() === ${JSON.stringify(words)})`;
    const stripDoor = (label: string) =>
      `[...document.querySelectorAll('[data-moment-strip] button, [data-moment-strip] a')].find(b => b.innerText.includes(${JSON.stringify(label)}))`;
    const body = () => ev<string>(`document.body.innerText`);
    const path = () => ev<string>(`location.pathname + location.search`);
    /** W1 in the plan's footer: visible, in the exit's row, after it. */
    const footerW1 = `(() => { const exit = ${byWords(EXIT)}; const w1 = ${byWords(W1)};
      return !!exit && !!w1 && w1.checkVisibility() && exit.parentElement === w1.parentElement
        && !!(exit.compareDocumentPosition(w1) & Node.DOCUMENT_POSITION_FOLLOWING); })()`;
    /** Every "· not needed" in the strip, and whether it or anything above it up to its door is underlined. */
    const notNeededUnderline = `JSON.stringify([...document.querySelectorAll('[data-moment-strip] [data-not-needed]')].map(s => {
      const door = s.closest('a, button'); let under = false;
      for (let e = s; e && e !== door; e = e.parentElement) if (getComputedStyle(e).textDecorationLine.includes('underline')) under = true;
      return { under, door: door ? door.tagName : null };
    }))`;

    // C1 — the plan's footer at 1280.
    await c.setViewport(1280, 900, false);
    await c.navigate(`/plan/${cP.id}/setup`, 8000);
    r.C1 = await ev<boolean>(footerW1);

    // C2 — the same at 390: W1 shown, nothing wider than the screen.
    await c.setViewport(390, 844, true);
    await c.navigate(`/plan/${cP.id}/setup`, 8000);
    const w2 = await ev<number>(`document.documentElement.scrollWidth`);
    r.C2 = (await ev<boolean>(footerW1)) && w2 === 390;
    detail.C2 = `scrollWidth ${w2}`;
    await c.setViewport(1280, 900, false);

    // C3 — W1 pressed (the fixture's own event): the plan put away, held, on the pre-flight.
    await c.navigate(`/plan/${cP.id}/setup`, 8000);
    const t3 = await tap(byWords(W1), 5000);
    const p3 = await path();
    r.C3 =
      t3 === null &&
      p3 === `/plan/${cP.id}/pre-flight` &&
      (await statusOf(cP.id)) === 'CONFIRMING' &&
      (await flagOf(cP.id)) === true &&
      (await itemsOf(cP.id)) === 0;
    detail.C3 = `tap ${t3}, at ${p3}`;

    // C4 — the pre-flight says where the plan went (W3), under GTC-374's W10.
    await c.navigate(`/plan/${cP.id}/pre-flight`, 9000);
    const box = await ev<string>(
      `(document.querySelector('[data-invites-only-line]') || {}).innerText || ''`
    );
    r.C4 = box.includes(GTC374_W10) && box.includes(W3);
    detail.C4 = JSON.stringify(box);

    // C5 — the pre-flight's strip: "· not needed" not underlined, its door still a link.
    const u5 = JSON.parse(await ev<string>(notNeededUnderline)) as {
      under: boolean;
      door: string | null;
    }[];
    r.C5 = u5.length === 2 && u5.every((x) => !x.under && x.door === 'A');
    detail.C5 = JSON.stringify(u5);

    // C6 — the strip's "What's the plan?" opens Moment 2's opening: W2, and the setup page's strip
    // without the underline.
    const t6 = await tap(stripDoor("What's the plan?"), 7000);
    const b6 = await body();
    const u6 = JSON.parse(await ev<string>(notNeededUnderline)) as { under: boolean }[];
    r.C6 =
      t6 === null &&
      b6.includes(LETS_DO_THIS) &&
      b6.includes(W2) &&
      u6.length >= 1 &&
      u6.every((x) => !x.under);
    detail.C6 = `tap ${t6}, strip ${JSON.stringify(u6)}`;

    // C7 — "Let’s do this →" brings it back (the fixture's own event): the plan, and W4.
    const t7 = await tap(byWords(LETS_DO_THIS, 'button'), 2500);
    const b7c = await body();
    r.C7 =
      t7 === null &&
      b7c.includes(W4) &&
      b7c.includes('Glazed ham') &&
      b7c.includes('Pavlova') &&
      (await flagOf(cP.id)) === false &&
      (await itemsOf(cP.id)) === 3;
    detail.C7 = `tap ${t7}`;

    // C8 — a co-host presses W1 on her own screen: GTC-374's W5, and nothing put away.
    await c.setSessionCookie(cara.token);
    await c.navigate(`/plan/${cK.id}/setup`, 8000);
    const t8 = await tap(byWords(W1), 3000);
    const b8 = await body();
    r.C8 =
      t8 === null &&
      b8.includes(GTC374_W5) &&
      (await flagOf(cK.id)) === false &&
      (await itemsOf(cK.id)) === 1;
    detail.C8 = `tap ${t8}`;

    // C9 to C12 — the three pages' dates and the guest page's footer, with no session.
    await c.clearCookies();
    await c.navigate(`/p/${joLink}`, 7000);
    const b9 = await body();
    r.C9 =
      b9.includes(G_WHEN) &&
      b9.includes(W6('Kate')) &&
      !b9.includes(COORDINATOR_LINE) &&
      !b9.includes('18 Dec-Dec');
    detail.C9 = JSON.stringify(b9.slice(0, 160));
    await c.navigate(`/p/${gusLink}`, 7000);
    const b10 = await body();
    r.C10 = b10.includes(`${COORDINATOR_LINE} Rob Tane`) && !b10.includes('Questions? Ask');
    await c.navigate(`/h/${hostLink}`, 7000);
    const b11 = await body();
    r.C11 = b11.includes(G_WHEN) && !b11.includes('18 Dec-Dec');
    detail.C11 = JSON.stringify(b11.slice(0, 200));
    await c.navigate(`/gather/${dG.id}/directory`, 7000);
    const b12c = await body();
    r.C12 = b12c.includes(G_DATES) && !b12c.includes('12:00') && !b12c.includes('18 Dec-Dec');
    detail.C12 = JSON.stringify(b12c.slice(0, 200));
  } catch (e) {
    console.error('    chrome threw:', (e as Error).message.split('\n')[0]);
  }
  const blocked = chrome?.planMakingBlocked() ?? [];
  const hosts = chrome?.hostsRequested() ?? [];
  const dialogs = chrome?.dialogs() ?? [];
  chrome?.close();

  assert(
    'C',
    'C0 the safeguards: both probes failed in the browser',
    probes.plan === 'failed' && probes.send === 'failed',
    JSON.stringify(probes)
  );
  const C_LABELS: Record<string, string> = {
    C1: 'C1 the plan’s footer at 1280: W1 beside "Invites, people and reminders →"',
    C2: 'C2 the plan’s footer at 390: W1 shown, and the page no wider than the screen',
    C3: 'C3 W1 pressed (the fixture’s own): the plan put away, held, and the pre-flight opens',
    C4: 'C4 the pre-flight: W3 under GTC-374’s W10',
    C5: 'C5 the pre-flight’s strip: "· not needed" not underlined, its door still a link',
    C6: 'C6 the strip opens Moment 2’s opening with W2; the setup page’s strip not underlined either',
    C7: 'C7 "Let’s do this →" brings the plan back (the fixture’s own), with W4',
    C8: 'C8 a co-host who presses W1 is told GTC-374’s W5, and nothing is put away',
    C9: 'C9 the guest page: the date by the details card’s rule with the times (W8), and W6',
    C11: 'C11 the host’s link page: the date by the same rule, with the times (W9)',
    C12: 'C12 the directory: the dates by the same rule, no times (W10)',
  };
  for (const k of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']) {
    assert('C', C_LABELS[k], r[k] === true, detail[k]);
  }
  assert(
    'C',
    'C10 CONTROL: a guest whose team has a coordinator keeps "Questions? Contact your coordinator Rob Tane"',
    r.C10 === true
  );
  for (const k of ['C11', 'C12']) assert('C', C_LABELS[k], r[k] === true, detail[k]);
  assert(
    'C',
    'C13 the safeguards held: Chrome asked only localhost, only the two probes were blocked, no dialog',
    hosts.length > 0 &&
      hosts.every((h) => h === 'localhost:3000') &&
      blocked.length === 2 &&
      blocked.every((b) => /gtc375-probe/.test(b)) &&
      dialogs.length === 0,
    `hosts ${JSON.stringify(hosts)}, blocked ${JSON.stringify(blocked)}, dialogs ${dialogs.join(',')}, refusals ${JSON.stringify(refusals)}`
  );

  // ── Z — every fixture row removed by id ─────────────────────────────────────
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  await cleanup();
  const left = await rows();
  const after = await totals();
  console.log(`    fixture while it existed: ${whileExists}`);
  assert(
    'Z',
    'Z1 every fixture row removed by id; aiCallsUsed 0; the InviteEvent and OutboundMessage totals as found',
    whileExists.startsWith(`${created.events.length},`) &&
      created.events.length === 8 &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      ai.length === 8 &&
      ai.every((n) => n === 0) &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `left ${left}, ai ${ai}, totals ${JSON.stringify(before)} → ${JSON.stringify(after)}`
  );
}

async function cleanup() {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  const evIds = created.events;
  // Every row below was made by this suite: its events and what hangs off them (the links its own
  // holds minted and the ones its fixture wrote, its revisions, snapshots, days and clash), its
  // people, its two users and their sessions.
  const tokenIds = (
    await prisma.accessToken.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((t) => t.id);
  await del(() => prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: evIds } } }));
  const sessionIds = (
    await prisma.session.findMany({
      where: { userId: { in: created.users } },
      select: { id: true },
    })
  ).map((s) => s.id);
  await del(() => prisma.session.deleteMany({ where: { id: { in: sessionIds } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  await runInMemory();
  await runLive();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const r of redAssertions) console.log(`  ${r}`);
  }
}

main()
  .catch(async (e) => {
    console.error(e);
    failed++;
    await cleanup();
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
