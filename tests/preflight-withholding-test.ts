/**
 * GTC-189 slice 5b — the pre-flight's arithmetic tells the truth about what the press will do.
 *
 * DECISION 29, and what is left of it. The ruling: *"A recipient whose link cannot answer their
 * message is not READY, and slice 3's LinkState has to carry it the way it already carries the
 * coordinator and host-carrier cases. That is the fix that makes withholding honest."*
 *
 * ⚠ NO NEW `LinkState` MEMBER IS ADDED, AND THAT IS A DELIBERATE DEPARTURE FROM THE DECISION'S
 * OWN WORDING — recorded rather than done silently.
 *
 * The population decision 29 was ruled on is GONE. It was eighteen recipients carrying
 * thirty-four children's asks whose page could not answer them, and [[GTC-191]] built exactly
 * that answer: a separate `carried` array on `GET /api/p/[token]` and a carried write on the ack
 * route, authorised by re-running `chooseAskRoute`. Measured today: still 18 carriers and 34
 * carried asks in `gather_dev`, and their links now answer what their message asks. So a new
 * state for that gap would be a state with nothing to represent — which is the exact thing the
 * founder warned against at GTC-191: *"a state written after the gap closes is a state nobody
 * has seen fire."*
 *
 * ⚠ AND THE MODEL ALREADY NAMES WHAT IS LEFT. `NONE_HOST_CARRIER` (the host as carrier, whose
 * one-off link is [[GTC-297]]) and `NONE_NOT_ISSUED` (the fail-closed default) are both
 * first-class states. `NONE_COORDINATOR` was retired by [[GTC-294]], which gave coordinators a
 * PARTICIPANT token.
 *
 * ── SO WHAT IS ACTUALLY WRONG, AND IT IS THE ARITHMETIC ───────────────────────
 *
 * The founder's own words at Q1, 2026-09-19, name it in passing: *"the pre-flight's own
 * arithmetic says '8 messages' — two of those eight are not messages."*
 *
 *   - The count line reads `rows.length`, which is every recipient, including the ones the
 *     press will not message.
 *   - The `noLink` banner filters `NONE_NOT_ISSUED` only, so the host as carrier is counted as
 *     a message AND goes unnamed.
 *
 * Since slice 5a that is a disagreement with the code and not only a wording problem:
 * `pressSend` writes a row iff the press holds a link. The screen promises more messages than
 * the press sends, and it is wrong in the direction that reassures — the same direction as
 * decision 29's original finding.
 *
 * ── AND ONE PREDICATE, NOT TWO ────────────────────────────────────────────────
 *
 * `pressWillMessage` in `src/lib/preflight/ask-preview.ts` is the rule. The preview counts with
 * it and the press gates with it, so the screen and the send cannot answer the question
 * differently. Slice 5a read `linkState === 'READY'` inline, which was a second reading of the
 * same rule living in a different file — the drift `ask-preview.ts` already records GTC-294
 * catching in this very module.
 *
 * ── THE SILENT DROP 5a LEFT, AND 5b CLOSES ────────────────────────────────────
 *
 * ⚠ The preview's `linkOf` MIRRORS `ensureEventTokens` step 4 and the two do not agree in every
 * case. `linkOf` answers `AT_PRESS` for any PARTICIPANT or COORDINATOR membership; step 4 mints
 * only where `role === 'PARTICIPANT' && !coordinatorIds.has(personId)`, and `coordinatorIds`
 * carries no role filter. So a PARTICIPANT membership whose person is a team's `coordinatorId`
 * reads AT_PRESS, is minted nothing, and slice 5a **silently dropped them from the row set** —
 * no row, no withholding, and nothing anywhere telling the host.
 *
 * Measured in `gather_dev` on 2026-09-19: **0 such memberships.** Latent, not live. The fix is a
 * refusal and not a behaviour change: fail closed on founder Q3's ground, because a press that
 * quietly reaches fewer people than the screen promised is exactly the shape decision 29 exists
 * to prevent.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 *
 * Run: npx tsx tests/preflight-withholding-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC189W';
const BASE = 'http://localhost:3000';

const PREVIEW = 'src/lib/preflight/ask-preview.ts';
const COMPOSE = 'src/lib/preflight/ask-preview-compose.ts';
const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const PRESS_MODULE = 'src/lib/press/press.ts';

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

/**
 * The `LinkState` members, read off the DECLARATION with comments stripped first.
 *
 * ⚠ THE STRIP IS LOAD-BEARING AND WAS MISSING. Slicing the raw source to the first `;` stops
 * inside the declaration's first docstring, because that docstring contains a semicolon. The
 * assertion then measured an empty string and reported the wrong member count with total
 * confidence. Same family as every other finding in this ledger: a check examining something
 * adjacent to what it claimed to examine.
 */
