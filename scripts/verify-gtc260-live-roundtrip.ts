/**
 * GTC-260 — live round-trip verification of Event.askAuthorLine.
 *
 * Fires REAL HTTP against the running dev server, through the real route with real session
 * auth, on the REAL seeded event (Henderson Family Christmas 2026 — the CONFIRMING event
 * GTC-187's evidence was measured on, 42 recipients). Proves the whole chain:
 *   PATCH → column → GET → composeAsk → movement 1.
 *
 * FIXTURE DISCIPLINE. Henderson has no EventRole row, so no session can pass
 * requireEventRole on it. This script creates a temporary User + Session + EventRole,
 * uses them, and deletes all three in `finally` along with restoring askAuthorLine to
 * whatever it was on entry. It snapshots before and re-reads after, and the restoration
 * check is an assertion like any other — a dirty fixture fails the run.
 *
 * Run with the dev server up:
 *   BASE_URL=http://localhost:PORT npx tsx scripts/verify-gtc260-live-roundtrip.ts
 */

import { randomBytes } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { composeAsk, draftAuthorLine, firstNameOf } from '../src/lib/messages/ask-register';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const EVENT_NAME = 'Henderson Family Christmas 2026';
const TEMP_EMAIL = `gtc260-verify-${randomBytes(4).toString('hex')}@test.local`;

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}${detail ? ` \x1b[90m— ${detail}\x1b[0m` : ''}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}${detail ? ` \x1b[90m— ${detail}\x1b[0m` : ''}`);
    failed++;
  }
}

async function main() {
  const event = await prisma.event.findFirstOrThrow({
    where: { name: EVENT_NAME },
    select: {
      id: true,
      askAuthorLine: true,
      name: true,
      startDate: true,
      venueName: true,
      occasionDescription: true,
    },
  });

  // ── snapshot ──────────────────────────────────────────────────────────────
  const SNAPSHOT = event.askAuthorLine;
  const rolesBefore = await prisma.eventRole.count({ where: { eventId: event.id } });
  console.log(`\n\x1b[1mEvent:\x1b[0m ${event.name} (${event.id})`);
  console.log(
    `\x1b[1mSnapshot:\x1b[0m askAuthorLine=${JSON.stringify(SNAPSHOT)}, EventRole rows=${rolesBefore}\n`
  );

  let tempUserId: string | null = null;
  let cookie = '';

  try {
    // ── temporary host session ───────────────────────────────────────────────
    const user = await prisma.user.create({
      data: { email: TEMP_EMAIL },
    });
    tempUserId = user.id;
    const token = randomBytes(32).toString('hex');
    await prisma.session.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
    });
    await prisma.eventRole.create({ data: { userId: user.id, eventId: event.id, role: 'HOST' } });
    cookie = `session=${token}`;

    const url = `${BASE_URL}/api/events/${event.id}/pre-flight/message`;
    const get = async () => {
      const res = await fetch(url, { headers: { Cookie: cookie } });
      return { status: res.status, body: await res.json() };
    };
    const patch = async (payload: unknown, withCookie = true) => {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(withCookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };

    const facts = {
      name: event.name,
      startDate: event.startDate,
      venueName: event.venueName,
      occasionDescription: event.occasionDescription,
    };
    const DRAFT = draftAuthorLine(facts);
    const composeFor = (stored: string | null) =>
      composeAsk({
        event: facts,
        hostName: 'Sarah Henderson',
        recipient: {
          firstName: firstNameOf('Rob Henderson'),
          itemNames: ['pavlova'],
          link: 'https://x/p/t',
        },
        storedAuthorLine: stored,
      });

    // ── 1. auth is real ──────────────────────────────────────────────────────
    const anon = await fetch(url, { headers: {} });
    assert('GET without a session is 401', anon.status === 401, `got ${anon.status}`);
    const anonPatch = await patch({ askAuthorLine: 'x' }, false);
    assert('PATCH without a session is 401', anonPatch.status === 401, `got ${anonPatch.status}`);

    // ── 2. starting state ────────────────────────────────────────────────────
    const g0 = await get();
    assert('GET succeeds with a host session', g0.status === 200, `got ${g0.status}`);
    assert(
      'starts with no stored line — the screen falls through to the draft',
      g0.body.storedAuthorLine === null,
      JSON.stringify(g0.body.storedAuthorLine)
    );
    assert(
      'the real event is loaded, with its recipients',
      g0.body.recipients.length > 0,
      `${g0.body.recipients.length} recipients`
    );

    // ── 3. WRITE A LINE, RELOAD, CONFIRM IT COMES BACK ───────────────────────
    const LINE = "Kate here - we're doing Christmas at ours this year and I'd love you there.";
    const p1 = await patch({ askAuthorLine: LINE });
    assert(
      'PATCH stores the line',
      p1.status === 200 && p1.body.storedAuthorLine === LINE,
      JSON.stringify(p1.body)
    );

    const dbAfterWrite = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { askAuthorLine: true },
    });
    assert(
      'the column holds it',
      dbAfterWrite.askAuthorLine === LINE,
      JSON.stringify(dbAfterWrite.askAuthorLine)
    );

    const g1 = await get();
    assert(
      'a fresh GET (the reload) returns the stored line',
      g1.body.storedAuthorLine === LINE,
      JSON.stringify(g1.body.storedAuthorLine)
    );

    const composedStored = composeFor(g1.body.storedAuthorLine);
    assert(
      'movement 1 is HER line, not the draft',
      composedStored.movements[0].text.includes(LINE) &&
        !composedStored.movements[0].text.includes(DRAFT),
      composedStored.movements[0].text.slice(0, 70) + '…'
    );
    assert('all three movements survive', composedStored.movements.length === 3);

    // ── 4. trimming, and overwrite-not-version ───────────────────────────────
    const p2 = await patch({ askAuthorLine: `  ${LINE}  ` });
    assert(
      'surrounding whitespace is trimmed off the stored value',
      p2.body.storedAuthorLine === LINE
    );

    const SECOND = 'Second thoughts - come hungry.';
    const p3 = await patch({ askAuthorLine: SECOND });
    assert(
      'an edit OVERWRITES, one value (GTC-187, 2026-08-29)',
      p3.body.storedAuthorLine === SECOND
    );
    const rows = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { askAuthorLine: true },
    });
    assert('and no prior version survives on the column', rows.askAuthorLine === SECOND);

    // ── 5. THE THREE STATES, SIDE BY SIDE ────────────────────────────────────
    //
    //   null   never authored        → the generated draft
    //   ''     deliberately no line  → the bare greeting, and NOT the draft
    //   value  her words             → her words
    //
    // Founder ruling 2026-08-29. Asserted against the LIVE column and the LIVE route, not
    // against composition alone, because the thing that could regress is the write path
    // collapsing '' to null — and composition would never notice.

    // state 3 is already stored from section 4; capture what it composes to.
    const stateValue = { stored: SECOND, composed: composeFor(SECOND).movements[0].text };

    // state 2 — deliberately no line
    const pEmpty = await patch({ askAuthorLine: '' });
    assert(
      "state 2 — PATCH '' returns '' , NOT null (the rule superseded today did the opposite)",
      pEmpty.body.storedAuthorLine === '',
      JSON.stringify(pEmpty.body.storedAuthorLine)
    );
    const dbEmpty = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { askAuthorLine: true },
    });
    assert(
      "state 2 — the COLUMN holds '' and is not NULL",
      dbEmpty.askAuthorLine === '' && dbEmpty.askAuthorLine !== null,
      JSON.stringify(dbEmpty.askAuthorLine)
    );
    const gEmpty = await get();
    assert("state 2 — a fresh GET returns ''", gEmpty.body.storedAuthorLine === '');
    const stateEmpty = {
      stored: gEmpty.body.storedAuthorLine,
      composed: composeFor(gEmpty.body.storedAuthorLine).movements[0].text,
    };
    assert(
      'state 2 — composes to the BARE GREETING, no authored line',
      stateEmpty.composed === 'Hi Rob,',
      stateEmpty.composed
    );
    assert(
      'state 2 — and does NOT fall through to the draft',
      !stateEmpty.composed.includes(DRAFT)
    );

    // state 1 — never authored
    const pNull = await patch({ askAuthorLine: null });
    assert('state 1 — PATCH null returns null', pNull.body.storedAuthorLine === null);
    const dbNull = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { askAuthorLine: true },
    });
    assert('state 1 — the COLUMN is NULL', dbNull.askAuthorLine === null);
    const gNull = await get();
    assert('state 1 — a fresh GET returns null', gNull.body.storedAuthorLine === null);
    const stateNull = {
      stored: gNull.body.storedAuthorLine,
      composed: composeFor(gNull.body.storedAuthorLine).movements[0].text,
    };
    assert(
      'state 1 — composes to the GENERATED DRAFT',
      stateNull.composed.includes(DRAFT),
      stateNull.composed.slice(0, 70) + '…'
    );

    // ── the difference, proven rather than assumed ───────────────────────────
    console.log('');
    console.log(`  \x1b[90mstate 1  null   → ${stateNull.composed.slice(0, 78)}…\x1b[0m`);
    console.log(`  \x1b[90mstate 2  ''     → ${stateEmpty.composed}\x1b[0m`);
    console.log(`  \x1b[90mstate 3  value  → ${stateValue.composed}\x1b[0m`);
    console.log('');

    assert(
      "NULL and '' ARE DIFFERENT FACTS — different stored values",
      stateNull.stored === null &&
        stateEmpty.stored === '' &&
        stateNull.stored !== stateEmpty.stored
    );
    assert(
      "NULL and '' ARE DIFFERENT MESSAGES — the guest reads something different",
      stateNull.composed !== stateEmpty.composed
    );
    assert(
      'all three states are mutually distinct',
      new Set([stateNull.composed, stateEmpty.composed, stateValue.composed]).size === 3
    );
    assert(
      "the handover survives in all three — §5's load-bearing beat is never the one cut",
      [null, '', SECOND].every((v) => composeFor(v).movements.length === 3)
    );

    // ── 6. whitespace-only is state 2, not state 1 ───────────────────────────
    const pWs = await patch({ askAuthorLine: '   \n  ' });
    assert(
      "whitespace-only stores '' — state 2, NOT null",
      pWs.body.storedAuthorLine === '',
      JSON.stringify(pWs.body.storedAuthorLine)
    );
    const dbWs = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { askAuthorLine: true },
    });
    assert("whitespace-only leaves the column as '', not NULL", dbWs.askAuthorLine === '');

    // ── 7. bad input still refuses, and changes nothing ──────────────────────
    await patch({ askAuthorLine: null });
    const bad = await patch({ askAuthorLine: 42 });
    assert(
      'a non-string, non-null body is a 400, not a silent no-op',
      bad.status === 400,
      `got ${bad.status}`
    );
    const missing = await patch({});
    assert(
      'a missing key is a 400, not a silent clear',
      missing.status === 400,
      `got ${missing.status}`
    );
    const stillNull = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { askAuthorLine: true },
    });
    assert('and neither 400 changed the column', stillNull.askAuthorLine === null);
  } finally {
    // ── restore ──────────────────────────────────────────────────────────────
    await prisma.event.update({ where: { id: event.id }, data: { askAuthorLine: SNAPSHOT } });
    if (tempUserId) {
      await prisma.eventRole.deleteMany({ where: { userId: tempUserId } });
      await prisma.session.deleteMany({ where: { userId: tempUserId } });
      await prisma.user.delete({ where: { id: tempUserId } });
    }

    const after = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      select: { askAuthorLine: true },
    });
    const rolesAfter = await prisma.eventRole.count({ where: { eventId: event.id } });
    const usersLeft = await prisma.user.count({ where: { email: TEMP_EMAIL } });

    console.log('');
    assert(
      'FIXTURE RESTORED: askAuthorLine is back to its snapshot',
      after.askAuthorLine === SNAPSHOT,
      JSON.stringify(after.askAuthorLine)
    );
    assert(
      'FIXTURE RESTORED: EventRole count is back',
      rolesAfter === rolesBefore,
      `${rolesBefore} → ${rolesAfter}`
    );
    assert('FIXTURE RESTORED: no temporary user left behind', usersLeft === 0);
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\x1b[31mRED\x1b[0m');
    process.exit(1);
  }
  console.log(
    '\x1b[32mGREEN — write, reload, and three distinct states: draft, no line, her words.\x1b[0m'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
