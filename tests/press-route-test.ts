/**
 * GTC-189 slice 5a — the press route, dark.
 *
 * WHAT THIS SLICE IS. One route (decision 30), renamed (decision 31), writing the lock and
 * one `OutboundMessage` per addressed recipient inside one transaction. **Nothing sends.**
 * There is no dispatcher, so every row this writes is created and never drained, and no
 * provider is reached from anywhere in this commit.
 *
 * ── THE FIVE FOUNDER ANSWERS OF 2026-09-19 THAT THIS HOLDS ────────────────────
 *
 * Q1 — SIX MEMBERSHIPS, NOT EIGHT. *"The outbound row is addressed to someone, and the
 *   pre-flight's own arithmetic says '8 messages' — two of those eight are not messages. It
 *   also makes the withheld count a truthful answer to 'how many did not go out'."*
 *   So a row exists for a recipient IF AND ONLY IF the press has a link to put in their
 *   message. After `ensureEventTokens` runs inside the transaction, that is exactly
 *   `linkState === 'READY'`; `NONE_HOST_CARRIER` ([[GTC-297]]) and `NONE_NOT_ISSUED` are the
 *   two states that are not messages. Layer Q pins it in both directions.
 *   ⚠ **AND DECISION 29 IS SATISFIED EITHER WAY — this is bookkeeping, not honesty.** The
 *   pre-flight is what makes the withholding honest. Recorded here so no reader takes the
 *   row set for the thing that tells the host anything.
 *
 * Q2 — THE RECIPIENT COUNT IS WRITTEN INSIDE THE TRANSACTION. *"A recipient count written
 *   outside it is a number that can disagree with the rows it counts."* Layer T asserts the
 *   ledger's `recipients` equals the rows actually written, on the same event.
 *
 * Q3 — REFUSE ON UNHEALTHY, FAIL CLOSED. *"An event whose recipient set cannot be assembled
 *   is not an event ready to send, and 500-then-nothing is the shape where the host presses
 *   and cannot tell what happened."*
 *
 * Q4 — 409 ON A STATE REFUSAL. *"A 402 says pay, a 403 says you may not, and neither is true
 *   of an event that is not ready. 409 is the honest one — the request is fine, the state is
 *   not."*
 *
 * Q5 — RENAME NOW, AND TAKE THE REDIRECT. The press is `POST /api/events/[id]/send` and
 *   `POST /api/h/[token]/send`. The old `confirm-invites-sent` paths are kept as redirects
 *   and carry no press logic of their own — asserted, because a redirect that quietly grew a
 *   second implementation is the drift decision 30 exists to close.
 *
 * ── AND WHAT THIS SUITE EXISTS TO STOP ────────────────────────────────────────
 *
 * ⚠ TWO LIVE HOST-REACHABLE BUTTONS POST TO THE OLD PATH, AND NEITHER IS THE PRE-FLIGHT.
 * `InviteStatusSection` on `/plan/[eventId]` and the host view at `/h/[token]` both read
 * "I've sent the invites". While this slice is dark that is safe — the rows never drain. It
 * stops being safe the moment slice 5c exists, and layer W asserts the button count so the
 * next slice cannot ship without meeting them.
 *
 * ⚠ `PersonEvent.sentAt` IS NOT WRITTEN BY THE PRESS ANY MORE (ruling G). Layer G asserts the
 * absence directly, because the `updateMany` that wrote it is the most natural thing for a
 * later reader to put back.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 * Requires the dev server on :3000 — the press is session-guarded, so the session door is
 * asserted over HTTP and the press itself is driven through the module.
 *
 * Run: npx tsx tests/press-route-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC189P';
const BASE = 'http://localhost:3000';

const NEW_SESSION_ROUTE = 'src/app/api/events/[id]/send/route.ts';
const NEW_TOKEN_ROUTE = 'src/app/api/h/[token]/send/route.ts';
const OLD_SESSION_ROUTE = 'src/app/api/events/[id]/confirm-invites-sent/route.ts';
const OLD_TOKEN_ROUTE = 'src/app/api/h/[token]/confirm-invites-sent/route.ts';
const NEXT_CONFIG = 'next.config.js';
const PRESS_MODULE = 'src/lib/press/press.ts';
const LIFECYCLE = 'src/lib/lifecycle.ts';

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}

/** The RED run must report every assertion, not stop at the first undefined. */
function ok(fn: () => boolean): boolean {
  try {
    return !!fn();
  } catch {
    return false;
  }
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function read(path: string): string {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ── Layer 0: controls ────────────────────────────────────────────────
    section('Layer 0: controls — the harness and the tree, before anything is trusted');

    const health = await fetch(`${BASE}/api/events`);
    assert(
      'CONTROL: the dev server is up on :3000 and answers 401 with no cookie',
      health.status === 401
    );
    assert(
      'CONTROL: the comment stripper strips — asserted before the structural guards trust it',
      stripComments('/* updateMany */ const a = 1; // b\nconst c = 2;').includes('updateMany') ===
        false
    );
    assert(
      'CONTROL: the file reader really reads — a path that exists comes back non-empty and a ' +
        'path that does not comes back "", so every absence below could otherwise pass for ' +
        'the wrong reason',
      read(LIFECYCLE).length > 0 && read('src/lib/does-not-exist.ts') === ''
    );

    let press: any = null;
    try {
      press = await import('../src/lib/press/press');
    } catch {
      press = null;
    }

    /*
     * A missing module must read as FAILED ASSERTIONS, not a crashed run — `ask-preview-test`'s
     * rule, and the reason every layer below still reports at RED. The stand-in answers a shape
     * no assertion can mistake for a pass.
     */
    const callPress = async (args: Record<string, unknown>) => {
      if (!press?.pressSend) return { ok: false, status: -1, code: 'MODULE_ABSENT' } as any;
      try {
        return await press.pressSend(prisma, args);
      } catch (e) {
        return { ok: false, status: -1, code: 'THREW', error: String(e) } as any;
      }
    };

    // ── Layer R: one route, renamed, with the old name a pointer ─────────
    section('Layer R: one press, renamed (decisions 30 and 31), the old paths pointing at it');

    assert(
      `${PRESS_MODULE} exists and exports pressSend — the one writer both doors call`,
      ok(() => typeof press.pressSend === 'function')
    );
    assert(`${NEW_SESSION_ROUTE} exists`, read(NEW_SESSION_ROUTE).length > 0);
    assert(`${NEW_TOKEN_ROUTE} exists`, read(NEW_TOKEN_ROUTE).length > 0);

    const newSession = stripComments(read(NEW_SESSION_ROUTE));
    const newToken = stripComments(read(NEW_TOKEN_ROUTE));

    assert('the new session route calls pressSend', newSession.includes('pressSend'));
    assert('the new host-token route calls pressSend', newToken.includes('pressSend'));
    assert(
      'the new session route keeps its own auth — requireEventRole is the session door',
      newSession.includes('requireEventRole')
    );
    assert(
      'the new host-token route keeps its own auth — resolveToken and a HOST scope check',
      newToken.includes('resolveToken') && newToken.includes("'HOST'")
    );
    assert(
      '⚠ AND EACH DOOR KEEPS ITS OWN AUTH RATHER THAN SHARING ONE: the press module names ' +
        'neither requireEventRole nor resolveToken. Auth is the one thing the two doors must ' +
        'not share, because they authenticate different things',
      ok(
        () =>
          stripComments(read(PRESS_MODULE)).length > 0 &&
          !stripComments(read(PRESS_MODULE)).includes('requireEventRole') &&
          !stripComments(read(PRESS_MODULE)).includes('resolveToken')
      )
    );

    /*
     * ⚠ THE OLD PATHS ARE A CONFIG REDIRECT, NOT TWO ROUTE HANDLERS, AND THIS IS THE
     * ASSERTION THAT SAYS SO. Written as `route.ts` files they worked and cost two exported
     * HTTP handlers carrying no guard and no credential of any kind —
     * `tests/security-route-scan-control.ts` moved 7 of its 118 pinned assertions on the
     * spot, "exactly 12 handlers carry no guard and no other credential of any kind" among
     * them. As `redirects()` in next.config.js there is no handler and every pinned count
     * stays where it was.
     */
    assert(
      '⚠ THE OLD SESSION PATH HAS NO ROUTE FILE AT ALL — it is a config redirect, so it adds ' +
        'no unguarded handler to the API surface',
      !fs.existsSync(OLD_SESSION_ROUTE) &&
        !fs.existsSync('src/app/api/events/[id]/confirm-invites-sent')
    );
    assert(
      '⚠ THE OLD HOST-TOKEN PATH HAS NO ROUTE FILE EITHER. This is the file that held the ' +
        'drift decision 30 names: a second copy of the whole press whose SEND_PRESSED entry ' +
        'wrote no recipientCount',
      !fs.existsSync(OLD_TOKEN_ROUTE) &&
        !fs.existsSync('src/app/api/h/[token]/confirm-invites-sent')
    );
    const cfg = read(NEXT_CONFIG);
    assert(
      'next.config.js carries both redirects, as 307s — permanent: false preserves the ' +
        'method, and a 302 rewriting POST to GET would silently stop the press happening',
      cfg.includes('confirm-invites-sent') &&
        cfg.includes('/api/events/:id/send') &&
        cfg.includes('/api/h/:token/send') &&
        !cfg.includes('permanent: true')
    );

    /*
     * ⚠ THE REDIRECT IS ASSERTED OVER HTTP, NOT READ OFF THE SOURCE. A source grep for
     * "redirect" proves a word is present; it does not prove the method survives the hop,
     * which is the only property that matters to the two live buttons. 307 preserves POST;
     * a 301 or 302 may rewrite it to GET, and the press would then silently stop happening.
     *
     * No auth is needed to see it: the redirect route deliberately has none, so an
     * unauthenticated POST reaches the redirect and is refused at the target instead.
     */
    const oldSessionHop = await fetch(`${BASE}/api/events/some-event-id/confirm-invites-sent`, {
      method: 'POST',
      redirect: 'manual',
    });
    assert(
      '⚠ THE OLD SESSION PATH ANSWERS 307 — the method and body survive the hop, which is ' +
        'what the two live "I\'ve sent the invites" buttons depend on',
      oldSessionHop.status === 307
    );
    assert(
      'and it points at /send, on the same origin',
      (oldSessionHop.headers.get('location') ?? '').endsWith('/api/events/some-event-id/send')
    );
    const oldTokenHop = await fetch(`${BASE}/api/h/some-token/confirm-invites-sent`, {
      method: 'POST',
      redirect: 'manual',
    });
    assert(
      'the old host-token path answers 307 and points at /send',
      oldTokenHop.status === 307 &&
        (oldTokenHop.headers.get('location') ?? '').endsWith('/api/h/some-token/send')
    );
    const followed = await fetch(`${BASE}/api/events/some-event-id/confirm-invites-sent`, {
      method: 'POST',
    });
    assert(
      '⚠ AND FOLLOWED, IT LANDS ON A GUARDED ROUTE: an unauthenticated POST through the old ' +
        'path is refused 401 by the session door at the target, not admitted by the pointer ' +
        'that has no door of its own',
      followed.status === 401
    );

    // ── Layer G: the stamp moved (ruling G) ─────────────────────────────
    section('Layer G: the per-person clock left the press, and isMiniSend left the tree');

    assert(
      '⚠ NO ROUTE AND NO MODULE OF THE PRESS STAMPS PersonEvent.sentAt — ruling G moves it ' +
        'to each provider acceptance, which is slice 5d. This is the absence a later reader ' +
        'is most likely to undo',
      ok(
        () =>
          stripComments(read(PRESS_MODULE)).length > 0 &&
          newSession.length > 0 &&
          newToken.length > 0 &&
          !stripComments(read(PRESS_MODULE)).includes('personEvent.updateMany') &&
          !newSession.includes('personEvent.updateMany') &&
          !newToken.includes('personEvent.updateMany')
      )
    );
    /*
     * ⚠ THE ASSERTION IS ABOUT THE FUNCTION, NOT THE WORD, AND THE DIFFERENCE IS DELIBERATE.
     * `src/lib/lifecycle.ts` keeps a tombstone NAMING isMiniSend and saying which ruling
     * killed it — the house shape, as `removePerson()` and the Auto-Assign condition both
     * have. A string search would fail on the tombstone, so the only way to hold decision 33
     * is to assert that nothing EXPORTS it and nothing CALLS it.
     */
    let lifecycleMod: any = null;
    try {
      lifecycleMod = await import('../src/lib/lifecycle');
    } catch {
      lifecycleMod = null;
    }
    assert(
      'src/lib/lifecycle.ts EXPORTS no isMiniSend (decision 33 — removed, not redefined)',
      ok(() => lifecycleMod !== null && lifecycleMod.isMiniSend === undefined)
    );
    assert(
      'CONTROL: that module still exports the predicates isMiniSend sat beside, so the ' +
        'absence above is an absence and not a failed import',
      ok(
        () =>
          typeof lifecycleMod.isSent === 'function' && typeof lifecycleMod.neededBy === 'function'
      )
    );
    /*
     * ⚠ NO `\s*` BEFORE THE PAREN, AND THAT IS THE WHOLE CORRECTION. Written as
     * /isMiniSend\s*\(/ this matched its own assertion label — "EXPORTS no isMiniSend
     * (decision 33 …)" — because prose puts a space between a name and a bracket and code
     * does not. It reported this file as a caller on the first GREEN run. A matcher for a
     * CALL must not match a SENTENCE, and the third control below is that lesson as an
     * assertion.
     */
    const CALL = /isMiniSend\([^)]/;
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const q = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(q);
        else if (/\.tsx?$/.test(e.name) && CALL.test(read(q))) callers.push(q);
      }
    };
    walk('src');
    walk('tests');
    assert(
      'nothing in src/ or tests/ CALLS isMiniSend — the tombstone naming it does not count, ' +
        `which is why this matches a call and not a word (found: ${callers.join(', ') || 'none'})`,
      callers.length === 0
    );
    /*
     * ⚠ THE PLANTED CALL IS BUILT BY CONCATENATION, AND THAT IS NOT A STYLE CHOICE. Written
     * as a literal, this file would itself contain a call to isMiniSend, and the walk above
     * — which reads tests/ — would find it and fail. It did, on the first GREEN run. An
     * exclusion list for this file would have worked and would have been a list that rots;
     * building the string means the file honestly contains no call.
     */
    const PLANTED = 'isMiniSend' + '(pe, event)';
    const TOMBSTONE = 'isMiniSend' + '() was deleted';
    const PROSE = 'isMiniSend' + ' (decision 33 — removed, not redefined)';
    assert(
      'CONTROL: the call matcher matches a CALL, and not the tombstone, and not a SENTENCE ' +
        'naming the function — an absence found by a broken pattern is the shape slice 4a ' +
        'got wrong, and the sentence case is the one this suite actually tripped on',
      CALL.test(PLANTED) && !CALL.test(TOMBSTONE) && !CALL.test(PROSE)
    );

    // ── The fixture ──────────────────────────────────────────────────────
    const now = new Date();
    const stamp = Date.now();
    const endDate = new Date(now.getTime() + 7 * DAY);

    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.com` } });
    createdUserIds.push(user.id);

    async function person(name: string, email: string | null) {
      const p = await prisma.person.create({
        data: { name: `${TAG} ${name}`, email },
      });
      createdPersonIds.push(p.id);
      return p;
    }

    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Kate`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    // Six addressed memberships and two that are not messages — Q1's arithmetic, built.
    const amelia = await person('Amelia', `${TAG.toLowerCase()}-amelia+${stamp}@example.com`);
    const james = await person('James', null); // her household's CHILD — carried, not addressed
    const bob = await person('Bob', `${TAG.toLowerCase()}-bob+${stamp}@example.com`);
    const cara = await person('Cara', `${TAG.toLowerCase()}-cara+${stamp}@example.com`);
    const dan = await person('Dan', `${TAG.toLowerCase()}-dan+${stamp}@example.com`);
    const eve = await person('Eve', `${TAG.toLowerCase()}-eve+${stamp}@example.com`);
    const colin = await person('Colin', `${TAG.toLowerCase()}-colin+${stamp}@example.com`);
    const mute = await person('Mute', null); // no email, no phone -> the host's list
    /*
     * ⚠ FAY IS THE WHOLE POINT OF FOUNDER Q1, AND THE FIXTURE WAS WRONG WITHOUT HER.
     *
     * She is a CHILD of a household whose picked contact is the HOST — ruling A2, the one case
     * in the model where the host receives an ask. `chooseAskRoute` carries her ask to the
     * host, so the HOST becomes a recipient with `linkState: 'NONE_HOST_CARRIER'`: she has no
     * guest link, because [[GTC-256]] Ruling 8 gives her none and [[GTC-297]] owns the one-off
     * link that will.
     *
     * She is here because the first GREEN run of this suite had six recipients and six
     * addressed recipients, so `preview.recipients` and the filtered set were the SAME LIST —
     * and mutation M1, deleting the filter entirely, reported nothing. The count was proven and
     * the FILTER was never exercised. See the slice's evidence.
     */
    const fay = await person('Fay', null);

    const event = await prisma.event.create({
      data: {
        name: `${TAG} the press`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(event.id);
    await prisma.eventRole.create({
      data: { eventId: event.id, userId: user.id, role: 'HOST' },
    });

    const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });

    const hhHost = await prisma.household.create({ data: { eventId: event.id } });
    const hhA = await prisma.household.create({ data: { eventId: event.id } });
    const hhB = await prisma.household.create({ data: { eventId: event.id } });

    const peHost = await prisma.personEvent.create({
      data: {
        personId: hostPerson.id,
        eventId: event.id,
        role: 'HOST',
        householdId: hhHost.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    const peAmelia = await prisma.personEvent.create({
      data: {
        personId: amelia.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: hhA.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    await prisma.personEvent.create({
      data: {
        personId: james.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: hhA.id,
        householdRole: 'CHILD',
      },
    });
    for (const p of [bob, cara, dan, eve, mute]) {
      await prisma.personEvent.create({
        data: { personId: p.id, eventId: event.id, role: 'PARTICIPANT' },
      });
    }
    await prisma.personEvent.create({
      data: {
        personId: fay.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: hhB.id,
        householdRole: 'CHILD',
      },
    });
    await prisma.personEvent.create({
      data: { personId: colin.id, eventId: event.id, role: 'COORDINATOR', teamId: team.id },
    });
    await prisma.household.update({
      where: { id: hhHost.id },
      data: { contactPersonEventId: peHost.id },
    });
    await prisma.household.update({
      where: { id: hhA.id },
      data: { contactPersonEventId: peAmelia.id },
    });
    // Ruling A2: household B picked the HOST as its contact, by an explicit pick and never by
    // default — `resolveHouseholdChannel` falls back only to a household's own primary contact.
    await prisma.household.update({
      where: { id: hhB.id },
      data: { contactPersonEventId: peHost.id },
    });

    async function row(personId: string, name: string) {
      const item = await prisma.item.create({
        data: { name: `${TAG} ${name}`, teamId: team.id, status: 'ASSIGNED' },
      });
      await prisma.assignment.create({ data: { itemId: item.id, personId, response: 'PENDING' } });
    }
    await row(amelia.id, 'the pavlova');
    await row(james.id, 'the crackers');
    await row(bob.id, 'the beer');
    await row(cara.id, 'the cake');
    await row(dan.id, 'the dip');
    await row(eve.id, 'the eggs');
    await row(colin.id, 'the ale');
    await row(mute.id, 'the mustard');
    await row(fay.id, 'the fruit');

    section('Layer 0b: the fixture presses the way the assertions need');

    const previewBefore = await (
      await import('../src/lib/preflight/ask-preview')
    ).readAskPreview(prisma, event.id, BASE);
    assert(
      'CONTROL: the fixture has SEVEN recipients and one host-list line before the press — ' +
        'read through readAskPreview, not asserted of the fixture',
      ok(() => previewBefore!.recipients.length === 7 && previewBefore!.hostList.length === 1)
    );
    assert(
      '⚠ CONTROL — AND THIS IS THE ONE THAT WAS MISSING: exactly ONE of the seven is a ' +
        'recipient the press has NO link for. Without it `preview.recipients` and the ' +
        'addressed set are the same list, the filter is never exercised, and a mutation ' +
        'deleting it reports nothing — which is what happened on the first GREEN run',
      ok(
        () =>
          previewBefore!.recipients.filter((r) => r.linkState === 'NONE_HOST_CARRIER').length === 1
      )
    );
    assert(
      'CONTROL: the host is that recipient, and she is one by ruling A2 — another household ' +
        'picked her and a child of it holds an item',
      ok(() => previewBefore!.recipients.some((r) => r.hostAsCarrier && r.carried.length === 1))
    );
    assert(
      'CONTROL: nobody holds a PARTICIPANT token yet — every recipient the press can issue ' +
        'to reads AT_PRESS, so the press is what issues them',
      ok(() => previewBefore!.recipients.filter((r) => r.linkState === 'AT_PRESS').length === 6)
    );
    assert(
      'CONTROL: Amelia carries the child, so the carried path is exercised',
      ok(() => previewBefore!.recipients.some((r) => r.carried.length === 1))
    );
    const childPeIds = (
      await prisma.personEvent.findMany({
        where: { eventId: event.id, householdRole: 'CHILD' },
        select: { id: true, personId: true },
      })
    ).map((r) => r);
    assert(
      'CONTROL: the fixture has two CHILD memberships — one carried by an adult, one carried ' +
        'by the host under ruling A2. Neither may hold an outbound row',
      childPeIds.length === 2
    );

    // ── Layer P: the press writes, once, in one transaction ─────────────
    section('Layer P: what the press writes');

    const pressed = await callPress({
      eventId: event.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });
    assert(
      'the press succeeds on a CONFIRMING event that has never been sent',
      ok(() => pressed.ok)
    );

    const after = await prisma.event.findUnique({
      where: { id: event.id },
      select: { sentAt: true },
    });
    assert('Event.sentAt is anchored — the lock', !!after?.sentAt);

    const previewAfterCount = (await (
      await import('../src/lib/preflight/ask-preview')
    ).readAskPreview(prisma, event.id, BASE))!.recipients.length;

    const rows = await prisma.outboundMessage.findMany({
      where: { eventId: event.id },
      select: {
        personEventId: true,
        kind: true,
        channel: true,
        attemptedAt: true,
        attemptCount: true,
        acceptedAt: true,
        rejectedAt: true,
        withheldAt: true,
        withheldWhy: true,
        provider: true,
        providerMessageId: true,
        nextAttemptAt: true,
      },
    });

    // ── Layer Q: Q1's arithmetic ────────────────────────────────────────
    section('Layer Q: SIX rows, not eight — a row is addressed to someone (founder Q1)');

    assert(
      '⚠ SIX ROWS FOR SEVEN RECIPIENTS — a row is addressed to someone, and the seventh is ' +
        'the host as carrier, who has no link to be addressed by (founder Q1)',
      rows.length === 6 && previewAfterCount === 7
    );
    assert('every row is kind ASK', rows.length > 0 && rows.every((r) => r.kind === 'ASK'));
    assert(
      '⚠ NO ROW IS WRITTEN FOR A CHILD — the carried child is IN a message, not addressed by ' +
        'one. The child rule leads chooseAskRoute, so a row that must never be sent is never ' +
        'created rather than created and gated',
      rows.length > 0 && !rows.some((r) => childPeIds.some((c) => c.id === r.personEventId))
    );
    const previewAfter = await (
      await import('../src/lib/preflight/ask-preview')
    ).readAskPreview(prisma, event.id, BASE);
    assert(
      'after the press every recipient the press CAN issue to reads READY, and the host as ' +
        'carrier still reads NONE_HOST_CARRIER — the press issues tokens, it does not invent ' +
        'a link GTC-256 Ruling 8 withholds',
      ok(
        () =>
          previewAfter!.recipients.filter((r) => r.linkState === 'READY').length === 6 &&
          previewAfter!.recipients.filter((r) => r.linkState === 'NONE_HOST_CARRIER').length === 1
      )
    );
    assert(
      '⚠ THE ROW SET IS EXACTLY THE RECIPIENTS WITH A LINK — asserted by comparing the two ' +
        'id sets, not by comparing two counts that could agree by accident',
      ok(() => {
        const fromRows = rows.map((r) => r.personEventId).sort();
        const fromPreview = previewAfter!.recipients
          .filter((r) => r.linkState === 'READY')
          .map((r) => r.personEventId)
          .sort();
        // ⚠ THE LENGTH GUARD IS NOT DEFENSIVE. Two EMPTY sets are equal, so without it this
        // assertion passes on a tree where the press does not exist — the exact false
        // positive GTC-273 and GTC-276 are both about.
        return fromRows.length > 0 && JSON.stringify(fromRows) === JSON.stringify(fromPreview);
      })
    );
    assert(
      "the channel on each row is the chooser's answer for that recipient, stored — not " +
        'recomputed later',
      ok(() => {
        const byPe = new Map(previewAfter!.recipients.map((r) => [r.personEventId, r.channel]));
        return rows.length > 0 && rows.every((r) => byPe.get(r.personEventId) === r.channel);
      })
    );

    // ── Layer D: the rows are unclaimed and unfinished ──────────────────
    section('Layer D: dark — nothing is claimed, attempted, accepted, rejected or withheld');

    assert(
      '⚠ EVERY ROW IS UNCLAIMED: attemptedAt null and attemptCount 0. The claim belongs to ' +
        'the dispatcher (slice 5c) and the press must not take it — a row the press claimed ' +
        'is a row the dispatcher will never send',
      rows.length > 0 && rows.every((r) => r.attemptedAt === null && r.attemptCount === 0)
    );
    assert(
      'every row is unfinished: acceptedAt, rejectedAt and withheldAt all null',
      rows.length > 0 &&
        rows.every((r) => r.acceptedAt === null && r.rejectedAt === null && r.withheldAt === null)
    );
    assert(
      'no row carries a provider, a provider message id, a withheld why or a retry time — ' +
        'all four are facts about an attempt, and no attempt has been made',
      rows.length > 0 &&
        rows.every(
          (r) =>
            r.provider === null &&
            r.providerMessageId === null &&
            r.withheldWhy === null &&
            r.nextAttemptAt === null
        )
    );

    // ── Layer G2: no per-person clock ───────────────────────────────────
    section('Layer G2: the press stamped no personal clock (ruling G)');

    const stamped = await prisma.personEvent.count({
      where: { eventId: event.id, sentAt: { not: null } },
    });
    assert(
      '⚠ NOT ONE PersonEvent.sentAt WAS WRITTEN. Every recipient is unnudgeable until their ' +
        'own send is accepted, which findNudgeCandidates already calls a fail-safe rather ' +
        'than a tidy-up',
      stamped === 0
    );

    // ── Layer T: the ledger, and Q2 ─────────────────────────────────────
    section('Layer T: the ledger entry, and its count (founder Q2)');

    const ledgerEntries = await prisma.auditEntry.findMany({
      where: { eventId: event.id, actionType: 'SEND_PRESSED' },
      select: { after: true, targetType: true, targetId: true, sequence: true, actorKind: true },
    });
    assert(
      "the press is the ledger's first entry — exactly one SEND_PRESSED change, on the Event",
      ledgerEntries.length === 1 &&
        ledgerEntries[0].targetType === 'Event' &&
        ledgerEntries[0].targetId === event.id
    );
    assert(
      '⚠ THE RECIPIENT COUNT IN THE LEDGER IS THE NUMBER OF ROWS ACTUALLY WRITTEN, and it ' +
        'is written inside the same transaction that wrote them (founder Q2)',
      ok(() => (ledgerEntries[0].after as any).recipients === rows.length)
    );
    assert(
      'the entry carries the send timestamp it locked',
      ok(() => typeof (ledgerEntries[0].after as any).sentAt === 'string')
    );
    const inviteEvents = await prisma.inviteEvent.count({
      where: { eventId: event.id, type: 'INVITE_SEND_CONFIRMED' },
    });
    assert('one INVITE_SEND_CONFIRMED instrumentation row', inviteEvents === 1);

    // ── Layer X: the refusals ───────────────────────────────────────────
    section('Layer X: what the press refuses (founder Q3 and Q4)');

    const second = await callPress({
      eventId: event.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });
    assert(
      'THE SECOND PRESS IS REFUSED — the press happens once, and the guard is explicit ' +
        'rather than a side effect of a state machine',
      ok(() => second.ok === false && second.code === 'ALREADY_SENT')
    );
    assert(
      'and it wrote nothing: the row count is unchanged after the refused second press. ' +
        '⚠ COMPARED AGAINST THE COUNT TAKEN BEFORE IT, not against the literal 6 — a ' +
        'hardcoded number here makes this assertion fail whenever the row SET changes, ' +
        'which is false collateral on any mutation of the filter and was',
      (await prisma.outboundMessage.count({ where: { eventId: event.id } })) === rows.length
    );

    const missing = await callPress({
      eventId: `${TAG}-no-such-event`,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });
    assert(
      'an event that does not exist is EVENT_NOT_FOUND, which is a 404 — the request names ' +
        'nothing, so it is not a state refusal',
      ok(() => missing.ok === false && missing.status === 404)
    );

    // Ruling AC — a host with no User. Built as its own event so the fixture above stays
    // the one that presses.
    const orphanHostPerson = await person('Orphan Host', null);
    const orphanEvent = await prisma.event.create({
      data: {
        name: `${TAG} no account`,
        startDate: endDate,
        endDate,
        hostId: orphanHostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(orphanEvent.id);
    await prisma.personEvent.create({
      data: { personId: orphanHostPerson.id, eventId: orphanEvent.id, role: 'HOST' },
    });
    /*
     * ⚠ THIS GUEST IS LOAD-BEARING AND WAS NOT HERE AT FIRST. Without an addressable
     * recipient this event refuses for TWO reasons, and the NO_RECIPIENTS refusal fires from
     * inside the transaction while ruling AC's fires before it — so a mutation disabling
     * ruling AC still produced a 409, and the status assertion below passed for the wrong
     * reason. Mutation M5 is what showed it. With a real guest here the only thing wrong with
     * this event is the missing account, and the refusal ORDER is observable too.
     */
    const orphanGuest = await person(
      'Orphan Guest',
      `${TAG.toLowerCase()}-orphanguest+${stamp}@example.com`
    );
    await prisma.personEvent.create({
      data: { personId: orphanGuest.id, eventId: orphanEvent.id, role: 'PARTICIPANT' },
    });
    const orphanTeam = await prisma.team.create({
      data: { name: `${TAG} Orphan`, eventId: orphanEvent.id },
    });
    const orphanItem = await prisma.item.create({
      data: { name: `${TAG} the olives`, teamId: orphanTeam.id, status: 'ASSIGNED' },
    });
    await prisma.assignment.create({
      data: { itemId: orphanItem.id, personId: orphanGuest.id, response: 'PENDING' },
    });
    const noAccount = await callPress({
      eventId: orphanEvent.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });
    assert(
      '⚠ RULING AC: THE PRESS REFUSES AN EVENT WHOSE HOST HAS NO ACCOUNT. "An event whose ' +
        'host has no account is fixed before it sends, not sent with a hole in it"',
      ok(() => noAccount.ok === false && noAccount.code === 'HOST_HAS_NO_ACCOUNT')
    );
    assert(
      '⚠ AND IT IS A 409, NOT A 402 OR A 403 (founder Q4): a 402 says pay and a 403 says you ' +
        'may not, and neither is true of an event that is not ready. The request is fine; ' +
        'the state is not',
      ok(() => noAccount.code === 'HOST_HAS_NO_ACCOUNT' && noAccount.status === 409)
    );
    const orphanRows = await prisma.outboundMessage.count({ where: { eventId: orphanEvent.id } });
    const orphanEventAfter = await prisma.event.findUnique({
      where: { id: orphanEvent.id },
      select: { sentAt: true },
    });
    const orphanLedger = await prisma.auditEntry.count({
      where: { eventId: orphanEvent.id, actionType: 'SEND_PRESSED' },
    });
    assert(
      'the refusal wrote nothing at all — no sentAt, no rows, no ledger entry',
      orphanRows === 0 && orphanEventAfter?.sentAt === null && orphanLedger === 0
    );
    assert(
      'GTC-309 is named in the press module — the refusal is here, what she is SHOWN is that ' +
        "ticket's, and the two halves must not be built with two different messages",
      stripComments(read(PRESS_MODULE)).length > 0 && read(PRESS_MODULE).includes('GTC-309')
    );

    const notConfirming = await prisma.event.create({
      data: {
        name: `${TAG} draft`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'DRAFT',
      },
    });
    createdEventIds.push(notConfirming.id);
    const draftPress = await callPress({
      eventId: notConfirming.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });
    assert(
      'a DRAFT event is refused — the plan must exist before it can be sent, which is a ' +
        'sequencing fact and not a gate on her judgement',
      ok(() => draftPress.ok === false && draftPress.code === 'NOT_CONFIRMING')
    );

    // Q3 — fail closed when the recipient set cannot be assembled.
    assert(
      '⚠ FOUNDER Q3: the module refuses on an unassemblable recipient set rather than ' +
        'throwing — RECIPIENTS_UNAVAILABLE exists as a refusal, so the failure mode is a ' +
        'told refusal and not 500-then-nothing',
      stripComments(read(PRESS_MODULE)).includes('RECIPIENTS_UNAVAILABLE')
    );

    const zero = await prisma.event.create({
      data: {
        name: `${TAG} nobody`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(zero.id);
    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: zero.id, role: 'HOST' },
    });
    const zeroPress = await callPress({
      eventId: zero.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });
    assert(
      "⚠ AN EVENT WITH NOBODY TO ASK IS REFUSED, and this is the executor's reading of " +
        "ruling AC's ground rather than a founder ruling — RAISED, and the assertion is " +
        'here so the behaviour is visible rather than implicit',
      ok(() => zeroPress.ok === false && zeroPress.code === 'NO_RECIPIENTS')
    );

    // ── Layer W: the two live buttons ───────────────────────────────────
    section('Layer W: the two live buttons that post to the old path');

    const inviteStatus = read('src/components/plan/InviteStatusSection.tsx');
    const hostView = read('src/app/h/[token]/page.tsx');
    /*
     * ⚠ THIS TRIPWIRE FIRED AT SLICE 5c's SECOND HALF, WHICH IS WHAT IT WAS FOR. It held that both
     * buttons still read "I've sent the invites" and still posted to the press — safe only while
     * the rows never drained. They drain now, and the founder ruled OPTION D: both navigate to the
     * pre-flight instead of pressing.
     *
     * Replaced with the standing rule rather than with the same check inverted, because the
     * inverted form lives in `tests/outbound-drain-test.ts` layer D. What belongs HERE is the
     * press's own invariant: how many surfaces can reach it.
     */
    const POSTS_TO_PRESS = /confirm-invites-sent|\/send['"`]/;
    assert(
      '⚠ NOTHING IN THE UI POSTS TO THE PRESS. Slice 5f wires exactly one caller — the ' +
        "pre-flight's Send button — and until then the count is zero. THREE PRESSING SURFACES IS " +
        'WHAT THE PRE-FLIGHT WAS BUILT TO PREVENT, and two of them existed until 5c',
      ok(() => {
        const hits: string[] = [];
        const walk = (dir: string) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const q = `${dir}/${e.name}`;
            if (e.isDirectory()) walk(q);
            else if (/\.tsx$/.test(e.name) && POSTS_TO_PRESS.test(stripComments(read(q)))) {
              hits.push(q);
            }
          }
        };
        walk('src');
        return hits.length === 0;
      })
    );
    assert(
      'CONTROL: the matcher really matches a post to the press — asserted against planted ' +
        'sources, because an absence found by a broken pattern is the shape slice 4a got wrong',
      POSTS_TO_PRESS.test('fetch(`/api/events/x/send`)') &&
        POSTS_TO_PRESS.test("fetch('/api/events/x/confirm-invites-sent')")
    );
    assert(
      'and the pre-flight Send button is still wired to nothing — slice 5f wires it, not ' +
        'this one',
      read('src/app/plan/[eventId]/pre-flight/page.tsx').includes('wired to nothing')
    );

    // ── Layer N: nothing sends ──────────────────────────────────────────
    section('Layer N: nothing in this slice reaches a provider');

    const pressSrc = stripComments(read(PRESS_MODULE));
    assert(
      '⚠ THE PRESS MODULE REACHES NO PROVIDER: it names no sender, no Resend, no TNZ, no ' +
        'Twilio and no fetch. Slice 5a writes rows and drains none',
      pressSrc.length > 0 &&
        !/sendSms|sendAskEmail|sendNudgeEmail|sendMagicLinkEmail|resend|Resend|tnz|Tnz|twilio|Twilio|fetch\(/.test(
          pressSrc
        )
    );
    /*
     * ⚠ THIS ASSERTION FIRED WHEN SLICE 5c LANDED, AND THAT IS THE TRIPWIRE WORKING. It held
     * `!fs.existsSync('src/app/api/cron/outbound-dispatch')` — "no dispatcher exists yet" — which
     * was true of 5a and became false the moment 5c's first half was built. Replaced with the
     * thing that must stay true FOREVER rather than the thing that was true for two commits.
     *
     * ⚠ NO INLINE DRAIN AT THE PRESS. Ruled 2026-09-19, and the reason is the ruling: "a request
     * that can be killed halfway is not one act with no recall." The press writes the rows; the
     * cron route drains them; and the press must never reach the dispatcher itself, because a
     * press that drained synchronously could be killed with half its rows claimed and unfinished.
     */
    assert(
      '⚠ THE PRESS DOES NOT DRAIN: it names neither the dispatch module nor any of its claims, so ' +
        'there is no inline drain and a killed request cannot leave claimed rows behind',
      pressSrc.length > 0 &&
        !pressSrc.includes('dispatch') &&
        !pressSrc.includes('claimForFirstAttempt') &&
        !pressSrc.includes('claimForRetry') &&
        !pressSrc.includes('describeDrain')
    );
    assert(
      'CONTROL: and the dispatcher really does exist now, so the absence above is an absence and ' +
        'not a module that was never there — slice 5c built it',
      fs.existsSync('src/app/api/cron/outbound-dispatch/route.ts') &&
        fs.existsSync('src/lib/press/dispatch.ts')
    );
    assert(
      '⚠ AND NO FAKE PROVIDER ANYWHERE (founder Q7, 2026-09-19: "no fake"). The press module ' +
        'names no NODE_ENV, no MOCK, no FAKE and no DRY_RUN — there is no second code path ' +
        'to forget to turn off',
      pressSrc.length > 0 && !/NODE_ENV|MOCK|FAKE|DRY_RUN|dryRun/.test(pressSrc)
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.outboundMessage.deleteMany({ where: { eventId } });
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } });
      await prisma.household.updateMany({
        where: { eventId },
        data: { contactPersonEventId: null },
      });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.eventRole.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }
    for (const personId of createdPersonIds) {
      await prisma.person.deleteMany({ where: { id: personId } });
    }
    for (const userId of createdUserIds) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
