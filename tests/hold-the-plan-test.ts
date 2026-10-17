/**
 * GTC-360 — "Move on →" from Moment 3 holds the plan. The founder's ruling (*"On "Move on" from
 * Moment 3 (Recommended)"*) and the PLAN RULINGS of 2026-10-03 are verbatim in
 * `docs/tickets/GTC-360.md`. What this suite holds:
 *
 *   A  the words, W1 to W7 and the two links, approved with the founder's fixes
 *   B  `holdOutcomeFrom` / `holdThePlan` — what each answer from the transition means for Moment 3
 *   C  where it is wired: the handler, the view (no new fetch), "Keep going" never holds
 *   D  over HTTP, the transition as it already is: the host holds; a co-host is refused (Q3)
 *   E  THE WALK (Cowork's note 5): a DRAFT event, never set to CONFIRMING by hand — Moment 3, "All
 *      sorted →", "Move on →", the pre-flight with real links, the five checks, Send, an accepted press
 *   F  a block: a critical placeholder keeps her in Moment 3 with W4 and its link; the link's target
 *      is where the quantity is set
 *   G  a held but unsent event goes straight on, with no second hold (Q4)
 *   H  a co-host is told W6 (Q3)
 *   I  the old dashboard on Moment-flow events: no "Freeze Plan" card, no stage strip (Q6)
 *   Z  every fixture removed by id; the OutboundMessage and InviteEvent totals as found
 *
 * NOTHING SENDS. The walk presses once on its own fixture; the press writes rows and nothing drains
 * them (no cron runs; the suite never calls a dispatcher), and every row is counted and removed by id.
 * `installProviderTrap` walls this process; headless Chrome resolves nothing but localhost. Needs the
 * dev server on :3000 with the provider keys blanked.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const TAG = 'GTC360';
const ROOT = join(__dirname, '..');
const BASE = 'http://localhost:3000';
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const W: any = load('src/lib/moment3/words')?.M3_WORDS ?? {};
const HOLD: any = load('src/lib/moment3/hold');
const PW: any = load('src/lib/press/press-words');

// ── LAYER A — the words. ──────────────────────────────────────────────────────
function runWords() {
  assert('A', 'A1 W1, while it works: "Holding the plan…"', W.HOLDING === 'Holding the plan…');
  assert(
    'A',
    'A2 W2, if it fails: "That didn\'t hold. Try again."',
    W.HOLD_FAILED === "That didn't hold. Try again."
  );
  assert(
    'A',
    'A3 W3, a serious clash',
    W.HOLD_CLASH ===
      'Before I hold the plan, a serious clash in it needs settling. You can settle it in Plan Status.'
  );
  assert(
    'A',
    'A4 W4, a missing quantity',
    W.HOLD_QUANTITY ===
      'Before I hold the plan, an important item needs a quantity. You can set it in Items & Quantities.'
  );
  assert(
    'A',
    'A5 W5, an empty plan',
    W.HOLD_EMPTY ===
      "There's nothing in the plan to hold yet. Go back to the plan and add what's needed."
  );
  assert(
    'A',
    'A6 W6, a co-host',
    W.HOLD_NOT_HOST === 'Only the host can hold the plan and send it.'
  );
  assert(
    'A',
    "A7 W7, the pre-flight when the plan is not held (the press's NOT_CONFIRMING sentence)",
    PW?.PRESS_REFUSAL_WORDS?.NOT_CONFIRMING ===
      'This plan isn\'t held yet. Go back to "Who\'s on what?" and press "Move on →" first.'
  );
  assert(
    'A',
    'A8 the links\' words, as the screens name them: "Open Plan Status", "Open Items & Quantities"',
    W.OPEN_PLAN_STATUS === 'Open Plan Status' &&
      W.OPEN_ITEMS_AND_QUANTITIES === 'Open Items & Quantities'
  );
  assert(
    'A',
    'A9 and where they go: /plan/[id]?expand=planstatus and /plan/[id]?expand=items',
    ok(
      () =>
        HOLD.planStatusHref('e1') === '/plan/e1?expand=planstatus' &&
        HOLD.itemsAndQuantitiesHref('e1') === '/plan/e1?expand=items'
    )
  );
  const all = [
    W.HOLDING,
    W.HOLD_FAILED,
    W.HOLD_CLASH,
    W.HOLD_QUANTITY,
    W.HOLD_EMPTY,
    W.HOLD_NOT_HOST,
  ];
  assert(
    'A',
    'A10 Gather says "I", never "we"',
    all.every((w) => typeof w === 'string' && !/\b[Ww]e\b/.test(w))
  );
}

// ── LAYER B — what each answer means. ─────────────────────────────────────────
async function runOutcomes() {
  const from = (status: number, body: unknown) =>
    ok(() => !!HOLD?.holdOutcomeFrom) && HOLD.holdOutcomeFrom(status, body);
  const go = (o: any) => o && o.kind === 'GO';
  const blocked = (o: any, b: string) => o && o.kind === 'BLOCKED' && o.block === b;
  assert(
    'B',
    'B1 a held plan (200, success) goes on',
    go(from(200, { success: true, snapshotId: 's' }))
  );
  assert(
    'B',
    'B3 a critical conflict is a CLASH',
    blocked(
      from(400, { success: false, blocks: [{ code: 'CRITICAL_CONFLICT_UNACKNOWLEDGED' }] }),
      'CLASH'
    )
  );
  assert(
    'B',
    'B4 a critical placeholder is a QUANTITY',
    blocked(
      from(400, { success: false, blocks: [{ code: 'CRITICAL_PLACEHOLDER_UNACKNOWLEDGED' }] }),
      'QUANTITY'
    )
  );
  assert(
    'B',
    'B5 no team or no item is EMPTY, and an empty plan says so before anything else',
    blocked(
      from(400, {
        success: false,
        blocks: [
          { code: 'CRITICAL_PLACEHOLDER_UNACKNOWLEDGED' },
          { code: 'STRUCTURAL_MINIMUM_TEAMS' },
          { code: 'STRUCTURAL_MINIMUM_ITEMS' },
        ],
      }),
      'EMPTY'
    )
  );
  assert(
    'B',
    'B6 a refusal (403) is NOT_HOST',
    ok(() => from(403, { error: 'Forbidden' }).kind === 'NOT_HOST')
  );
  assert(
    'B',
    'B7 an event already held ("Cannot transition from CONFIRMING") goes on — never held twice',
    go(from(400, { error: 'Cannot transition from CONFIRMING status' }))
  );
  assert(
    'B',
    'B8 a server failure is FAILED',
    ok(() => from(500, { error: 'x' }).kind === 'FAILED')
  );
  let calls = 0;
  const counting = (async () => {
    calls++;
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  const held = await (HOLD?.holdThePlan?.({
    eventId: 'e1',
    status: 'CONFIRMING',
    fetchImpl: counting,
  }) ?? null);
  assert(
    'B',
    'B2 Q4: a held but unsent event goes on without asking the transition at all',
    !!held && held.kind === 'GO' && calls === 0
  );
  const throwing = (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  const offline = await (HOLD?.holdThePlan?.({
    eventId: 'e1',
    status: 'DRAFT',
    fetchImpl: throwing,
  }) ?? null);
  assert('B', 'B9 a network failure is FAILED', !!offline && offline.kind === 'FAILED');
}

// ── LAYER C — where it is wired. ──────────────────────────────────────────────
function runWiring() {
  const page = codeOnly(read('src/app/plan/[eventId]/setup/page.tsx'));
  const at = page.indexOf('onMoveOn={');
  const handler = at >= 0 ? page.slice(at, at + 400) : '';
  assert(
    'C',
    'C1 "Move on →" goes through the hold, its target still the GTC-357 ternary',
    /moveOn\(\s*event\.sentAt\s*\?\s*boardHref\(eventId\)\s*:\s*`\/plan\/\$\{eventId\}\/pre-flight`/.test(
      handler
    ) && /holdThePlan\(/.test(page)
  );
  const view = read('src/components/plan/Moment3AssignView.tsx');
  const panel = view.slice(view.indexOf('The completion panel'));
  assert(
    'C',
    'C2 the view shows the hold inside the completion panel, and asks no route of its own for it',
    !/\/transition/.test(view) &&
      /data-m3="hold-notice"/.test(panel) &&
      /M3_WORDS\.HOLDING/.test(panel)
  );
  const keep = panel.slice(
    panel.indexOf('{panel.keepGoing}') - 300,
    panel.indexOf('{panel.keepGoing}')
  );
  assert(
    'C',
    'C3 CONTROL: "Keep going" never holds — it only closes the panel',
    /onClick=\{\(\) => setCompletionOpen\(false\)\}/.test(keep) && !/onMoveOn|hold/i.test(keep)
  );
}

// ── LAYERS D to I — the database, HTTP and a browser. ─────────────────────────
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

async function runLive() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `${TAG.toLowerCase()}-${l}-${stamp}@example.test`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  const coUser = await prisma.user.create({ data: { email: mail('cara') } });
  created.users.push(user.id, coUser.id);
  const kate = await prisma.person.create({
    data: { name: `Kate ${TAG}`, email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const coToken = randomBytes(32).toString('hex');
  for (const [u, t] of [
    [user.id, token],
    [coUser.id, coToken],
  ] as const) {
    await prisma.session.create({
      data: { userId: u, token: t, expiresAt: new Date(Date.now() + 3600e3) },
    });
  }
  const start = new Date(Date.now() + 40 * 864e5);
  /** A Moment-flow event whose plan is approved: Moment 3 opens. */
  const mk = async (
    label: string,
    opts: {
      status?: 'DRAFT' | 'CONFIRMING';
      setup?: boolean;
      placeholder?: boolean;
      coHost?: boolean;
    } = {}
  ) => {
    const ev = await prisma.event.create({
      data: {
        name: `${TAG} ${label}`,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: opts.status ?? 'DRAFT',
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    if (opts.coHost)
      await prisma.eventRole.create({
        data: { eventId: ev.id, userId: coUser.id, role: 'COHOST' },
      });
    if (opts.setup !== false) {
      await prisma.eventSetup.create({
        data: { eventId: ev.id, eventType: 'christmas', planApprovedAt: new Date() },
      });
    }
    const hhK = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId: ev.id,
        role: 'HOST',
        householdId: hhK.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    const team = await prisma.team.create({ data: { name: 'Mains', eventId: ev.id } });
    const guests = [];
    for (const n of ['Jo', 'Ross', 'Gus']) {
      const p = await prisma.person.create({
        data: { name: `${n} ${TAG}`, email: mail(`${n.toLowerCase()}${created.people.length}`) },
      });
      created.people.push(p.id);
      guests.push(p);
      const hh = await prisma.household.create({ data: { eventId: ev.id } });
      await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: ev.id,
          role: 'PARTICIPANT',
          householdId: hh.id,
          householdRole: 'PRIMARY_CONTACT',
        },
      });
    }
    for (const [i, n] of ['Glazed ham', 'Pavlova', 'Roast potatoes'].entries()) {
      const it = await prisma.item.create({
        data: {
          name: n,
          teamId: team.id,
          source: 'GENERATED',
          status: 'ASSIGNED',
          critical: i === 0,
          ...(opts.placeholder && i === 0
            ? { quantityState: 'PLACEHOLDER', placeholderAcknowledged: false }
            : {}),
        } as any,
      });
      await prisma.assignment.create({ data: { itemId: it.id, personId: guests[i].id } });
    }
    return ev;
  };
  const snapshots = (id: string) => prisma.planSnapshot.count({ where: { eventId: id } });
  const statusOf = async (id: string) =>
    (await prisma.event.findUnique({ where: { id }, select: { status: true } }))?.status;
  const attempts = async (id: string) => {
    const e = await prisma.event.findUnique({
      where: { id },
      select: { transitionAttempts: true },
    });
    return Array.isArray(e?.transitionAttempts) ? (e!.transitionAttempts as unknown[]).length : 0;
  };

  // ── D — over HTTP, the transition as it already is.
  const dHost = await mk('http host');
  const dCo = await mk('http co-host', { coHost: true });
  const post = (path: string, tok: string) =>
    realFetch(`${BASE}${path}`, { method: 'POST', headers: { cookie: `session=${tok}` } });
  const rHost = await post(`/api/events/${dHost.id}/transition`, token);
  assert(
    'D',
    'D1 CONTROL: the host holds a DRAFT Moment-flow event — CONFIRMING, one snapshot',
    rHost.status === 200 &&
      (await statusOf(dHost.id)) === 'CONFIRMING' &&
      (await snapshots(dHost.id)) === 1,
    String(rHost.status)
  );
  const rCo = await post(`/api/events/${dCo.id}/transition`, coToken);
  assert(
    'D',
    "D2 CONTROL: a co-host is refused 403, and the event stays DRAFT (Q3: the hold stays the host's)",
    rCo.status === 403 && (await statusOf(dCo.id)) === 'DRAFT',
    String(rCo.status)
  );

  const walk = await mk('the walk');
  const blockedEv = await mk('a block', { placeholder: true });
  const heldEv = await mk('held, unsent', { status: 'CONFIRMING' });
  const coEv = await mk('co-host walk', { coHost: true });
  const mfDraft = await mk('dashboard, Moment-flow draft');
  const mfHeld = await mk('dashboard, Moment-flow held', { status: 'CONFIRMING' });
  const v1Held = await mk('dashboard, V1 confirming', { status: 'CONFIRMING', setup: false });

  let chrome: Headless | null = null;
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9373 });
    await chrome.setViewport(1280, 900, false);
    await chrome.setSessionCookie(token);
    const moveOn = async (eventId: string) => {
      await chrome!.navigate(`/plan/${eventId}/setup`, 9000);
      await chrome!.click('[data-m3="all-sorted"]');
      await sleep(600);
      await chrome!.evaluate(
        `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Move on →'); if (b) b.click(); return !!b; })()`
      );
      await sleep(6000);
      return chrome!.evaluate<{ path: string; notice: string; links: string[] }>(
        `(() => { const n = document.querySelector('[data-m3="hold-notice"]');
          return { path: location.pathname, notice: n ? n.innerText : '', links: n ? [...n.querySelectorAll('a')].map((a) => a.getAttribute('href') + ' ' + a.innerText.trim()) : [] }; })()`
      );
    };

    // ── E — the walk.
    const w = await moveOn(walk.id);
    assert(
      'E',
      'E1 after "Move on →", the plan is held: CONFIRMING, one snapshot',
      (await statusOf(walk.id)) === 'CONFIRMING' && (await snapshots(walk.id)) === 1,
      JSON.stringify(w)
    );
    const pre = await chrome.evaluate<{ path: string; standIn: boolean }>(
      `({ path: location.pathname, standIn: document.body.innerText.includes('[link issued at the press]') })`
    );
    assert(
      'E',
      'E2 she is on the pre-flight, and its messages carry real links, not stand-ins',
      pre.path === `/plan/${walk.id}/pre-flight` && pre.standIn === false,
      JSON.stringify(pre)
    );
    await chrome.evaluate(
      `(() => { for (const c of document.querySelectorAll('input[type=checkbox]')) if (!c.checked && !c.disabled) c.click(); return true; })()`
    );
    await sleep(1200);
    await chrome.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Send'); if (b) b.click(); return !!b; })()`
    );
    await sleep(3000);
    const sentLine = await chrome.evaluate<string>(
      `([...document.querySelectorAll('p')].find((p) => p.innerText.startsWith('Sent to'))?.innerText) || ''`
    );
    assert(
      'E',
      'E3 the five checks, Send, and "Sent to 3 people."',
      sentLine === 'Sent to 3 people.',
      sentLine
    );
    const ev = await prisma.event.findUnique({ where: { id: walk.id }, select: { sentAt: true } });
    const rows = await prisma.outboundMessage.count({ where: { eventId: walk.id } });
    const attempted = await prisma.outboundMessage.count({
      where: { eventId: walk.id, attemptedAt: { not: null } },
    });
    assert(
      'E',
      'E4 the press was accepted — sentAt set, its rows written, none attempted (nothing drained, nothing sent)',
      !!ev?.sentAt && rows > 0 && attempted === 0,
      JSON.stringify({ sentAt: ev?.sentAt, rows, attempted })
    );

    // ── F — a block.
    const f = await moveOn(blockedEv.id);
    assert(
      'F',
      'F1 a critical placeholder: Moment 3 says W4, with "Open Items & Quantities" to /plan/[id]?expand=items',
      f.notice.includes(W.HOLD_QUANTITY ?? '\u0000') &&
        f.links.includes(`/plan/${blockedEv.id}?expand=items Open Items & Quantities`),
      JSON.stringify(f)
    );
    assert(
      'F',
      'F2 and she stays in Moment 3; the event stays DRAFT, with no snapshot',
      f.path === `/plan/${blockedEv.id}/setup` &&
        (await statusOf(blockedEv.id)) === 'DRAFT' &&
        (await snapshots(blockedEv.id)) === 0,
      JSON.stringify(f)
    );
    await chrome.navigate(`/plan/${blockedEv.id}?expand=items`, 9000);
    const items = await chrome.evaluate<{ heading: boolean; edit: number }>(
      `({ heading: [...document.querySelectorAll('h2,h3')].some((h) => h.innerText.trim() === 'Items & Quantities'),
         edit: [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Edit').length })`
    );
    assert(
      'F',
      "F3 CONTROL: the link's target is Items & Quantities, with an Edit button for each item (where a quantity is set)",
      items.heading && items.edit >= 3,
      JSON.stringify(items)
    );

    // ── G — held, unsent.
    const before = await attempts(heldEv.id);
    const g = await moveOn(heldEv.id);
    assert(
      'G',
      'G1 CONTROL: a held but unsent event goes straight to the pre-flight, with no second hold',
      g.path === `/plan/${heldEv.id}/pre-flight` &&
        (await snapshots(heldEv.id)) === 0 &&
        (await attempts(heldEv.id)) === before,
      JSON.stringify(g)
    );

    // ── H — a co-host.
    await chrome.clearCookies();
    await chrome.setSessionCookie(coToken);
    const h = await moveOn(coEv.id);
    assert(
      'H',
      'H1 Q3: a co-host is told W6, and the event stays DRAFT',
      h.notice.includes(W.HOLD_NOT_HOST ?? '\u0000') && (await statusOf(coEv.id)) === 'DRAFT',
      JSON.stringify(h)
    );
    await chrome.clearCookies();
    await chrome.setSessionCookie(token);

    // ── I — the old dashboard.
    const dash = async (id: string) => {
      await chrome!.navigate(`/plan/${id}?expand=planstatus`, 9000);
      return chrome!.evaluate<{ strip: boolean; freeze: boolean; loaded: boolean }>(
        `({ strip: document.body.innerText.includes('Current Status'), freeze: document.body.innerText.includes('Freeze Plan'),
           loaded: document.body.innerText.includes(${JSON.stringify(TAG)}) })`
      );
    };
    const a = await dash(mfDraft.id);
    assert(
      'I',
      'I1 Q6: a Moment-flow draft shows no stage strip',
      a.loaded && !a.strip,
      JSON.stringify(a)
    );
    const b = await dash(mfHeld.id);
    assert(
      'I',
      'I2 Q6: a held Moment-flow event shows no "Freeze Plan" card, and no stage strip',
      b.loaded && !b.freeze && !b.strip,
      JSON.stringify(b)
    );
    const c = await dash(v1Held.id);
    assert(
      'I',
      'I3 CONTROL: a V1 event still shows the "Freeze Plan" card',
      c.loaded && c.freeze,
      JSON.stringify(c)
    );
    assert('I', 'I4 CONTROL: and the stage strip', c.loaded && c.strip, JSON.stringify(c));
    assert(
      'I',
      'I5 CONTROL: the browser reached nothing but localhost',
      chrome.hostsRequested().every((x) => /^localhost(:\d+)?$/.test(x)),
      chrome.hostsRequested().join(', ')
    );
  } finally {
    chrome?.close();
  }
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
    runWords();
    await runOutcomes();
    runWiring();
    await runLive();
  } catch (e) {
    assert(
      'run',
      `the suite ran to completion (threw: ${(e as Error).message.split('\n')[0]})`,
      false
    );
  } finally {
    await cleanup();
    const totalsAfter = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
    const left =
      (await prisma.event.count({ where: { id: { in: created.events } } })) +
      (await prisma.person.count({ where: { id: { in: created.people } } })) +
      (await prisma.user.count({ where: { id: { in: created.users } } })) +
      (await prisma.planSnapshot.count({ where: { eventId: { in: created.events } } }));
    assert(
      'Z',
      `Z1 CONTROL: every fixture removed by id (snapshots included), and the totals as found (${totalsBefore} -> ${totalsAfter})`,
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
