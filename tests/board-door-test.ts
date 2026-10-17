/**
 * GTC-357 — a way into the board. The founder's rulings R1 and R2 and the PLAN RULINGS of
 * 2026-10-03 are verbatim in `docs/tickets/GTC-357.md`. What this suite holds:
 *
 *   A  `eventHomeHref` — where an event opens: a V1 event on the old dashboard; a Moment-flow event
 *      in the setup flow before the press and on the board after it, for the host and a co-host;
 *      a coordinator's door unchanged (Q7)
 *   B  Your Events uses it; "Invites & people" still opens the back room; the list carries `sentAt`
 *   C  over HTTP: `GET /api/events` with `sentAt`; the board's links, "Change who's on what" and
 *      "Invites & people", beside GTC-329's unchanged "Change who I chase" (Q3, Q4)
 *   D  the moment after the press: the lines, "See the board →", then the board after 8 seconds (Q2)
 *   E  Moment 3's "Move on →": the board once sent, the pre-flight before (Q5)
 *   F  the old dashboard: the checklist and the team banner gone from Moment-flow events, kept on V1
 *      ones (R2), read in a real browser
 *   Z  every fixture removed by id; the OutboundMessage and InviteEvent totals as found
 *
 * NOTHING SENDS, AND NOTHING IS PRESSED. The press is read from source (layer D); pressing would
 * write rows. `installProviderTrap` walls this process; headless Chrome carries its own wall
 * (`tests/helpers/headless.ts`). Needs the dev server on :3000, started with the provider keys
 * blanked. Fixtures: example.com addresses, no phone numbers, a session row; removed by id.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const TAG = 'GTC357';
const ROOT = join(__dirname, '..');
const BASE = 'http://localhost:3000';
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  — ${detail}` : ''}`);
    failed++;
    red.push(`[${phase}] ${label}`);
  }
}
function ok(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
async function layer(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    assert(name, `layer ran to completion (threw: ${(e as Error).message.split('\n')[0]})`, false);
  }
}
const read = (rel: string) =>
  existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '';
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
function load<T = any>(rel: string): T | null {
  try {
    return require(join(ROOT, rel));
  } catch {
    return null;
  }
}

const HOME: any = load('src/lib/events/home-href');
const APW: any = load('src/lib/preflight/after-press-words');

// ── LAYER A — eventHomeHref. ──────────────────────────────────────────────────
function runHome() {
  const h = (ev: Record<string, unknown>) =>
    ok(() => !!HOME?.eventHomeHref) && HOME.eventHomeHref(ev);
  const sent = new Date('2026-10-03T00:00:00Z');
  assert(
    'A',
    'A1 a V1 event (no setup) opens on the old dashboard',
    h({ id: 'e1', setup: null, sentAt: null, role: 'HOST' }) === '/plan/e1'
  );
  assert(
    'A',
    'A2 a Moment-flow event before the press opens in the setup flow',
    h({ id: 'e2', setup: { id: 's' }, sentAt: null, role: 'HOST' }) === '/plan/e2/setup'
  );
  assert(
    'A',
    'A3 R1: a sent Moment-flow event opens on the board, for the host',
    h({ id: 'e3', setup: { id: 's' }, sentAt: sent, role: 'HOST' }) === '/plan/e3/glance'
  );
  assert(
    'A',
    'A4 R1: "The same for a co-host"',
    h({ id: 'e4', setup: { id: 's' }, sentAt: sent, role: 'COHOST' }) === '/plan/e4/glance'
  );
  assert(
    'A',
    "A5 Q7: a coordinator's door is unchanged — the board admits only the host and co-hosts",
    h({ id: 'e5', setup: { id: 's' }, sentAt: sent, role: 'COORDINATOR' }) === '/plan/e5/setup'
  );
}

// ── LAYER B — Your Events and the list's data. ────────────────────────────────
function runList() {
  const page = codeOnly(read('src/app/plan/events/page.tsx'));
  assert(
    'B',
    "B1 Your Events' row opens the event through eventHomeHref",
    /router\.push\(\s*eventHomeHref\(/.test(page) && /from '@\/lib\/events\/home-href'/.test(page)
  );
  assert(
    'B',
    'B2 CONTROL: "Invites & people" still opens the back room, /plan/[id] (GTC-235)',
    /event\.setup && !event\.archived/.test(page) &&
      /router\.push\(`\/plan\/\$\{event\.id\}`\);[\s\S]{0,400}Invites &amp; people/.test(page)
  );
  const wire = read('src/lib/events/wire-select.ts');
  const list = wire.slice(wire.indexOf('export const EVENT_LIST_WIRE_SELECT'));
  assert(
    'B',
    'B3 the events list carries sentAt',
    /sentAt:\s*true/.test(list.slice(0, list.indexOf('};')))
  );
}

// ── LAYER D — the moment after the press (source; nothing is pressed). ────────
function runAfterPress() {
  const page = codeOnly(read('src/app/plan/[eventId]/pre-flight/page.tsx'));
  const raw = read('src/app/plan/[eventId]/pre-flight/page.tsx');
  assert('D', 'D1 the words: "See the board →"', APW?.SEE_THE_BOARD_LINK === 'See the board →');
  assert('D', 'D2 Q2: the move waits 8 seconds', APW?.BOARD_MOVE_AFTER_MS === 8000);
  const block = raw.slice(
    raw.indexOf('THRESHOLD_SCRIPT.map('),
    raw.indexOf('THRESHOLD_SCRIPT.map(') + 900
  );
  assert(
    'D',
    'D3 under the threshold lines, the link to the board',
    /href=\{boardHref\(eventId\)\}/.test(block) && /\{SEE_THE_BOARD_LINK\}/.test(block)
  );
  const early = page.indexOf('if (data.event.sentAt)');
  const effect = page.indexOf('window.location.assign(boardHref(eventId))');
  assert(
    'D',
    'D4 once pressed, the page moves to the board by itself after BOARD_MOVE_AFTER_MS, from an effect before the after-the-press return',
    effect > 0 &&
      early > effect &&
      /setTimeout\([\s\S]{0,120}window\.location\.assign\(boardHref\(eventId\)\)[\s\S]{0,40}BOARD_MOVE_AFTER_MS/.test(
        page
      ) &&
      /clearTimeout/.test(page)
  );
  const slice = raw.slice(
    raw.indexOf('THRESHOLD SCRIPT, at the moment of commitment'),
    raw.indexOf('THRESHOLD_SCRIPT.map(')
  );
  assert(
    'D',
    'D5 CONTROL: the threshold lines still appear at commitment and not before (Hinge §2)',
    slice.includes('pressed !== null &&') && !slice.includes('pressed === null')
  );
}

// ── LAYER E — Moment 3's "Move on →". ─────────────────────────────────────────
function runMoveOn() {
  const page = codeOnly(read('src/app/plan/[eventId]/setup/page.tsx'));
  const at = page.indexOf('onMoveOn={');
  const handler = at >= 0 ? page.slice(at, at + 400) : '';
  assert(
    'E',
    'E1 Q5: on a sent event, "Move on →" goes to the board',
    /event\.sentAt\s*\?\s*boardHref\(eventId\)/.test(handler)
  );
  assert(
    'E',
    'E2 CONTROL: before the press it still goes to the pre-flight (GTC-355 Q5)',
    /`\/plan\/\$\{eventId\}\/pre-flight`/.test(handler)
  );
}

// ── LAYERS C and F — the database, HTTP and a browser. ────────────────────────
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

async function runLive() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `${TAG.toLowerCase()}-${l}-${stamp}@example.test`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const coUser = await prisma.user.create({ data: { email: mail('cara') } });
  created.users.push(coUser.id);
  const kate = await prisma.person.create({
    data: { name: `Kate ${TAG}`, email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const coToken = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  await prisma.session.create({
    data: { userId: coUser.id, token: coToken, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const start = new Date(Date.now() + 40 * 864e5);
  const mkEvent = async (label: string, over: Record<string, unknown>, setup: boolean) => {
    const ev = await prisma.event.create({
      data: { name: `${TAG} ${label}`, startDate: start, endDate: start, hostId: kate.id, ...over },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    if (setup) await prisma.eventSetup.create({ data: { eventId: ev.id, eventType: 'christmas' } });
    const team = await prisma.team.create({ data: { name: 'Mains', eventId: ev.id } });
    await prisma.item.create({ data: { name: 'Ham', teamId: team.id } });
    return ev;
  };
  const sentEv = await mkEvent('sent', { status: 'CONFIRMING', sentAt: new Date() }, true);
  const draftMf = await mkEvent('moment-flow draft', { status: 'DRAFT' }, true);
  const draftV1 = await mkEvent('v1 draft', { status: 'DRAFT' }, false);
  await prisma.eventRole.create({
    data: { eventId: sentEv.id, userId: coUser.id, role: 'COHOST' },
  });

  // ── C — over HTTP.
  const get = (path: string, tok: string) =>
    realFetch(`${BASE}${path}`, { headers: { cookie: `session=${tok}` }, redirect: 'manual' });
  const list: any = await (await get('/api/events', token)).json().catch(() => null);
  const row = (list?.events ?? list ?? []).find?.((e: any) => e.id === sentEv.id);
  assert(
    'C',
    'C1 GET /api/events carries sentAt for a sent event',
    !!row && typeof row.sentAt === 'string' && !Number.isNaN(Date.parse(row.sentAt)),
    JSON.stringify(row ? Object.keys(row) : list)?.slice(0, 200)
  );
  const coList: any = await (await get('/api/events', coToken)).json().catch(() => null);
  const coRow = (coList?.events ?? coList ?? []).find?.((e: any) => e.id === sentEv.id);
  assert(
    'C',
    "C2 and to a co-host, with the co-host's role, so her row opens the board too",
    !!coRow &&
      typeof coRow.sentAt === 'string' &&
      ok(
        () =>
          HOME.eventHomeHref({ ...coRow, role: coRow.eventRoles?.[0]?.role }) ===
          `/plan/${sentEv.id}/glance`
      )
  );
  const board = await (await get(`/plan/${sentEv.id}/glance`, token)).text();
  const anchor = (href: string) =>
    new RegExp(`<a[^>]*href="${href.replace(/[/]/g, '\\/')}"[^>]*>([^<]*)</a>`).exec(board)?.[1];
  assert(
    'C',
    'C3 Q3: the board links to Moment 3 as "Change who\'s on what"',
    anchor(`/plan/${sentEv.id}/setup`)?.replace(/&#x27;|&apos;|&#39;/g, "'") ===
      "Change who's on what"
  );
  assert(
    'C',
    'C4 Q3: and to the old dashboard as "Invites & people"',
    anchor(`/plan/${sentEv.id}`)?.replace(/&amp;/g, '&') === 'Invites & people'
  );
  assert(
    'C',
    'C5 CONTROL: GTC-329\'s link, "Change who I nudge" since GTC-378 (W26), is still on the board after the press',
    anchor(`/plan/${sentEv.id}/pre-flight`) === 'Change who I nudge'
  );

  // ── F — the old dashboard, as a browser renders it.
  let chrome: Headless | null = null;
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9371 });
    await chrome.setViewport(1280, 900, false);
    await chrome.setSessionCookie(token);
    const banners = async (eventId: string) => {
      await chrome!.navigate(`/plan/${eventId}`, 9000);
      return chrome!.evaluate<{ checklist: boolean; teamBanner: boolean; loaded: boolean }>(
        `(() => ({ checklist: !!document.querySelector('[aria-label^="Run plan check - "]'),
          teamBanner: document.body.innerText.includes('Your plan is ready!'),
          loaded: document.body.innerText.includes(${JSON.stringify(TAG)}) }))()`
      );
    };
    const mf = await banners(draftMf.id);
    assert(
      'F',
      'F1 R2: a Moment-flow draft shows no setup checklist on the old dashboard',
      !!mf?.loaded && mf.checklist === false,
      JSON.stringify(mf)
    );
    assert(
      'F',
      'F2 R2: and no "Your plan is ready!" team banner',
      !!mf?.loaded && mf.teamBanner === false,
      JSON.stringify(mf)
    );
    const v1 = await banners(draftV1.id);
    assert(
      'F',
      'F3 CONTROL: a V1 draft still shows both — V1 events are unchanged',
      !!v1?.loaded && v1.checklist === true && v1.teamBanner === true,
      JSON.stringify(v1)
    );
    assert(
      'F',
      'F4 CONTROL: the browser reached nothing but localhost',
      chrome.hostsRequested().every((h) => /^localhost(:\d+)?$/.test(h))
    );
  } finally {
    chrome?.close();
  }
  const dash = read('src/app/plan/[eventId]/page.tsx');
  assert(
    'F',
    'F5 CONTROL: the dashboard file still never names the board (glance-grid "V1 untouched")',
    dash.length > 0 && !/glance/i.test(dash)
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
  const ev = { in: created.events };
  await del(() => prisma.session.deleteMany({ where: { userId: { in: created.users } } }));
  await del(() => prisma.outboundMessage.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.inviteEvent.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.event.deleteMany({ where: { id: ev } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  const totalsBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  try {
    runHome();
    runList();
    runAfterPress();
    runMoveOn();
    await layer('C-F', runLive);
  } finally {
    await cleanup();
    const totalsAfter = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
    const left =
      (await prisma.event.count({ where: { id: { in: created.events } } })) +
      (await prisma.person.count({ where: { id: { in: created.people } } })) +
      (await prisma.user.count({ where: { id: { in: created.users } } }));
    assert(
      'Z',
      `Z1 CONTROL: every fixture removed by id, and the totals as found (${totalsBefore} -> ${totalsAfter})`,
      left === 0 && JSON.stringify(totalsBefore) === JSON.stringify(totalsAfter)
    );
    await prisma.$disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (red.length > 0) console.log(`RED:\n${red.map((r) => `  ${r}`).join('\n')}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
