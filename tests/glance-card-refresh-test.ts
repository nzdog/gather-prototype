/**
 * GTC-451 — a moved item shows on the new holder's card, without a reload.
 *
 * The founder's rulings (4 Nov 2026): after a successful "Move" or "I’ll do it" the board's usual
 * immediate refresh carries a holdings flag, and on that refresh only the live island hands the
 * cards the items they now hold (GLANCE_HOLDINGS_EVENT for the red cards, GLANCE_ROWS_EVENT for the
 * read-only cards). An open card stays open and shows the new list; if the focused control goes
 * with its row, focus moves to the card's close button. Hard limits, each pinned here: no new
 * request, no stamp, no reload and no router.refresh, the plain poll hands no lists, and a strip
 * that turns red live is still no door. (The event names staying events is test:glance-replay's
 * exact allowlist.)
 *
 * One fixture of its own on the guarded dev server's database (gather_demo), never the sample:
 *   Kate Look (host, no team, holds nothing), and on the "Mains" team
 *   Ana Look (red: Pavlova declined, Bread rolls accepted), Ben Look (Green salad accepted) and
 *   Cleo Look (Ice accepted). Everyone has a made-up address, so no strip is "unreachable".
 * The walk drives a walled headless Chrome (port 9496) at 1280: every request that is not a GET
 * fails in the browser, except POST /api/events/<this event>/items/<Pavlova|Bread rolls>/assign,
 * and every AI route fails even as a GET; proven on probes first (P1). Nothing sends: the assign
 * route sends nothing. Clicks are scrolled to mid-screen and hit-tested.
 *
 * "Nudge them" (C17, the founder's word after RED) is pressed twice on Ana's card, before and
 * after the Move; the wall fails both POSTs in the browser, so the nudge route is never reached and
 * nothing sends. The message is read from each request as the wall stops it.
 * Every row the suite makes is found by id and deleted, the Assignment rows the Move recreates and
 * their AuditEntry rows included; K1 checks every total is back to what it was at the start.
 * The live conditions are the pure functions between the CHECKS markers, dry-run on a passing and
 * a failing input before RED.
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap, trapCount } from './helpers/provider-trap';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const PORT = 9496;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── CHECKS-START: every live condition, pure, dry-run before RED ──────────────
const CHECKS = {
  /** The same ids, in any order, each once. */
  sameSet(found: readonly string[] | null, want: readonly string[]): boolean {
    if (!Array.isArray(found)) return false;
    const a = [...found].sort();
    const b = [...want].sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  },
  /** P1: the wall failed the made-up POST and the AI GET, and let a plain GET through. */
  wallHolds(p: { post: string; ai: string; get: number }): boolean {
    return p.post === 'failed' && p.ai === 'failed' && p.get === 200;
  },
  /** C1: one door (the red), and the others read-only cards. */
  boardDrew(b: { door: string[]; reading: string[] }, door: string, reading: string[]): boolean {
    return CHECKS.sameSet(b.door, [door]) && reading.every((id) => b.reading.includes(id));
  },
  /** C3: the action answered with its own words. */
  outcomeIs(o: { kind: string | null; text: string | null }, want: string): boolean {
    return o.kind === 'ok' && o.text === want;
  },
  /** C3: no new request — every /api/ request since the press is the one assign POST or the
   *  board's own GET, and nothing re-rendered the page from the server. */
  onlyTheseRequests(reqs: readonly string[], assignUrl: string, glanceUrl: string): boolean {
    const api = reqs.filter((r) => /\/api\//.test(r) || /_rsc=|RSC/.test(r));
    return (
      api.filter((r) => r === `POST ${assignUrl}`).length === 1 &&
      api.every((r) => r === `POST ${assignUrl}` || r === `GET ${glanceUrl}`)
    );
  },
  /** C4: the card is still open and says what happened. */
  openWithOutcome(
    s: { open: boolean; kind: string | null; text: string | null },
    want: string
  ): boolean {
    return s.open && CHECKS.outcomeIs(s, want);
  },
  /** C8: the card says it holds nothing and lists no row. */
  holdsNothing(s: { open: boolean; rows: string[]; text: string }): boolean {
    return s.open && s.rows.length === 0 && s.text.includes('Holding nothing yet.');
  },
  /** C9: the same document all along: no navigation and no server re-render. */
  noReload(s: { marker: boolean; navigations: number; rsc: number }): boolean {
    return s.marker && s.navigations === 0 && s.rsc === 0;
  },
  /** C10: no stamp: the mark is what the page load left, and no stamp was even attempted. */
  noStamp(before: string | null, after: string | null, seenPosts: number): boolean {
    return before !== null && before === after && seenPosts === 0;
  },
  /** C13: a strip that turned red live is red and still a read-only card, not a door. */
  redNotDoor(s: { state: string | null; door: boolean; reading: boolean }): boolean {
    return s.state === 'RED' && !s.door && s.reading;
  },
  /** C14: the moved row is gone and focus is on the card's own close button or first control. */
  focusKept(s: { rowGone: boolean; onClose: boolean; onFirst: boolean }): boolean {
    return s.rowGone && (s.onClose || s.onFirst);
  },
  /** C17: the nudge words follow the card's current list — the same message, with only the
   *  item phrase moved off the item that left, and no item named that the card no longer lists. */
  nudgeFollows(
    before: string | null,
    after: string | null,
    gone: string,
    phraseNow: string,
    notOnCard: readonly string[]
  ): boolean {
    return (
      typeof before === 'string' &&
      typeof after === 'string' &&
      before.includes(gone) &&
      after === before.replace(gone, phraseNow) &&
      !notOnCard.some((name) => after.includes(name))
    );
  },
  /** K1: every total as found, and nothing the suite made left behind. */
  totalsBack(before: Record<string, number>, after: Record<string, number>, left: number) {
    const keys = Object.keys(before);
    return (
      left === 0 &&
      keys.length > 0 &&
      keys.length === Object.keys(after).length &&
      keys.every((k) => before[k] === after[k])
    );
  },
};
// ── CHECKS-END ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(id: string, label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    red.push(`${id} ${label}`);
    console.log(`  \x1b[31m✗\x1b[0m ${id} ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}
const safe = <T>(f: () => T, fallback: T): T => {
  try {
    return f();
  } catch {
    return fallback;
  }
};

const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  sessions: [] as string[],
};

async function totals(): Promise<Record<string, number>> {
  return {
    Event: await prisma.event.count(),
    EventSetup: await prisma.eventSetup.count(),
    EventRole: await prisma.eventRole.count(),
    Person: await prisma.person.count(),
    PersonEvent: await prisma.personEvent.count(),
    Household: await prisma.household.count(),
    User: await prisma.user.count(),
    Session: await prisma.session.count(),
    MagicLink: await prisma.magicLink.count(),
    AccessToken: await prisma.accessToken.count(),
    Team: await prisma.team.count(),
    Item: await prisma.item.count(),
    Assignment: await prisma.assignment.count(),
    AuditEntry: await prisma.auditEntry.count(),
    InviteEvent: await prisma.inviteEvent.count(),
    OutboundMessage: await prisma.outboundMessage.count(),
    PlanRevision: await prisma.planRevision.count(),
  };
}

const AI_RE =
  /finalize-plan|regenerate-plan|\/generate(\?|$)|\/regenerate(\?|$)|suggest-resolution/;

/** A headless Chrome with this suite's own wall (see the header). */
async function openWalled(allow: (method: string, url: string) => boolean) {
  const profile = mkdtempSync(join(tmpdir(), 'gtc451-'));
  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost',
      '--no-first-run',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let targets: any[] = [];
  for (let i = 0; i < 75 && targets.length === 0; i++) {
    try {
      targets = await (await realFetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    } catch {
      await sleep(200);
    }
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    chrome.kill();
    throw new Error('headless Chrome did not start');
  }
  const ws = new (globalThis as any).WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map<number, (m: any) => void>();
  const requests: string[] = [];
  const failedReq: string[] = [];
  /** C17 — the message each nudge press carried, read here as the wall fails it. */
  const nudgeMessages: string[] = [];
  let navigations = 0;
  // A reply that never comes fails the call rather than hanging the suite.
  const send = (method: string, params: any = {}) =>
    new Promise<any>((resolve) => {
      const i = ++id;
      const timer = setTimeout(() => {
        pending.delete(i);
        resolve({ error: `no reply to ${method}` });
      }, 20_000);
      pending.set(i, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  ws.addEventListener('message', (e: any) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
    if (m.method === 'Network.requestWillBeSent') {
      const r = m.params.request;
      const rsc = r.headers?.RSC || r.headers?.rsc ? ' RSC' : '';
      requests.push(`${r.method} ${r.url}${rsc}`);
    }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) navigations++;
    if (m.method === 'Fetch.requestPaused') {
      const { method, url } = m.params.request;
      const go = (method === 'GET' && !AI_RE.test(url)) || allow(method, url);
      if (!go) failedReq.push(`${method} ${url}`);
      if (method === 'POST' && /\/nudge$/.test(url)) {
        let message = '';
        try {
          message = String(JSON.parse(m.params.request.postData ?? '{}').message ?? '');
        } catch {
          message = '';
        }
        nudgeMessages.push(message);
      }
      ws.send(
        JSON.stringify({
          id: ++id,
          method: go ? 'Fetch.continueRequest' : 'Fetch.failRequest',
          params: go
            ? { requestId: m.params.requestId }
            : { requestId: m.params.requestId, errorReason: 'BlockedByClient' },
        })
      );
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      ws.send(
        JSON.stringify({
          id: ++id,
          method: 'Page.handleJavaScriptDialog',
          params: { accept: m.params.type === 'beforeunload' },
        })
      );
    }
  });
  await send('Page.enable');
  await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const ev = async <T = any>(expression: string): Promise<T> =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
      ?.result?.value as T;
  const refusals: string[] = [];
  return {
    ev,
    requests,
    failedReq,
    nudgeMessages,
    refusals,
    navigations: () => navigations,
    async viewport(width: number, height: number) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
    },
    async cookie(token: string) {
      await send('Network.setCookie', {
        name: 'session',
        value: token,
        domain: 'localhost',
        path: '/',
      });
    },
    async navigate(path: string, settle = 4000) {
      await send('Page.navigate', { url: `${BASE}${path}` });
      await sleep(settle);
    },
    /** Scrolled to mid-screen and hit-tested; a press, send, hold or generate is refused by its
     *  words (a strip is a door to a card, so its own words are not read). */
    async tap(selector: string, settle = 500) {
      const at =
        await ev<any>(`(() => { const t = document.querySelector(${JSON.stringify(selector)}); if (!t) return { why: 'no target' };
        const strip = t.hasAttribute('data-strip-door') || t.hasAttribute('data-strip-reading');
        if (!strip && /\\b(generate|regenerate|new event|hold|send|press|move on)\\b/i.test(t.innerText || '')) return { why: 'refused by its words' };
        t.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = t.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return hit && t.contains(hit) ? { x, y } : { why: 'the point is not inside the target' }; })()`);
      if (!at || at.why) {
        refusals.push(`${selector}: ${at?.why}`);
        return at?.why ?? 'no answer';
      }
      for (const type of ['mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', {
          type,
          x: at.x,
          y: at.y,
          button: 'left',
          clickCount: 1,
        });
      await sleep(settle);
      return null;
    },
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
      chrome.kill();
      setTimeout(() => {
        try {
          rmSync(profile, { recursive: true, force: true });
        } catch {
          // the profile is in the OS temp directory
        }
      }, 1500);
    },
  };
}

/** Wait until `expression` is truthy in the page, up to `ms`. */
async function until(c: { ev: (e: string) => Promise<any> }, expression: string, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await c.ev(`(() => { try { return !!(${expression}); } catch { return false; } })()`))
      return true;
    await sleep(250);
  }
  return false;
}

async function buildFixture() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc451-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Look', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 4 * 3600e3) },
  });
  created.sessions.push(session.id);
  const HOUR = 3600e3;
  const e = await prisma.event.create({
    data: {
      name: `GTC-451 card refresh ${stamp}`,
      startDate: new Date(Date.now() + 240 * HOUR),
      endDate: new Date(Date.now() + 240 * HOUR),
      hostId: kate.id,
      status: 'CONFIRMING',
    },
  });
  created.events.push(e.id);
  await prisma.eventRole.create({ data: { eventId: e.id, userId: user.id, role: 'HOST' } });
  await prisma.eventSetup.create({
    data: { eventId: e.id, eventType: 'BBQ', planApprovedAt: new Date(Date.now() - HOUR) } as any,
  });
  const own = await prisma.household.create({ data: { eventId: e.id } });
  const kpe = await prisma.personEvent.create({
    data: {
      personId: kate.id,
      eventId: e.id,
      role: 'HOST',
      householdId: own.id,
      householdRole: 'PRIMARY_CONTACT',
    },
  });
  await prisma.household.update({ where: { id: own.id }, data: { contactPersonEventId: kpe.id } });
  const team = await prisma.team.create({ data: { eventId: e.id, name: 'Mains' } });
  const items: Record<string, string> = {};
  const add = async (name: string, dishes: [string, string, 'ACCEPTED' | 'DECLINED'][]) => {
    const p = await prisma.person.create({
      data: { name, email: mail(name.split(' ')[0].toLowerCase()) },
    });
    created.people.push(p.id);
    const hh = await prisma.household.create({ data: { eventId: e.id } });
    const pe = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId: e.id,
        role: 'PARTICIPANT',
        teamId: team.id,
        householdId: hh.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    await prisma.household.update({ where: { id: hh.id }, data: { contactPersonEventId: pe.id } });
    for (const [key, dish, response] of dishes) {
      const it = await prisma.item.create({ data: { teamId: team.id, name: dish, kind: 'ITEM' } });
      items[key] = it.id;
      await prisma.assignment.create({ data: { itemId: it.id, personId: p.id, response } });
    }
    return { personId: p.id, pe: pe.id };
  };
  const ana = await add('Ana Look', [
    ['X', 'Pavlova', 'DECLINED'],
    ['Y', 'Bread rolls', 'ACCEPTED'],
  ]);
  const ben = await add('Ben Look', [['Z', 'Green salad', 'ACCEPTED']]);
  const cleo = await add('Cleo Look', [['W', 'Ice', 'ACCEPTED']]);
  return {
    eventId: e.id,
    userId: user.id,
    token,
    kate: { personId: kate.id, pe: kpe.id },
    ana,
    ben,
    cleo,
    items,
  };
}

type Fixture = Awaited<ReturnType<typeof buildFixture>>;

/** A card's rows, by the attribute each kind of card marks them with. */
const rowsOf = (dialog: string, attr: string) =>
  `(() => { const d = document.querySelector(${JSON.stringify(dialog)}); return d ? [...d.querySelectorAll('[${attr}]')].map((r) => r.getAttribute('${attr}')) : null; })()`;
const readingDialog = (name: string) => `[data-reading-panel=${JSON.stringify(name)}]`;
const actingDialog = (personId: string) => `[data-person-surface="${personId}"]`;

async function walk(f: Fixture) {
  const up = await realFetch(`${BASE}/api/events/${f.eventId}/glance`)
    .then(() => true)
    .catch(() => false);
  if (!up) console.error('    the dev server does not answer on :3000 — every C check fails');
  const assignUrl = (key: string) => `${BASE}/api/events/${f.eventId}/items/${f.items[key]}/assign`;
  const glanceUrl = `${BASE}/api/events/${f.eventId}/glance`;
  const c = await openWalled(
    (method, url) => method === 'POST' && (url === assignUrl('X') || url === assignUrl('Y'))
  );
  try {
    await c.viewport(1280, 900);
    await c.cookie(f.token);
    await c.navigate(`/plan/${f.eventId}/glance`, 3000);
    await until(
      c,
      `document.querySelector('[data-person-event-id="${f.ana.pe}"]') && Object.keys(document.querySelector('[data-person-event-id="${f.ana.pe}"]')).some((k) => k.startsWith('__reactFiber'))`,
      60_000
    );
    const navsAtLoad = c.navigations();
    await c.ev(`window.__gtc451 = 'same document'`);
    const seenAtLoad =
      (
        await prisma.eventRole.findFirst({
          where: { eventId: f.eventId, userId: f.userId },
          select: { glanceSeenAt: true },
        })
      )?.glanceSeenAt?.toISOString() ?? null;

    // P1 — the wall, proven on probes.
    const probe = await c.ev<any>(`(async () => {
      const post = await fetch('/api/gtc451-probe', { method: 'POST' }).then(() => 'through', () => 'failed');
      const ai = await fetch('/api/events/${f.eventId}/generate').then(() => 'through', () => 'failed');
      const get = await fetch('/api/events/${f.eventId}/glance').then((r) => r.status, () => 0);
      return { post, ai, get };
    })()`);
    assert(
      'P1',
      'the wall: a made-up POST and an AI GET fail in the browser; the board’s own GET goes through',
      safe(() => CHECKS.wallHolds(probe), false),
      JSON.stringify(probe)
    );

    // C1 — the board drew: Ana's red is the one door; Ben, Cleo and Kate open read-only cards.
    const board = await c.ev<any>(`({
      door: [...document.querySelectorAll('[data-strip-door]')].map((e) => e.getAttribute('data-person-event-id')),
      reading: [...document.querySelectorAll('[data-strip-reading]')].map((e) => e.getAttribute('data-person-event-id')),
    })`);
    assert(
      'C1',
      'the board drew: Ana’s red strip is the one door; Ben, Cleo and Kate open read-only cards',
      safe(() => CHECKS.boardDrew(board, f.ana.pe, [f.ben.pe, f.cleo.pe, f.kate.pe]), false),
      JSON.stringify(board)
    );

    // C2 — before: Ben's card lists the salad; Ana's lists the pavlova and the rolls.
    await c.tap(`[data-person-event-id="${f.ben.pe}"]`);
    await until(c, `document.querySelector(${JSON.stringify(readingDialog('Ben Look'))})`);
    const benBefore = await c.ev<string[] | null>(
      rowsOf(readingDialog('Ben Look'), 'data-reading-row')
    );
    await c.tap(`${readingDialog('Ben Look')} button[aria-label="Close"]`);
    await c.tap(`[data-person-event-id="${f.ana.pe}"]`);
    await until(c, `document.querySelector('${actingDialog(f.ana.personId)}')`);
    const anaBefore = await c.ev<string[] | null>(
      rowsOf(actingDialog(f.ana.personId), 'data-surface-row')
    );
    assert(
      'C2',
      'before: Ana’s card lists Pavlova and Bread rolls; Ben’s lists Green salad',
      CHECKS.sameSet(anaBefore, [f.items.X, f.items.Y]) && CHECKS.sameSet(benBefore, [f.items.Z]),
      `ana ${JSON.stringify(anaBefore)} ben ${JSON.stringify(benBefore)}`
    );

    // C17's first half — "Nudge them" before the Move. The wall fails the POST in the browser, so
    // the route never sees it and nothing sends; the message is read from the request itself.
    const nudge = async () => {
      const n = c.nudgeMessages.length;
      await c.ev(`(() => {
        const d = document.querySelector('${actingDialog(f.ana.personId)}');
        const b = d ? [...d.querySelectorAll('button')].find((x) => x.textContent === 'Nudge them') : null;
        if (b) b.setAttribute('data-gtc451-nudge', '');
      })()`);
      await c.tap('[data-gtc451-nudge]');
      await until(
        c,
        `document.querySelector('${actingDialog(f.ana.personId)} [data-action-outcome="failed"]')`
      );
      return c.nudgeMessages.length > n ? c.nudgeMessages[c.nudgeMessages.length - 1] : null;
    };
    const nudgeBefore = await nudge();

    // C3 — Move the pavlova to Ben: it answers, and no new request is made.
    await c.ev(`(() => {
      const s = document.querySelector('[data-move-picker="${f.items.X}"]');
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      set.call(s, '${f.ben.personId}');
      s.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(300);
    const fromMove = c.requests.length;
    await c.tap(`[data-surface-row="${f.items.X}"] div > button:nth-of-type(1)`);
    await until(
      c,
      `document.querySelector('${actingDialog(f.ana.personId)} [data-action-outcome="ok"]')`
    );
    // C5's wait: the moved row leaves the open card (up to 10 s).
    await until(
      c,
      `!document.querySelector('${actingDialog(f.ana.personId)} [data-surface-row="${f.items.X}"]')`
    );
    await sleep(1500);
    const moveReqs = c.requests.slice(fromMove);
    const outcome = await c.ev<any>(`(() => {
      const o = document.querySelector('${actingDialog(f.ana.personId)} [data-action-outcome]');
      return { open: !!document.querySelector('${actingDialog(f.ana.personId)}'), kind: o ? o.getAttribute('data-action-outcome') : null, text: o ? o.textContent : null };
    })()`);
    assert(
      'C3',
      'Move answers “Moved to Ben Look. The board is catching up.”, and the only requests are the one assign POST and the board’s own GET (no new request)',
      safe(
        () => CHECKS.outcomeIs(outcome, 'Moved to Ben Look. The board is catching up.'),
        false
      ) && CHECKS.onlyTheseRequests(moveReqs, assignUrl('X'), glanceUrl),
      `${JSON.stringify(outcome)} | ${moveReqs.filter((r) => /\/api\/|RSC|_rsc/.test(r)).join(', ')}`
    );
    assert(
      'C4',
      'Ana’s card is still open after the Move and still says what happened',
      safe(
        () => CHECKS.openWithOutcome(outcome, 'Moved to Ben Look. The board is catching up.'),
        false
      ),
      JSON.stringify(outcome)
    );
    const anaAfter = await c.ev<string[] | null>(
      rowsOf(actingDialog(f.ana.personId), 'data-surface-row')
    );
    assert(
      'C5',
      'Ana’s open card no longer lists Pavlova and still lists Bread rolls',
      CHECKS.sameSet(anaAfter, [f.items.Y]),
      JSON.stringify(anaAfter)
    );
    const focus = await c.ev<any>(`(() => {
      const d = document.querySelector('${actingDialog(f.ana.personId)}');
      const a = document.activeElement;
      const first = d ? d.querySelector('button, select, input, a[href], [tabindex]:not([tabindex="-1"])') : null;
      return {
        rowGone: !!d && !d.querySelector('[data-surface-row="${f.items.X}"]'),
        onClose: !!d && a === d.querySelector('button[aria-label="Close"]'),
        onFirst: !!d && !!first && a === first,
        active: a ? a.tagName + ' ' + (a.getAttribute('aria-label') || a.textContent || '').slice(0, 30) : 'none',
      };
    })()`);
    assert(
      'C14',
      'the moved row took the pressed control with it, and focus is on the card’s close button or first control, not the page',
      safe(() => CHECKS.focusKept(focus), false),
      JSON.stringify(focus)
    );

    // C17 — "Nudge them" after the Move, from the same open card.
    const nudgeAfter = await nudge();
    assert(
      'C17',
      'after the Move the nudge message names only what the card still lists (Bread rolls is settled, so the generic phrase); before it, it was as it was',
      CHECKS.nudgeFollows(nudgeBefore, nudgeAfter, 'Pavlova', 'your assigned items', [
        'Pavlova',
        'Green salad',
        'Ice',
      ]),
      `before ${JSON.stringify(nudgeBefore)} | after ${JSON.stringify(nudgeAfter)}`
    );

    // C6 — Ben's card, opened with no reload, lists the salad and the pavlova.
    await c.tap(`${actingDialog(f.ana.personId)} button[aria-label="Close"]`);
    await c.tap(`[data-person-event-id="${f.ben.pe}"]`);
    await until(c, `document.querySelector(${JSON.stringify(readingDialog('Ben Look'))})`);
    const benAfter = await c.ev<string[] | null>(
      rowsOf(readingDialog('Ben Look'), 'data-reading-row')
    );
    assert(
      'C6',
      'Ben’s card, opened with no reload, lists Green salad and Pavlova',
      CHECKS.sameSet(benAfter, [f.items.Z, f.items.X]),
      JSON.stringify(benAfter)
    );
    await c.tap(`${readingDialog('Ben Look')} button[aria-label="Close"]`);

    // C7 — "I’ll do it" on the rolls, from Ana's card (her strip may have left red; it stays a door).
    await c.tap(`[data-person-event-id="${f.ana.pe}"]`);
    await until(c, `document.querySelector('${actingDialog(f.ana.personId)}')`);
    await c.tap(`[data-surface-row="${f.items.Y}"] div > button:nth-of-type(2)`);
    await until(
      c,
      `document.querySelector('${actingDialog(f.ana.personId)} [data-action-outcome="ok"]')`
    );
    await until(
      c,
      `document.querySelector('${actingDialog(f.ana.personId)}') && !document.querySelector('${actingDialog(f.ana.personId)} [data-surface-row]')`
    );
    await sleep(1000);
    const took = await c.ev<any>(`(() => {
      const o = document.querySelector('${actingDialog(f.ana.personId)} [data-action-outcome]');
      return { kind: o ? o.getAttribute('data-action-outcome') : null, text: o ? o.textContent : null };
    })()`);
    assert(
      'C7',
      '“I’ll do it” answers “Yours now. The board is catching up.”',
      safe(() => CHECKS.outcomeIs(took, 'Yours now. The board is catching up.'), false),
      JSON.stringify(took)
    );
    const anaEmpty = await c.ev<any>(`(() => {
      const d = document.querySelector('${actingDialog(f.ana.personId)}');
      return { open: !!d, rows: d ? [...d.querySelectorAll('[data-surface-row]')].map((r) => r.getAttribute('data-surface-row')) : [], text: d ? d.textContent : '' };
    })()`);
    await c.tap(`${actingDialog(f.ana.personId)} button[aria-label="Close"]`);
    await c.tap(`[data-person-event-id="${f.kate.pe}"]`);
    await until(c, `document.querySelector(${JSON.stringify(readingDialog('Kate Look'))})`);
    const kateRows = await c.ev<string[] | null>(
      rowsOf(readingDialog('Kate Look'), 'data-reading-row')
    );
    await c.tap(`${readingDialog('Kate Look')} button[aria-label="Close"]`);
    assert(
      'C8',
      'Kate’s card lists Bread rolls, and Ana’s says “Holding nothing yet.” with no row',
      safe(() => CHECKS.holdsNothing(anaEmpty), false) && CHECKS.sameSet(kateRows, [f.items.Y]),
      `ana ${JSON.stringify({ ...anaEmpty, text: undefined })} kate ${JSON.stringify(kateRows)}`
    );

    // C9 / C10 — the same document, and no stamp.
    const page = {
      marker: (await c.ev(`window.__gtc451`)) === 'same document',
      navigations: c.navigations() - navsAtLoad,
      rsc: c.requests.filter((r) => /_rsc=| RSC$/.test(r)).length,
    };
    assert(
      'C9',
      'no reload and no router.refresh: the same document all along, no navigation, no server re-render request',
      CHECKS.noReload(page),
      JSON.stringify(page)
    );
    const seenNow =
      (
        await prisma.eventRole.findFirst({
          where: { eventId: f.eventId, userId: f.userId },
          select: { glanceSeenAt: true },
        })
      )?.glanceSeenAt?.toISOString() ?? null;
    const seenPosts = c.requests.filter((r) => /^POST .*\/glance\/seen/.test(r)).length;
    assert(
      'C10',
      'no stamp: glanceSeenAt is what the page load left, and no stamp was attempted',
      CHECKS.noStamp(seenAtLoad, seenNow, seenPosts),
      `${seenAtLoad} -> ${seenNow}, seen POSTs ${seenPosts}`
    );

    // C11 to C13 — the plain poll keeps its rules. The suite moves the salad from Ben to Cleo, as
    // declined, in the database (as another screen might), then asks for a plain refresh.
    await prisma.assignment.updateMany({
      where: { itemId: f.items.Z },
      data: { personId: f.cleo.personId, response: 'DECLINED' },
    });
    const glanceGets = () => c.requests.filter((r) => r === `GET ${glanceUrl}`).length;
    const getsBefore = glanceGets();
    await c.ev(`window.dispatchEvent(new Event('gather:glance-refresh'))`);
    const turned = await until(
      c,
      `document.querySelector('[data-person-event-id="${f.cleo.pe}"]').getAttribute('data-strip-state') === 'RED'`
    );
    const getsAfter = glanceGets();
    await c.tap(`[data-person-event-id="${f.ben.pe}"]`);
    await until(c, `document.querySelector(${JSON.stringify(readingDialog('Ben Look'))})`);
    const benLater = await c.ev<string[] | null>(
      rowsOf(readingDialog('Ben Look'), 'data-reading-row')
    );
    await c.tap(`${readingDialog('Ben Look')} button[aria-label="Close"]`);
    await c.tap(`[data-person-event-id="${f.cleo.pe}"]`);
    await until(c, `document.querySelector(${JSON.stringify(readingDialog('Cleo Look'))})`);
    const cleoLater = await c.ev<string[] | null>(
      rowsOf(readingDialog('Cleo Look'), 'data-reading-row')
    );
    await c.tap(`${readingDialog('Cleo Look')} button[aria-label="Close"]`);
    assert(
      'C11',
      'the plain poll hands no lists: after the salad moved elsewhere, Ben’s card still lists it and Cleo’s does not',
      Array.isArray(benLater) &&
        benLater.includes(f.items.Z) &&
        CHECKS.sameSet(cleoLater, [f.items.W]),
      `ben ${JSON.stringify(benLater)} cleo ${JSON.stringify(cleoLater)}`
    );
    assert(
      'C12',
      'CONTROL: the plain refresh did poll the board (one more GET) and repainted Cleo red',
      turned && getsAfter > getsBefore,
      `GETs ${getsBefore} -> ${getsAfter}, turned ${turned}`
    );
    const cleoStrip = await c.ev<any>(`(() => {
      const e = document.querySelector('[data-person-event-id="${f.cleo.pe}"]');
      return { state: e ? e.getAttribute('data-strip-state') : null, door: !!e && e.hasAttribute('data-strip-door'), reading: !!e && e.hasAttribute('data-strip-reading') };
    })()`);
    assert(
      'C13',
      'a strip that turned red live is red and still a read-only card, not a door',
      safe(() => CHECKS.redNotDoor(cleoStrip), false),
      JSON.stringify(cleoStrip)
    );
    if (c.refusals.length) console.log(`    taps refused: ${c.refusals.join(' | ')}`);
    if (c.failedReq.length) console.log(`    failed in the browser: ${c.failedReq.join(' | ')}`);
  } finally {
    c.close();
  }
}

async function cleanup(): Promise<{ left: number; detail: string }> {
  const evIds = created.events;
  // Found by id while the fixture still exists: every Assignment on its items (the two the Move
  // and the take-over recreated included) and every AuditEntry the two actions wrote.
  const asg = (
    await prisma.assignment.findMany({
      where: { item: { team: { eventId: { in: evIds } } } },
      select: { id: true },
    })
  ).map((r) => r.id);
  const audit = (
    await prisma.auditEntry.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((r) => r.id);
  const items = (
    await prisma.item.findMany({
      where: { team: { eventId: { in: evIds } } },
      select: { id: true },
    })
  ).map((r) => r.id);
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  await del(() => prisma.assignment.deleteMany({ where: { id: { in: asg } } }));
  await del(() => prisma.auditEntry.deleteMany({ where: { id: { in: audit } } }));
  await del(() => prisma.item.deleteMany({ where: { id: { in: items } } }));
  await del(() => prisma.team.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() =>
    prisma.household.updateMany({
      where: { eventId: { in: evIds } },
      data: { contactPersonEventId: null },
    })
  );
  await del(() => prisma.personEvent.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.household.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.eventSetup.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.eventRole.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: evIds } } }));
  await del(() => prisma.session.deleteMany({ where: { id: { in: created.sessions } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
  const left =
    (await prisma.event.count({ where: { id: { in: evIds } } })) +
    (await prisma.person.count({ where: { id: { in: created.people } } })) +
    (await prisma.user.count({ where: { id: { in: created.users } } })) +
    (await prisma.session.count({ where: { id: { in: created.sessions } } })) +
    (await prisma.assignment.count({ where: { id: { in: asg } } })) +
    (await prisma.auditEntry.count({ where: { id: { in: audit } } }));
  return { left, detail: `assignments ${asg.length}, audit entries ${audit.length}` };
}

async function main() {
  console.log('GTC-451 — a moved item shows on the new holder’s card');
  const start = await totals();
  let fixture: Fixture | null = null;
  try {
    fixture = await buildFixture();
    await walk(fixture);
  } catch (e) {
    console.error(e);
    assert('!', 'the walk ran to completion', false, String((e as Error).message));
  } finally {
    const { left, detail } = await cleanup();
    const end = await totals();
    assert(
      'K1',
      `every total as found, and every row the suite made removed by id (${detail})`,
      CHECKS.totalsBack(start, end, left),
      JSON.stringify(
        Object.keys(start)
          .filter((k) => start[k] !== end[k])
          .map((k) => `${k} ${start[k]}->${end[k]}`)
      ) + ` left ${left}`
    );
  }
  console.log(`\n${passed} passed, ${failed} failed (provider trap ${trapCount()})`);
  if (red.length) {
    console.log('\nRED:');
    for (const x of red) console.log(`  ${x}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