function linkStateMembers(): string[] {
  const src = stripComments(read(PREVIEW));
  const at = src.indexOf('export type LinkState');
  if (at < 0) return [];
  const decl = src.slice(at, src.indexOf(';', at));
  return (decl.match(/'([A-Z_]+)'/g) ?? []).map((q) => q.replace(/'/g, ''));
}

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ── Layer 0: controls ────────────────────────────────────────────────
    section('Layer 0: controls — the harness and the tree');

    assert(
      'CONTROL: the comment stripper strips',
      stripComments('/* rows.length */ const a = 1; // b').includes('rows.length') === false
    );
    assert(
      'CONTROL: the file reader really reads — an existing path is non-empty and a missing one ' +
        'is "", so no absence below passes for the wrong reason',
      read(PREVIEW).length > 0 && read('src/lib/preflight/nope.ts') === ''
    );

    let preview: any = null;
    let compose: any = null;
    try {
      preview = await import('../src/lib/preflight/ask-preview');
    } catch {
      preview = null;
    }
    try {
      compose = await import('../src/lib/preflight/ask-preview-compose');
    } catch {
      compose = null;
    }

    // ── Layer P: one predicate ───────────────────────────────────────────
    section('Layer P: one predicate for "will the press message this recipient"');

    assert(
      `${PREVIEW} exports pressWillMessage`,
      ok(() => typeof preview.pressWillMessage === 'function')
    );
    assert(
      'READY is messaged — the press holds the link now',
      ok(() => preview.pressWillMessage('READY') === true)
    );
    assert(
      'AT_PRESS is messaged — the press issues the link, which is what AT_PRESS means',
      ok(() => preview.pressWillMessage('AT_PRESS') === true)
    );
    assert(
      '⚠ NONE_HOST_CARRIER is NOT messaged — GTC-256 Ruling 8 gives her no guest link and ' +
        'GTC-297 owns the one-off link that will. composeAsk could not compose for her anyway: ' +
        'its `link` is a required string',
      ok(() => preview.pressWillMessage('NONE_HOST_CARRIER') === false)
    );
    assert(
      'NONE_NOT_ISSUED is NOT messaged — the fail-closed default for a role the enum does not ' +
        'yet have',
      ok(() => preview.pressWillMessage('NONE_NOT_ISSUED') === false)
    );
    assert(
      '⚠ THE PRESS GATES ON THE PREDICATE AND NOT ON A SECOND READING OF THE RULE. Slice 5a ' +
        "read `linkState === 'READY'` inline, in a different file from the states themselves — " +
        'which is the drift this very module records GTC-294 catching once already',
      ok(() => {
        const src = stripComments(read(PRESS_MODULE));
        return src.length > 0 && src.includes('pressWillMessage');
      })
    );

    // ── Layer N: no new state, and the reason ────────────────────────────
    section('Layer N: no new LinkState member, because the gap it was for is closed');

    assert(
      '⚠ `LinkState` still has exactly four members. Decision 29 says the state should be ' +
        'added; the gap it was ruled on was closed by GTC-191, so a fifth member would ' +
        'represent nothing — "a state written after the gap closes is a state nobody has seen ' +
        'fire"',
      ok(() => linkStateMembers().length === 4)
    );
    assert(
      '⚠ CONTROL — AND IT IS THE ONE THAT CAUGHT THE ASSERTION ABOVE BEING WRONG: the ' +
        'declaration reader finds all four members by name. Written without stripComments it ' +
        "sliced to the first ';' in the RAW source, and the first docstring inside the " +
        'declaration contains one — "A PARTICIPANT token exists; `link` is its URL" — so it ' +
        'read an empty member list and reported zero. A parser written as a string search',
      ok(() => {
        const found = linkStateMembers();
        return ['READY', 'AT_PRESS', 'NONE_HOST_CARRIER', 'NONE_NOT_ISSUED'].every((m) =>
          found.includes(m)
        );
      })
    );
    assert(
      '⚠ AND THE DEPARTURE IS WRITTEN DOWN WHERE THE NEXT READER MEETS IT: ask-preview.ts says ' +
        'decision 29 asked for a member and why none was added',
      /decision 29/i.test(read(PREVIEW))
    );

    // ── The fixture ──────────────────────────────────────────────────────
    const now = new Date();
    const stamp = Date.now();
    const endDate = new Date(now.getTime() + 7 * DAY);

    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.com` } });
    createdUserIds.push(user.id);

    async function person(name: string, email: string | null) {
      const p = await prisma.person.create({ data: { name: `${TAG} ${name}`, email } });
      createdPersonIds.push(p.id);
      return p;
    }

    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Kate`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const amelia = await person('Amelia', `${TAG.toLowerCase()}-amelia+${stamp}@example.com`);
    const bob = await person('Bob', `${TAG.toLowerCase()}-bob+${stamp}@example.com`);
    const fay = await person('Fay', null); // child of a household that picked the HOST — A2

    const event = await prisma.event.create({
      data: {
        name: `${TAG} the arithmetic`,
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
    for (const p of [amelia, bob]) {
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
    await prisma.household.update({
      where: { id: hhHost.id },
      data: { contactPersonEventId: peHost.id },
    });
    // Ruling A2: household B picked the HOST, by an explicit pick and never by default.
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
    await row(bob.id, 'the beer');
    await row(fay.id, 'the fruit');

    const readPreview = (await import('../src/lib/preflight/ask-preview')).readAskPreview;
    const p = await readPreview(prisma, event.id, BASE);

    section('Layer 0b: the fixture has the shape the arithmetic needs');
    assert(
      'CONTROL: three recipients, of which exactly ONE is not messaged — without that one the ' +
        'two counts are the same number and nothing below is a test of anything',
      ok(
        () =>
          p!.recipients.length === 3 &&
          p!.recipients.filter((r) => r.linkState === 'NONE_HOST_CARRIER').length === 1
      )
    );
    assert(
      'CONTROL: the not-messaged one is the host, carrying a child under ruling A2',
      ok(() => p!.recipients.some((r) => r.hostAsCarrier && r.carried.length === 1))
    );

    // ── Layer A: the arithmetic ──────────────────────────────────────────
    section('Layer A: the count is the number of MESSAGES (founder Q1)');

    assert(
      `${COMPOSE} exports messageRows — the rows the press will actually send`,
      ok(() => typeof compose.messageRows === 'function')
    );
    const composed = ok(() => compose.composePreview(p, null))
      ? compose.composePreview(p, null)
      : null;
    assert(
      '⚠ THREE RECIPIENTS, TWO MESSAGES — the composed rows still carry everyone, because the ' +
        'host as carrier must stay visible, and the MESSAGE count is two',
      ok(() => composed.rows.length === 3 && compose.messageRows(composed.rows).length === 2)
    );
    assert(
      'every message row is one the press will message, by the shared predicate',
      ok(() =>
        compose
          .messageRows(composed.rows)
          .every((r: any) => preview.pressWillMessage(r.recipient.linkState))
      )
    );
    assert(
      `${COMPOSE} exports notMessagedRows, and it is the complement`,
      ok(() => {
        const m = compose.messageRows(composed.rows).length;
        const n = compose.notMessagedRows(composed.rows).length;
        return m + n === composed.rows.length && n === 1;
      })
    );

    // ── Layer W: the words, and the reason ───────────────────────────────
    section('Layer W: the not-messaged recipient is named, with a reason');

    assert(
      `${COMPOSE} exports a reason for every not-messaged state, typed so a missing case is a ` +
        'compile error — the `Record<LinkState, …>` guard ADULT_WHY already uses',
      ok(() => typeof compose.NOT_MESSAGED_WHY === 'object' && compose.NOT_MESSAGED_WHY !== null)
    );
    assert(
      "the host-as-carrier reason names GTC-297's gap without promising a link — LINK_NONE's " +
        'ground, "honest beats a promise that never arrives"',
      ok(() => {
        const w = compose.NOT_MESSAGED_WHY.NONE_HOST_CARRIER;
        return typeof w === 'string' && w.length > 0;
      })
    );
    assert(
      '⚠ EVERY not-messaged state has words, so a new one cannot render blank — the same rule ' +
        'the founder ruled for ADULT_WHY at slice 3, answer 4',
      ok(() =>
        ['NONE_HOST_CARRIER', 'NONE_NOT_ISSUED'].every(
          (k) => typeof compose.NOT_MESSAGED_WHY[k] === 'string' && compose.NOT_MESSAGED_WHY[k]
        )
      )
    );
    assert(
      'Gather speaks as "I" in these reasons, as it does everywhere on this screen (slice 3 ' +
        'words, answer 1) — no "we", and Gather is not named in the third person',
      ok(() =>
        Object.values(compose.NOT_MESSAGED_WHY as Record<string, string>).every(
          (w) => !/\bwe\b/i.test(w) && !/\bGather\b/.test(w)
        )
      )
    );
    /*
     * ⚠ THIS ASSERTION INVERTED WHEN THE WORDS WERE RULED, 2026-09-19. It held that they carried
     * an `ANCHOR(GTC-189)` marking them provisional; the founder ruled all three as proposed, so
     * the marker came off per the Citations rule that a provisional marker names the ticket that
     * ends it. What replaces it is stronger: the sentences themselves, verbatim, and the absence
     * of the marker — because an anchor left behind on a ruled line is the next reader's
     * invitation to re-open a settled question.
     */
    assert(
      '✅ THE TWO SENTENCES ARE RULED AND PINNED VERBATIM',
      ok(
        () =>
          compose.NOT_MESSAGED_WHY.NONE_HOST_CARRIER ===
            "Yours to pass on — I have no link to send you, so it's here rather than in a message." &&
          compose.NOT_MESSAGED_WHY.NONE_NOT_ISSUED ===
            "I can't give them a link, so I won't message them at all."
      )
    );
    assert(
      'and the provisional marker is GONE from the module — they are no longer proposed',
      read(COMPOSE).length > 0 && !read(COMPOSE).includes('ANCHOR(GTC-189)')
    );
    assert(
      "⚠ AND THE FOUNDER'S REASON FOR THE FIRST LINE IS KEPT BESIDE IT, because it is what a " +
        'later editor would undo: the sentence tells her where to look and deliberately does not ' +
        "explain why, which is this screen's register",
      read(COMPOSE).includes('without explaining why')
    );

    // ── Layer S: the page reads the module, and counts messages ──────────
    section('Layer S: the page shows the message count, not the recipient count');

    const page = stripComments(read(PAGE));
    assert(
      '⚠ THE COUNT LINE NO LONGER READS rows.length — that number is recipients, and two of ' +
        'them were not messages',
      page.length > 0 && !/\{rows\.length\}\s*\{rows\.length === 1 \? 'message'/.test(page)
    );
    assert(
      "the page uses the module's messageRows rather than filtering by hand",
      page.includes('messageRows')
    );
    assert(
      'the page names the not-messaged recipients through the module, not through its own ' +
        'linkState comparison',
      page.includes('notMessagedRows') && page.includes('NOT_MESSAGED_WHY')
    );
    assert(
      'CONTROL: the page really was read and stripped — it still contains the Send button ' +
        'placeholder, so an empty read would have failed the absences above for the wrong reason',
      page.includes('wired to nothing')
    );

    // ── Layer R: the press refuses rather than dropping ──────────────────
    section('Layer R: the press refuses a link issuance that did not happen (founder Q3)');

    assert(
      '⚠ LINKS_NOT_ISSUED EXISTS AS A REFUSAL. Slice 5a silently dropped a recipient the ' +
        'preview promised a link for and issuance did not mint — no row, no withholding, and ' +
        'nothing telling the host. Measured at 0 in gather_dev, reachable in code: `linkOf` ' +
        'answers AT_PRESS for any PARTICIPANT membership and step 4 skips one whose person is ' +
        "a team's coordinatorId",
      stripComments(read(PRESS_MODULE)).includes('LINKS_NOT_ISSUED')
    );
    assert(
      'and the press module says the mirror is why — so the next reader meets the reason, not ' +
        'just the refusal',
      read(PRESS_MODULE).includes('coordinatorIds')
    );

    const press = await import('../src/lib/press/press');

    /*
     * ⚠ AND NOW BEHAVIOURALLY, BECAUSE THE TWO ASSERTIONS ABOVE ARE STRUCTURAL AND A MUTATION
     * PROVED THEM INSUFFICIENT. Deleting the `throw` outright left the union member
     * `LINKS_NOT_ISSUED` in the type, so both source assertions stayed green and the suite
     * reported nothing — the same shape as slice 5a's fixture proving a count and never the
     * filter, and as GTC-191's Layer A(tree).
     *
     * THE FIXTURE IS THE REAL MECHANISM, not a contrived one. `linkOf` answers `AT_PRESS` for
     * any PARTICIPANT membership. `ensureEventTokens` step 4 mints only where
     * `role === 'PARTICIPANT' && !coordinatorIds.has(personId)`, and `coordinatorIds` is built
     * from every `Team.coordinatorId` unioned with every COORDINATOR membership, with NO ROLE
     * FILTER. Step 4b reaches only `role === 'COORDINATOR'`. So a PARTICIPANT membership whose
     * person is a team's `coordinatorId` is promised a link by the screen and minted none by
     * issuance — measured at 0 in `gather_dev`, and reachable, which is what this fixture shows.
     */
    const ghost = await person('Ghost', `${TAG.toLowerCase()}-ghost+${stamp}@example.com`);
    const ghostEvent = await prisma.event.create({
      data: {
        name: `${TAG} promised a link`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(ghostEvent.id);
    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: ghostEvent.id, role: 'HOST' },
    });
    await prisma.personEvent.create({
      data: { personId: ghost.id, eventId: ghostEvent.id, role: 'PARTICIPANT' },
    });
    // The team makes him a coordinatorId while his MEMBERSHIP stays PARTICIPANT — the exact
    // shape the two predicates disagree on. Two live routes write a team this way (GTC-294).
    const ghostTeam = await prisma.team.create({
      data: { name: `${TAG} Ghost`, eventId: ghostEvent.id, coordinatorId: ghost.id },
    });
    const ghostItem = await prisma.item.create({
      data: { name: `${TAG} the ghost dish`, teamId: ghostTeam.id, status: 'ASSIGNED' },
    });
    await prisma.assignment.create({
      data: { itemId: ghostItem.id, personId: ghost.id, response: 'PENDING' },
    });

    const ghostPreview = await readPreview(prisma, ghostEvent.id, BASE);
    assert(
      'CONTROL: the screen PROMISES him a link — one recipient, reading AT_PRESS. Without this ' +
        'the refusal below could not fire and the assertion would pass for the wrong reason',
      ok(
        () =>
          ghostPreview!.recipients.length === 1 &&
          ghostPreview!.recipients[0].linkState === 'AT_PRESS'
      )
    );
    const ghostPressed = await press.pressSend(prisma, {
      eventId: ghostEvent.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });
    assert(
      '⚠ AND ISSUANCE MINTS HIM NOTHING, SO THE PRESS REFUSES LINKS_NOT_ISSUED RATHER THAN ' +
        'SENDING TO NOBODY AND SAYING IT SENT. Slice 5a dropped him in silence: no row, no ' +
        'withholding, and a screen that had promised a message',
      ok(() => ghostPressed.ok === false && ghostPressed.code === 'LINKS_NOT_ISSUED')
    );
    assert(
      'and it is a 409 — the request is fine, the state is not (founder Q4). ⚠ ASSERTED AS A ' +
        'CONJUNCTION WITH THE CODE, because every state refusal is a 409 and NO_RECIPIENTS ' +
        'fires on this same event once the link check is gone — so a status alone passes off ' +
        "another refusal's answer. The third time this shape has appeared in this slice pair",
      ok(() => ghostPressed.code === 'LINKS_NOT_ISSUED' && ghostPressed.status === 409)
    );
    const ghostRows = await prisma.outboundMessage.count({ where: { eventId: ghostEvent.id } });
    const ghostEventAfter = await prisma.event.findUnique({
      where: { id: ghostEvent.id },
      select: { sentAt: true },
    });
    const ghostTokens = await prisma.accessToken.count({
      where: { eventId: ghostEvent.id, scope: 'PARTICIPANT' },
    });
    assert(
      '⚠ AND THE WHOLE TRANSACTION ROLLED BACK: no row, no sentAt, and not even the tokens ' +
        'ensureEventTokens had already minted for anyone else. A refusal that left tokens behind ' +
        'would be a partial press, which is what the transaction exists to make impossible',
      ghostRows === 0 && ghostEventAfter?.sentAt === null && ghostTokens === 0
    );

    const pressed = await press.pressSend(prisma, {
      eventId: event.id,
      actor: { id: hostPerson.id, kind: 'HOST' as const, name: hostPerson.name },
      baseUrl: BASE,
    });
    assert(
      'the press still succeeds on a healthy event',
      ok(() => pressed.ok)
    );
    const rows = await prisma.outboundMessage.count({ where: { eventId: event.id } });
    assert(
      '⚠ AND IT WROTE TWO ROWS FOR THREE RECIPIENTS — the same arithmetic the screen now ' +
        'shows, from the same predicate',
      rows === 2
    );
    const entry = await prisma.auditEntry.findFirst({
      where: { eventId: event.id, actionType: 'SEND_PRESSED' },
      select: { after: true },
    });
    assert(
      "the ledger's recipients count equals the rows written, and both equal the message count",
      ok(() => (entry!.after as any).recipients === 2)
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
