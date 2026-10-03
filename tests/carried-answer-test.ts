/**
 * GTC-191 (a) and (b) — a carrier answers on a child's behalf, and is still asked about
 * herself.
 *
 * THE TWO RULINGS THIS HOLDS
 *
 *   [[GTC-189]] ruling D item 3 — "the press must not send a link to a page that cannot
 *   answer what the message asks." A contact carrying a child's ask is sent a message that
 *   names the child's item and asks her to answer on their behalf; the page her link opens
 *   showed her own rows and not the child's.
 *
 *   [[GTC-189]] ruling AA — "YES, ask her whether she can make it too. Same as anyone else."
 *   A carrier holding nothing of her own is still a guest, and still gets the attendance
 *   question the itemless case gives everybody else.
 *
 * ── THE TRAP THIS SUITE EXISTS TO HOLD ────────────────────────────────────────
 *
 * `isAttendanceAskable` and `deriveAttendance` in `src/lib/attendance.ts` each take ONE flat
 * array of responses. Merging the child's rows into the carrier's — the obvious way to "show
 * both" — breaks ruling AA with the change meant to serve it:
 *
 *   - a carrier holding nothing of her own stops being itemless, so her attendance beat
 *     disappears: a child's PENDING or MAYBE row makes `isAttendanceAskable` false;
 *   - a child's ACCEPTED row makes `deriveAttendance` answer YES for HER, so the host's
 *     headcount counts a guest who has answered nothing.
 *
 * ⚠ AND THE SECOND HALF IS NOT HYPOTHETICAL. Layer A pins **Amelia Turner** on the
 * "GTC-192 glance — mixed" board in the live database: her own two rows are MAYBE, the child
 * she carries holds an ACCEPTED row, and merged she reads YES. One case checked against the
 * tree, two built as fixtures beside it — the founder's instruction, 2026-09-18.
 *
 * The same trap has a third face, and it is why the child's-no ruling is held by the
 * separation rather than by a screen convention: `isAttendanceAskable` is TRUE the moment the
 * carrier declines the child's only row, because all-declined is one of its two true cases. A
 * child's array driving a beat would produce a "still coming?" question about a child — a
 * question the model asks nowhere. The child's rows drive no beat and no derivation.
 *
 * ── THE AUTHORISATION, AND WHY IT IS THE CHOOSER AND NOT A HOUSEHOLD LOOKUP ───
 *
 * ⚠ DO-NOT-TOUCH ZONE 3. This is a PARTICIPANT token authorising a write to another person's
 * `Assignment`. Founder sign-off, 2026-09-18, for these five things and nothing else: the
 * three route changes, the separated GET field, the audit line naming both people, the 403,
 * and this fence. No issuance, no scope, no schema.
 *
 * The write is admitted only where `chooseAskRoute` in
 * `src/lib/eligibility/channel-chooser.ts` — the same function that decided to put the
 * child's ask in her message — answers `CARRIED` with her membership as the recipient. A
 * household lookup would be a second reading of ruling A2, which is the drift
 * `ask-preview.ts` records GTC-294 catching in the preview.
 *
 * Layer F walks all five refusals the chooser closes by construction, from one real token.
 *
 * ── THE FIXTURE ───────────────────────────────────────────────────────────────
 *
 *   household A  Amelia (2 own rows, both MAYBE) carries James (ACCEPTED)  -> the Amelia shape
 *   household B  Bea    (nothing of her own)     carries Ben   (PENDING)   -> ruling AA
 *   household C  Cara   (nothing of her own)     carries Cody  (ACCEPTED)  -> ruling AA
 *   household D  MUTED. Dana carries Dee (PENDING)                         -> refused
 *   host's own   the host carries Hugo                                     -> refused
 *   Adam         an adult with an item, no household                       -> never carried
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 * Requires the dev server on :3000 — `GET /api/p/[token]` calls `getUser`, which needs a
 * request scope, so the routes are exercised over HTTP rather than as imported handlers.
 *
 * Run: npx tsx tests/carried-answer-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { ensureEventTokens } from '../src/lib/tokens';
import { deriveAttendance, isAttendanceAskable } from '../src/lib/attendance';
import { readAskPreview } from '../src/lib/preflight/ask-preview';

const prisma = new PrismaClient();
const TAG = 'GTC191';
const BASE = 'http://localhost:3000';

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

/** Source with comments removed — a fix that names what it removed false-positives a raw
 *  search, as `tests/coordinator-token-exposure-test.ts` records. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

async function http(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* some responses have no body */
  }
  return { status: res.status, json };
}

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ── Layer 0: controls ────────────────────────────────────────────────
    section('Layer 0: controls — the harness and the server, before anything is trusted');

    const health = await http('/api/events');
    assert(
      'CONTROL: the dev server is up on :3000 and answers 401 with no cookie — the routes ' +
        'below are exercised over HTTP because GET /api/p/[token] calls getUser',
      health.status === 401
    );
    assert(
      'CONTROL: the comment stripper strips — asserted before the structural guards trust it',
      stripComments('/* carried */ const a = 1; // b\nconst c = 2;').includes('carried') === false
    );

    // ── Layer A(tree): Amelia Turner, in the live database ───────────────
    section('Layer A(tree): Amelia Turner — the trap with a live instance');

    const ameliaPE = await prisma.personEvent.findFirst({
      where: { person: { name: 'Amelia Turner' }, event: { name: 'GTC-192 glance — mixed' } },
      select: { id: true, personId: true, eventId: true, attendanceAnswer: true },
    });
    assert(
      'the tree-checked case is present: Amelia Turner on "GTC-192 glance — mixed". ⚠ A ' +
        'FAILURE HERE MEANS THE BOARD IS GONE, NOT THAT THE CODE IS WRONG — the founder ' +
        'asked for one case checked against the tree, and a silent skip is how it becomes ' +
        'vacuous',
      ameliaPE !== null
    );

    if (ameliaPE) {
      const preview = await readAskPreview(prisma, ameliaPE.eventId, 'https://gtc191.test');
      const her = preview?.recipients.find((r) => r.personEventId === ameliaPE.id);
      const herRows = await prisma.assignment.findMany({
        where: { personId: ameliaPE.personId, item: { team: { eventId: ameliaPE.eventId } } },
        select: { response: true },
      });
      const carriedPEs = (her?.carried ?? []).map((c) => c.personEventId);
      const carriedPersonIds = (
        await prisma.personEvent.findMany({
          where: { id: { in: carriedPEs } },
          select: { personId: true },
        })
      ).map((p) => p.personId);
      const kidRows = await prisma.assignment.findMany({
        where: {
          personId: { in: carriedPersonIds },
          item: { team: { eventId: ameliaPE.eventId } },
        },
        select: { response: true },
      });

      assert(
        'she carries a child, holds rows of her own, and the child holds an ACCEPTED row — ' +
          'the shape the assertion needs, read rather than assumed',
        ok(
          () =>
            carriedPersonIds.length > 0 &&
            herRows.length > 0 &&
            kidRows.some((r) => r.response === 'ACCEPTED')
        )
      );
      assert(
        'SEPARATE: her attendance derives from HER rows alone and is not YES — she has ' +
          'answered nothing',
        ok(() => deriveAttendance(herRows, ameliaPE.attendanceAnswer) !== 'YES')
      );
      assert(
        "⚠ MERGED: the same derivation over her rows PLUS the child's answers YES — the " +
          "host's headcount would count a guest who answered nothing, off a child's " +
          'acceptance. This is what the separated payload prevents',
        ok(() => deriveAttendance([...herRows, ...kidRows], ameliaPE.attendanceAnswer) === 'YES')
      );
    }

    // ── The fixture ──────────────────────────────────────────────────────
    const now = new Date();
    const stamp = Date.now();
    const endDate = new Date(now.getTime() + 7 * DAY);

    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.test` } });
    createdUserIds.push(user.id);

    async function person(name: string) {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${slug}+${stamp}@example.test`,
        },
      });
      createdPersonIds.push(p.id);
      return p;
    }

    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Kate`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const amelia = await person('Amelia');
    const james = await person('James');
    const bea = await person('Bea');
    const ben = await person('Ben');
    const cara = await person('Cara');
    const cody = await person('Cody');
    const dana = await person('Dana');
    const dee = await person('Dee');
    const hugo = await person('Hugo');
    const adam = await person('Adam');

    const event = await prisma.event.create({
      data: {
        name: `${TAG} carried answer`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt: new Date(now.getTime() - DAY),
      },
    });
    createdEventIds.push(event.id);

    const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });

    async function household(muted: boolean | null) {
      return prisma.household.create({ data: { eventId: event.id, messagesMuted: muted } });
    }
    const hhHost = await household(null);
    const hhA = await household(null);
    const hhB = await household(null);
    const hhC = await household(null);
    const hhD = await household(true);

    async function membership(
      personId: string,
      role: 'HOST' | 'PARTICIPANT',
      householdId: string | null,
      householdRole: 'PRIMARY_CONTACT' | 'CHILD' | null
    ) {
      return prisma.personEvent.create({
        data: { personId, eventId: event.id, role, householdId, householdRole },
      });
    }

    const peHost = await membership(hostPerson.id, 'HOST', hhHost.id, 'PRIMARY_CONTACT');
    const peHugo = await membership(hugo.id, 'PARTICIPANT', hhHost.id, 'CHILD');
    const peAmelia = await membership(amelia.id, 'PARTICIPANT', hhA.id, 'PRIMARY_CONTACT');
    const peJames = await membership(james.id, 'PARTICIPANT', hhA.id, 'CHILD');
    const peBea = await membership(bea.id, 'PARTICIPANT', hhB.id, 'PRIMARY_CONTACT');
    const peBen = await membership(ben.id, 'PARTICIPANT', hhB.id, 'CHILD');
    const peCara = await membership(cara.id, 'PARTICIPANT', hhC.id, 'PRIMARY_CONTACT');
    const peCody = await membership(cody.id, 'PARTICIPANT', hhC.id, 'CHILD');
    const peDana = await membership(dana.id, 'PARTICIPANT', hhD.id, 'PRIMARY_CONTACT');
    const peDee = await membership(dee.id, 'PARTICIPANT', hhD.id, 'CHILD');
    await membership(adam.id, 'PARTICIPANT', null, null);

    for (const [hh, contact] of [
      [hhHost, peHost],
      [hhA, peAmelia],
      [hhB, peBea],
      [hhC, peCara],
      [hhD, peDana],
    ] as const) {
      await prisma.household.update({
        where: { id: hh.id },
        data: { contactPersonEventId: contact.id },
      });
    }

    async function row(personId: string, name: string, response: 'PENDING' | 'ACCEPTED' | 'MAYBE') {
      const item = await prisma.item.create({
        data: { name: `${TAG} ${name}`, teamId: team.id, status: 'ASSIGNED' },
      });
      const a = await prisma.assignment.create({
        data: { itemId: item.id, personId, response },
      });
      return a;
    }

    const aPavlova = await row(amelia.id, 'the pavlova', 'MAYBE');
    await row(amelia.id, 'the trifle', 'MAYBE');
    const jCrackers = await row(james.id, 'the crackers', 'ACCEPTED');
    const bBuns = await row(ben.id, 'the buns', 'PENDING');
    const cCake = await row(cody.id, 'the cake', 'ACCEPTED');
    const dDip = await row(dee.id, 'the dip', 'PENDING');
    const hRolls = await row(hugo.id, 'the rolls', 'PENDING');
    const adAle = await row(adam.id, 'the ale', 'PENDING');

    await ensureEventTokens(event.id);
    const tokenOf = async (personId: string) =>
      (
        await prisma.accessToken.findFirst({
          where: { eventId: event.id, personId, scope: 'PARTICIPANT' },
          select: { token: true },
        })
      )?.token ?? null;

    const ameliaToken = await tokenOf(amelia.id);
    const beaToken = await tokenOf(bea.id);
    const caraToken = await tokenOf(cara.id);

    section('Layer 0b: the fixture routes the way the assertions need');

    const preview = await readAskPreview(prisma, event.id, 'https://gtc191.test');
    const carriedOf = (peId: string) =>
      preview?.recipients.find((r) => r.personEventId === peId)?.carried.map((c) => c.name) ?? [];

    assert(
      'Amelia is a recipient and her message carries James — the chooser says so, which is ' +
        'what the route is about to be asked to agree with',
      ok(() => carriedOf(peAmelia.id).some((n) => n.includes('James')))
    );
    assert(
      "Bea carries Ben and holds nothing of her own — ruling AA's case",
      ok(
        () =>
          carriedOf(peBea.id).some((n) => n.includes('Ben')) &&
          (preview?.recipients.find((r) => r.personEventId === peBea.id)?.itemNames.length ?? 1) ===
            0
      )
    );
    assert(
      'Cara carries Cody, who has already ACCEPTED — the merged-YES case, as a fixture',
      ok(() => carriedOf(peCara.id).some((n) => n.includes('Cody')))
    );
    assert(
      'Dana carries nobody — her household is muted, so the chooser closes the route and ' +
        "Dee is a line on the host's list instead",
      ok(() => carriedOf(peDana.id).length === 0)
    );
    assert(
      "the host carries nobody through this path — Hugo is her own household's child, " +
        'refused HOST_HOUSEHOLD_CHILD before the contact is even resolved (ruling A)',
      ok(() => carriedOf(peHost.id).length === 0)
    );
    assert('Amelia holds a PARTICIPANT token', ameliaToken !== null);

    // ── Layer B: the GET payload ─────────────────────────────────────────
    section("Layer B: the GET payload — the child's rows in their own field, never merged");

    const ameliaGet = await http(`/api/p/${ameliaToken}`);
    assert('GET /api/p/[token] answers 200 for the carrier', ameliaGet.status === 200);
    assert(
      'her own `assignments` still holds exactly her own two rows — the field the page and ' +
        'every existing reader already use is unchanged',
      ok(() => ameliaGet.json.assignments.length === 2)
    );
    assert(
      'and no child row has leaked into it',
      ok(() => !ameliaGet.json.assignments.some((a: any) => a.item.name.includes('the crackers')))
    );
    assert(
      '⚠ THE SEPARATED FIELD: a `carried` array, one entry per child, each carrying that ' +
        "child's name and their own rows",
      ok(
        () =>
          Array.isArray(ameliaGet.json.carried) &&
          ameliaGet.json.carried.length === 1 &&
          ameliaGet.json.carried[0].name.includes('James')
      )
    );
    assert(
      'the child\'s rows carry the same item detail her own do — the message says "the ' +
        'details are on the page", so the page must have them',
      ok(() => {
        const r = ameliaGet.json.carried[0].assignments[0];
        return r.id === jCrackers.id && r.response === 'ACCEPTED' && 'dropOffAt' in r.item;
      })
    );
    assert(
      'and the child is named for the page to speak about: name and firstName both',
      ok(() => typeof ameliaGet.json.carried[0].firstName === 'string')
    );
    assert(
      "the host's first name is on the payload — word 1, ruled 2026-09-18: the page carries " +
        'the attribution, not the line',
      ok(() => typeof ameliaGet.json.event.hostFirstName === 'string')
    );

    // ── Layer A(fixture): the two cases beside her ───────────────────────
    section('Layer A(fixture): ruling AA survives the carried rows arriving');

    const beaGet = await http(`/api/p/${beaToken}`);
    assert(
      '⚠ BEA holds nothing of her own and carries a PENDING child row, and her attendance ' +
        "beat is STILL offered — `attendanceAskable` true. Merged, the child's PENDING row " +
        'would make it false and ruling AA would be undone by the change meant to serve it',
      ok(() => beaGet.json.attendanceAskable === true)
    );
    assert(
      'and she is carrying that child on the same payload — the beat and the carried ask ' +
        'coexist, which is the "two decisions on one page" ruling AA asks for',
      ok(() => beaGet.json.carried.length === 1 && beaGet.json.assignments.length === 0)
    );

    const caraGet = await http(`/api/p/${caraToken}`);
    assert(
      '⚠ CARA holds nothing of her own and carries a child who has ACCEPTED, and her own ' +
        "attendance does NOT read YES — a child's acceptance is not her answer",
      ok(() => caraGet.json.attendance !== 'YES')
    );
    assert(
      'and her attendance beat is still offered too',
      ok(() => caraGet.json.attendanceAskable === true)
    );

    // ── Layer F: the five-way fence ──────────────────────────────────────
    section('Layer F: the fence — one token, five refusals the chooser closes');

    const ack = (token: string | null, assignmentId: string, response: string) =>
      http(`/api/p/${token}/ack/${assignmentId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response }),
      });

    const own = await ack(ameliaToken, aPavlova.id, 'ACCEPTED');
    assert('CONTROL: she can still answer her OWN row', own.status === 200);

    const carried = await ack(ameliaToken, jCrackers.id, 'MAYBE');
    assert(
      '1. SHE CAN ANSWER THE CHILD SHE CARRIES — ruling D item 3, the whole point',
      carried.status === 200
    );

    const adult = await ack(ameliaToken, adAle.id, 'ACCEPTED');
    assert(
      "2. an ADULT's row is refused 403 — `resolveCarrier` only runs for a non-messageable " +
        'householdRole, so no token can ever answer an adult',
      adult.status === 403
    );

    const otherChild = await ack(ameliaToken, bBuns.id, 'ACCEPTED');
    assert(
      '3. a child of a household that did not pick her is refused 403',
      otherChild.status === 403
    );

    const mutedChild = await ack(ameliaToken, dDip.id, 'ACCEPTED');
    assert(
      '4. a child of a MUTED household is refused 403 — a closed carrier route closes the ' +
        'answer with it',
      mutedChild.status === 403
    );

    const hostChild = await ack(ameliaToken, hRolls.id, 'ACCEPTED');
    assert(
      "5. a child of the HOST'S OWN household is refused 403 — ruling A: hers to handle",
      hostChild.status === 403
    );

    const nobody = await ack(ameliaToken, 'cl00000000000000000000000', 'ACCEPTED');
    assert(
      'and the 404 survives for a row that is nobody\'s — 403 means "not yours to answer", ' +
        '404 means "no such row", and collapsing them loses the distinction',
      nobody.status === 404
    );

    // ── Layer W: what the write actually did ─────────────────────────────
    section("Layer W: the write — the child's row moved, and nothing else did");

    const jamesRow = await prisma.assignment.findUnique({
      where: { id: jCrackers.id },
      select: { response: true, personId: true },
    });
    assert(
      "the child's Assignment.response moved to MAYBE and it is still the CHILD's row — " +
        'the write does not reassign anything',
      ok(() => jamesRow!.response === 'MAYBE' && jamesRow!.personId === james.id)
    );

    const jamesPE = await prisma.personEvent.findUnique({
      where: { id: peJames.id },
      select: { attendanceAnswer: true, attendanceAnsweredAt: true },
    });
    assert(
      "⚠ and the child's PersonEvent.attendanceAnswer is UNTOUCHED — a child's attendance is " +
        'asked nowhere in the model, and the carried write reaches Assignment.response and ' +
        "nothing else. Ruled 2026-09-18: a child's no raises no question",
      ok(() => jamesPE!.attendanceAnswer === null && jamesPE!.attendanceAnsweredAt === null)
    );

    const audit = await prisma.auditEntry.findMany({
      where: { eventId: event.id, targetId: jCrackers.id },
      select: { actorId: true, actionType: true, details: true },
    });
    assert(
      "the audit line names BOTH people: the carrier is the actor, the child's Assignment " +
        'is the target',
      ok(() => audit.some((a) => a.actorId === amelia.id))
    );
    assert(
      "and the details say on whose behalf — an audit line reading only 'Maybe on assignment " +
        "for item X' cannot tell a carried answer from her own",
      ok(() => audit.some((a) => (a.details ?? '').includes('James')))
    );

    const ameliaPEAfter = await prisma.personEvent.findUnique({
      where: { id: peAmelia.id },
      select: { attendanceAnswer: true },
    });
    assert(
      'and HER attendanceAnswer is untouched by a carried write as well',
      ok(() => ameliaPEAfter!.attendanceAnswer === null)
    );

    // ── Layer P: the page ────────────────────────────────────────────────
    section('Layer P: the page — two sections, and the attribution swap');

    const pageSrc = stripComments(fs.readFileSync('src/app/p/[token]/page.tsx', 'utf8'));
    assert(
      'the page reads the separated `carried` field',
      /\.carried/.test(pageSrc) || /carried:/.test(pageSrc)
    );
    assert(
      "⚠ and it never concatenates the child's rows into her own — the one change that " +
        'would undo ruling AA and move the headcount',
      !/assignments[^\n]*\.concat\(/.test(pageSrc) &&
        !/\[\s*\.\.\.\s*data\.assignments\s*,\s*\.\.\./.test(pageSrc)
    );
    assert(
      'word 1, ruled: "Participant: <name>" is gone — the host\'s dashboard language pointed ' +
        'at a guest',
      !/Participant:/.test(pageSrc)
    );
    assert(
      'and the attribution is there in its place — the page says whose ask this is without ' +
        'repeating a line she has already read',
      /hostFirstName/.test(pageSrc)
    );

    const routeSrc = stripComments(fs.readFileSync('src/app/api/p/[token]/route.ts', 'utf8'));
    assert(
      "the GET derives attendance from the holder's own assignments only — the merge trap " +
        'is closed in the route as well as on the page',
      /deriveAttendance\(assignments,/.test(routeSrc)
    );
    const ackSrc = stripComments(
      fs.readFileSync('src/app/api/p/[token]/ack/[assignmentId]/route.ts', 'utf8')
    );
    assert(
      'the ack route authorises the carried write through the chooser, not through a ' +
        'household lookup — one predicate, two callers',
      /resolveCarriedSubjects/.test(ackSrc)
    );
    assert('and it does not reach into Household directly', !/household/i.test(ackSrc));

    // ── Layer X: one predicate ───────────────────────────────────────────
    section('Layer X: the resolver and the preview agree, on every recipient of this event');

    // Loaded inside a try, so a missing module reads as a failed assertion rather than a
    // crashed run — `ask-preview-test.ts`'s rule, and the reason the RED run below reports
    // every layer instead of stopping here.
    const agree: boolean[] = [];
    try {
      const mod = await import('../src/lib/eligibility/carried-answer');
      for (const r of preview?.recipients ?? []) {
        const pe = await prisma.personEvent.findUnique({
          where: { id: r.personEventId },
          select: { personId: true },
        });
        const subjects = await mod.resolveCarriedSubjects(prisma, event.id, pe!.personId);
        const fromResolver = subjects.map((s) => s.personEventId).sort();
        const fromPreview = r.carried.map((c) => c.personEventId).sort();
        agree.push(JSON.stringify(fromResolver) === JSON.stringify(fromPreview));
      }
    } catch {
      agree.push(false);
    }
    assert(
      "⚠ the route's resolver and the pre-flight preview name the SAME carried children for " +
        'every recipient. Two constructions of the chooser context exist — this one and ' +
        "`readAskPreview`'s — because slice 5 owns that module next and must not be edited " +
        'from under it. This assertion is what stops them drifting',
      agree.length > 0 && agree.every(Boolean)
    );
  } finally {
    for (const eventId of createdEventIds) {
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
