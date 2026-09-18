/**
 * GTC-294 — a coordinator holds the ASK as well as the JOB.
 *
 * THE RULING (Nigel, 2026-09-13; GTC-189 ruling E, option (a)):
 *
 *   "A coordinator who owns an item is a guest with an item and a job, and the job should
 *    not cost them the ask."
 *
 * So a `role: 'COORDINATOR'` membership holds a PARTICIPANT token BESIDE its COORDINATOR
 * one. Before this ticket `ensureEventTokens` step 4 issued a PARTICIPANT token only where
 * `pe.role === 'PARTICIPANT'` AND the person was absent from `coordinatorIds`, and the file
 * said so in its own words. A coordinator held only `/c/{token}`, which is a different page.
 *
 * ── WHAT THIS SUITE IS FOR, AND WHY IT IS NOT JUST THE HAPPY PATH ──────────────
 *
 * ⚠ THE KEY IS THE WHOLE DESIGN, AND IT IS A MEASUREMENT RATHER THAN A PREFERENCE.
 * `coordinatorIds` in step 4 is built from `Team.coordinatorId` UNIONED with
 * `role: 'COORDINATOR'` memberships, and it has NO ROLE FILTER. Measured in `gather_dev` on
 * 2026-09-18, before any code was written:
 *
 *   Henderson Family Christmas 2025 (CONFIRMING)
 *     team "Mains" -> coordinatorId = Sarah Henderson
 *     Sarah's PersonEvent.role = HOST, and she IS Event.hostId
 *
 * Keyed on `coordinatorIds`, this ticket would have minted HER a PARTICIPANT token — which
 * GTC-256 Ruling 5 forbids outright, and which neither chase finder would have caught,
 * because `findNudgeCandidates` and `findDecideByFollowupCandidates` gate on the TOKEN and
 * never read `role`. Withholding that token is the whole of Ruling 8's mechanism.
 *
 * ⚠ AND THE HOST SWEEP WOULD NOT HAVE SAVED IT. GTC-256's revocation runs at
 * `src/lib/tokens.ts` BEFORE `existingTokens` is read, which is before the creation block.
 * A token minted in the same call survives that call. The next call revokes it and the
 * creation block mints a fresh one — mint, revoke, re-mint, on every call, with her a live
 * auto-nudge and decide-by recipient in between. Not a leak that shows up as a failure.
 *
 * SO THE FIXTURE BUILDS HER DELIBERATELY, the way the route that produces her builds her:
 * `src/app/api/templates/[id]/clone/route.ts` sets `coordinatorId: hostId` on EVERY team it
 * creates and then writes the host's membership as `role: 'HOST'`, and the `CREATE_TEAM`
 * action in `src/app/api/events/[id]/conflicts/[conflictId]/execute-resolution/route.ts`
 * does the same for one team — reachable from `ResolveWithAIModal`. Her assertion below is
 * the one the founder asked for by name, and it passes in the RED run and the GREEN one.
 *
 * ── THE ITEMLESS COORDINATOR, PINNED WHILE THE BLAST RADIUS IS ZERO ───────────
 *
 * Founder ruling, 2026-09-18: issue UNCONDITIONALLY. Tokens are issued at the transition to
 * CONFIRMING and again at the press, before items settle, so conditioning on holding an item
 * would churn — and it would put a fourth key into a function that already has three.
 *
 * ⚠ THE CONSEQUENCE, ASSERTED HERE RATHER THAN DISCOVERED LATER. `findNudgeCandidates` roots
 * on `PersonEvent`, NOT on `Assignment`. It requires `sentAt`, a phone, a non-CHILD
 * `householdRole`, a chaseable mark, a pace that is not off, and a PARTICIPANT token — and it
 * requires NO ASSIGNMENT. An itemless person computes `hasResponded === false`, and leg 0
 * fires on time alone (Ruling 5 deleted the `!hasOpened` gate). So an itemless coordinator
 * with a token and a stamped `sentAt` IS a live auto-nudge recipient. Measured the same day:
 * all 16 coordinator memberships in `gather_dev` have `sentAt` NULL, so this is real in code
 * and dormant in data. That is the moment to assert it, on the founder's instruction.
 *
 * `findDecideByFollowupCandidates` roots on `Assignment`, so it does not reach her at all.
 * Both directions are asserted, because "one finder reaches her and the other does not" is
 * the kind of asymmetry that gets tidied into agreement by someone reading only one of them.
 *
 * Run: npx tsx tests/coordinator-holds-ask-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { ensureEventTokens, buildTokenUrl } from '../src/lib/tokens';
import { resolveToken } from '../src/lib/auth';
import { readAskPreview } from '../src/lib/preflight/ask-preview';
import { findNudgeCandidatesForEvent } from '../src/lib/sms/nudge-eligibility';
import { findDecideByFollowupCandidates } from '../src/lib/sms/decide-by-eligibility';

const prisma = new PrismaClient();
const TAG = 'GTC294';
const BASE_URL = 'https://gtc294.test';

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

/**
 * A condition that may dereference something the RED run does not have.
 *
 * ⚠ THE RED RUN HAS TO REPORT EVERY ASSERTION, NOT THE FIRST ONE. Before this ticket a
 * coordinator holds no PARTICIPANT token, so half the reads below are `undefined` on the
 * unfixed tree. Left bare they throw and the run stops at the first one — which turns a
 * suite that shows exactly what is missing into a stack trace. `ask-preview-test.ts` uses
 * the same wrapper for the same reason.
 */
function ok(fn: () => boolean): boolean {
  try {
    return !!fn();
  } catch {
    return false;
  }
}

/**
 * Source with comments removed, for the structural guards.
 *
 * ⚠ NOT A SUBSTRING SEARCH OVER THE RAW FILE, for the reason
 * `tests/coordinator-token-exposure-test.ts` records: a fix that names the mechanism it
 * removed in the comment explaining why it is gone false-positives on its own warning.
 * Asserted against a fixture below before it is trusted.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    const now = new Date();
    const sentAt = new Date(now.getTime() - 30 * DAY);
    /**
     * 56 hours out, and the number is derived rather than picked.
     *
     * Both finders have to be LIVE on this one event or their assertions are vacuous.
     * `SENT_AND_LIVE` wants `endDate > now`, and the decide-by clock wants the follow-up
     * window open but the deadline unpassed. With `decideByOffsetHours: 48` and no
     * `dropOffAt` (so `neededBy` collapses to `endDate`), `decideBy` lands at now + 8h and
     * the lead is `max(48 * 0.2, 12) = 12h`, so the window opened 4 hours ago. Both hold.
     */
    const endDate = new Date(now.getTime() + 56 * 60 * 60 * 1000);
    const stamp = Date.now();

    // ── Layer 0: the constraint, measured rather than assumed ─────────────
    section('Layer 0: the constraint — what the index does and does not promise');

    const idx = (await prisma.$queryRaw`
      SELECT i.indnullsnotdistinct AS nulls_not_distinct
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname = 'AccessToken_eventId_personId_scope_teamId_key'
    `) as Array<{ nulls_not_distinct: boolean }>;

    assert(
      'the unique index exists and Postgres treats its NULLs as DISTINCT — so it admits ' +
        'the two rows this ticket wants BECAUSE SCOPE DIFFERS, not because teamId does',
      idx.length === 1 && idx[0].nulls_not_distinct === false
    );
    assert(
      '⚠ AND THEREFORE IT DOES NOT PREVENT TWO PARTICIPANT ROWS (both teamId NULL) for ' +
        'one person on one event — skipDuplicates buys nothing there, so the duplicate ' +
        'guard has to be tokenExists in code. Asserted so the idempotency check below is ' +
        'read as load-bearing rather than tidy.',
      idx[0].nulls_not_distinct === false
    );

    assert(
      'CONTROL: the comment stripper used by the structural guards actually strips — ' +
        'asserted before it is trusted, because a broken stripper passes those guards',
      stripComments("/* scope: 'PARTICIPANT' */ const a = 1; // b\nconst c = 2;").includes(
        'PARTICIPANT'
      ) === false
    );

    // ── The fixture, built the way the clone route builds one ─────────────
    const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.test` } });
    createdUserIds.push(user.id);

    async function person(name: string, phone: string | null) {
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, '-')}+${stamp}@example.test`,
          phoneNumber: phone,
        },
      });
      createdPersonIds.push(p.id);
      return p;
    }

    // Sarah Henderson's shape: Event.hostId, role HOST, and a team's coordinatorId.
    const hostPerson = await prisma.person.create({
      data: {
        name: `${TAG} Host`,
        email: user.email,
        userId: user.id,
        phoneNumber: '+64210000001',
      },
    });
    createdPersonIds.push(hostPerson.id);

    const coordWithItem = await person('Coord With Item', '+64210000002');
    const coordItemless = await person('Coord Itemless', '+64210000003');
    const coordStep3b = await person('Coord No Team Row', '+64210000004');
    const guest = await person('Guest', '+64210000005');
    const promoted = await person('Promoted', '+64210000006');

    const event = await prisma.event.create({
      data: {
        name: `${TAG} coordinator ask token`,
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        // SENT_AND_LIVE: Event.sentAt not null AND endDate in the future.
        sentAt,
        decideByOffsetHours: 48,
      },
    });
    createdEventIds.push(event.id);

    // THE CLONE ROUTE'S SHAPE: coordinatorId = hostId on a team the host does not
    // coordinate in any role sense. This is the row that decides the key.
    const mains = await prisma.team.create({
      data: { name: `${TAG} Mains`, eventId: event.id, coordinatorId: hostPerson.id },
    });
    const sides = await prisma.team.create({
      data: { name: `${TAG} Sides`, eventId: event.id, coordinatorId: coordWithItem.id },
    });
    const puddings = await prisma.team.create({
      data: { name: `${TAG} Puddings`, eventId: event.id, coordinatorId: coordItemless.id },
    });
    // Step 3b's case: a COORDINATOR membership that is no team's coordinatorId.
    const drinks = await prisma.team.create({
      data: { name: `${TAG} Drinks`, eventId: event.id },
    });

    async function membership(
      personId: string,
      role: 'HOST' | 'COORDINATOR' | 'PARTICIPANT',
      teamId: string | null
    ) {
      return prisma.personEvent.create({
        data: {
          personId,
          eventId: event.id,
          role,
          teamId,
          reachabilityTier: 'DIRECT',
          contactMethod: 'SMS',
          sentAt,
        },
      });
    }

    await membership(hostPerson.id, 'HOST', mains.id);
    await membership(coordWithItem.id, 'COORDINATOR', sides.id);
    await membership(coordItemless.id, 'COORDINATOR', puddings.id);
    await membership(coordStep3b.id, 'COORDINATOR', drinks.id);
    await membership(guest.id, 'PARTICIPANT', null);
    await membership(promoted.id, 'PARTICIPANT', null);

    // A MAYBE each for the coordinator who owns something and for the guest control.
    // MAYBE serves both finders: leg 0 of the nudge ignores response state (Ruling 5),
    // and the decide-by finder requires it.
    async function maybeItem(personId: string, teamId: string, name: string) {
      const item = await prisma.item.create({
        data: { name: `${TAG} ${name}`, teamId, status: 'ASSIGNED' },
      });
      await prisma.assignment.create({
        data: { itemId: item.id, personId, response: 'MAYBE' },
      });
      return item;
    }
    await maybeItem(coordWithItem.id, sides.id, 'the ham');
    await maybeItem(guest.id, drinks.id, 'the wine');

    // ── Layer 1: issuance ─────────────────────────────────────────────────
    section('Layer 1: issuance — the job no longer costs them the ask');

    await ensureEventTokens(event.id);

    const tokensFor = async (personId: string) =>
      prisma.accessToken.findMany({
        where: { eventId: event.id, personId },
        select: { scope: true, teamId: true, token: true },
      });

    const withItem = await tokensFor(coordWithItem.id);
    assert(
      'GTC-294: a role COORDINATOR membership holds a COORDINATOR token AND a PARTICIPANT ' +
        'token — the job and the ask, both',
      withItem.some((t) => t.scope === 'COORDINATOR') &&
        withItem.some((t) => t.scope === 'PARTICIPANT')
    );
    assert(
      'and the two rows are exactly the pair the constraint admits: the ask carries no ' +
        'team, the job carries its team — so `@@unique([eventId, personId, scope, teamId])` ' +
        'needs no change and no migration',
      ok(
        () =>
          withItem.find((t) => t.scope === 'PARTICIPANT')!.teamId === null &&
          withItem.find((t) => t.scope === 'COORDINATOR')!.teamId === sides.id
      )
    );

    const itemless = await tokensFor(coordItemless.id);
    assert(
      'RULED (2026-09-18): issuance is UNCONDITIONAL — a coordinator who owns NOTHING holds ' +
        'a PARTICIPANT token too, because tokens are issued before items settle and a ' +
        'conditional token would churn',
      itemless.some((t) => t.scope === 'PARTICIPANT')
    );

    const step3b = await tokensFor(coordStep3b.id);
    assert(
      "step 3b's case is treated identically: a COORDINATOR membership that is no team's " +
        'coordinatorId holds both, because the new step keys on the ROLE and so reaches ' +
        'every row step 3b reaches',
      step3b.some((t) => t.scope === 'COORDINATOR') && step3b.some((t) => t.scope === 'PARTICIPANT')
    );

    // ⚠ THE ASSERTION THE FOUNDER ASKED FOR BY NAME. This is the whole reason the new step
    // keys on `pe.role === 'COORDINATOR'` and not on `coordinatorIds`. It passes in the RED
    // run and the GREEN one, on purpose: it is not measuring the change, it is fencing it.
    const hostTokens = await tokensFor(hostPerson.id);
    assert(
      '⚠ GTC-256 RULING 5 HOLDS, AND THIS IS THE WORKED CASE (Sarah Henderson, Henderson ' +
        "Family Christmas 2025): a HOST who is a team's coordinatorId is inside " +
        'coordinatorIds and gets NO PARTICIPANT token — the new step keys on the ROLE, so ' +
        'her role HOST row is outside it',
      hostTokens.some((t) => t.scope === 'HOST') &&
        hostTokens.some((t) => t.scope === 'COORDINATOR') &&
        !hostTokens.some((t) => t.scope === 'PARTICIPANT')
    );
    const hostRole = (
      await prisma.personEvent.findFirst({
        where: { eventId: event.id, personId: hostPerson.id },
        select: { role: true },
      })
    )?.role;
    const mainsCoordinatorId = (
      await prisma.team.findUnique({ where: { id: mains.id }, select: { coordinatorId: true } })
    )?.coordinatorId;
    assert(
      'and she is genuinely the case that matters rather than a straw fixture — she is ' +
        'Event.hostId, her membership is role HOST, and she really is the coordinatorId of ' +
        'a team, which is exactly what the template-clone route writes',
      event.hostId === hostPerson.id && hostRole === 'HOST' && mainsCoordinatorId === hostPerson.id
    );

    const guestTokens = await tokensFor(guest.id);
    assert(
      'CONTROL: an ordinary guest still holds exactly one token, PARTICIPANT with no team ' +
        '— step 4 is untouched and the issuance every guest depends on is unchanged',
      guestTokens.length === 1 &&
        guestTokens[0].scope === 'PARTICIPANT' &&
        guestTokens[0].teamId === null
    );

    // ── Layer 2: idempotency, which the index does not enforce ────────────
    section('Layer 2: idempotency — because the index will not do it for us');

    const askBefore = withItem.find((t) => t.scope === 'PARTICIPANT')?.token ?? null;
    await ensureEventTokens(event.id);
    const withItemAgain = await tokensFor(coordWithItem.id);
    const askRows = withItemAgain.filter((t) => t.scope === 'PARTICIPANT');

    assert(
      'a second call creates NO second PARTICIPANT row for the coordinator — the NULL-teamId ' +
        'duplicate the index would happily accept is refused by tokenExists instead',
      askRows.length === 1
    );
    assert(
      "and it does not rotate the value — the link already in a guest's hand still works, " +
        'which is the whole reason the promotion path stops deleting',
      ok(() => askBefore !== null && askRows[0].token === askBefore)
    );
    assert(
      'and the host STILL holds no PARTICIPANT token after a second call — proving the ' +
        'mint/revoke/re-mint churn a coordinatorIds key would have produced is absent',
      !(await tokensFor(hostPerson.id)).some((t) => t.scope === 'PARTICIPANT')
    );

    // ── Layer 3: the two sweeps this ticket must not widen ────────────────
    section('Layer 3: the two existing sweeps, unchanged');

    // GTC-256's HOST revocation, proved live rather than read off a comment.
    const strayHostAsk = await prisma.accessToken.create({
      data: {
        token: `${TAG}-stray-host-ask-${stamp}`,
        scope: 'PARTICIPANT',
        personId: hostPerson.id,
        eventId: event.id,
        teamId: null,
        expiresAt: new Date(now.getTime() + 90 * DAY),
      },
    });
    await ensureEventTokens(event.id);
    assert(
      "GTC-256's HOST revocation still fires: a PARTICIPANT token held by a role HOST row " +
        'is revoked, and this ticket did not widen it to a general PARTICIPANT prune',
      (await prisma.accessToken.count({ where: { id: strayHostAsk.id } })) === 0
    );

    // The COORDINATOR prune — acceptance assertion 4.
    const movedTeam = await prisma.team.create({
      data: { name: `${TAG} Moved`, eventId: event.id, coordinatorId: coordWithItem.id },
    });
    await ensureEventTokens(event.id);
    const jobForMoved = await prisma.accessToken.findFirst({
      where: {
        eventId: event.id,
        personId: coordWithItem.id,
        scope: 'COORDINATOR',
        teamId: movedTeam.id,
      },
    });
    await prisma.team.update({ where: { id: movedTeam.id }, data: { coordinatorId: null } });
    await ensureEventTokens(event.id);
    assert(
      'the COORDINATOR prune still revokes a token whose team moved — and it took the JOB ' +
        'only, leaving the ask standing, which is the two-scope separation working',
      !!jobForMoved &&
        (await prisma.accessToken.count({ where: { id: jobForMoved.id } })) === 0 &&
        (await tokensFor(coordWithItem.id)).some((t) => t.scope === 'PARTICIPANT')
    );

    // ── Layer 4: the ask link actually resolves ───────────────────────────
    section('Layer 4: the link — a real /p/ page, not a stand-in');

    const askToken =
      (await tokensFor(coordWithItem.id)).find((t) => t.scope === 'PARTICIPANT') ?? null;
    const resolvedAsk = askToken ? await resolveToken(askToken.token) : null;
    assert(
      "the coordinator's new token resolves as a live PARTICIPANT credential with no team — " +
        'the ask, not the job',
      resolvedAsk?.scope === 'PARTICIPANT' && !resolvedAsk?.team
    );
    assert(
      'and it builds a /p/ link rather than the /c/ one they already had',
      ok(
        () =>
          buildTokenUrl(BASE_URL, 'PARTICIPANT', askToken!.token) ===
          `${BASE_URL}/p/${askToken!.token}`
      )
    );
    const jobToken =
      (await tokensFor(coordWithItem.id)).find((t) => t.scope === 'COORDINATOR') ?? null;
    assert(
      'their COORDINATOR token is untouched and still resolves to the job with its team — ' +
        'this ticket ADDED a credential and revoked nothing',
      !!jobToken && (await resolveToken(jobToken.token))?.scope === 'COORDINATOR'
    );

    // ── Layer 5: the pre-flight preview stops saying "no link" ────────────
    section('Layer 5: the preview — READY, not NONE_COORDINATOR');

    const preview = await readAskPreview(prisma, event.id, BASE_URL);
    const rec = (name: string) =>
      preview?.recipients?.find((r: any) => r.name === `${TAG} ${name}`) as any;

    assert(
      'the preflight preview reports the coordinator who owns an item as READY, carrying ' +
        'her own token — the stand-in GTC-189 slice 3 could never replace is gone',
      ok(
        () =>
          rec('Coord With Item')?.linkState === 'READY' &&
          rec('Coord With Item')?.link === `${BASE_URL}/p/${askToken!.token}`
      )
    );
    assert(
      'and the itemless coordinator is READY too, on the unconditional ruling',
      rec('Coord Itemless')?.linkState === 'READY' &&
        typeof rec('Coord Itemless')?.link === 'string'
    );
    assert(
      'no recipient on this event reads NONE_COORDINATOR any more — the state the screen ' +
        'built an amber notice around is unreachable for a coordinator',
      (preview?.recipients ?? []).every((r: any) => r.linkState !== 'NONE_COORDINATOR')
    );

    // A coordinator whose token has not been issued yet must read AT_PRESS, not "never".
    // Way 3 of GTC-262's three: issuance is not guaranteed to have run, and this ticket
    // does not change that — so the screen has to tell the truth about it.
    const freshCoord = await person('Fresh Coord', '+64210000007');
    await membership(freshCoord.id, 'COORDINATOR', drinks.id);
    const previewBeforeIssue = await readAskPreview(prisma, event.id, BASE_URL);
    const fresh = previewBeforeIssue?.recipients?.find(
      (r: any) => r.name === `${TAG} Fresh Coord`
    ) as any;
    assert(
      'a coordinator with no token yet reads AT_PRESS — the press WILL issue her one now, ' +
        'so the honest stand-in is the one that promises a link (GTC-262 way 3: issuance ' +
        'is still not guaranteed to have run)',
      fresh?.linkState === 'AT_PRESS' && fresh?.link === null
    );

    // ── Layer 6: the chase, pinned while the blast radius is zero ─────────
    section('Layer 6: the chase — asserted, not inferred');

    await ensureEventTokens(event.id);
    const nudge = await findNudgeCandidatesForEvent(event.id, now);
    const inFirst = (personId: string) => nudge.eligibleFirst.some((c) => c.personId === personId);

    assert(
      'CONTROL: the ordinary guest is a live auto-nudge candidate, so this sweep is ' +
        'genuinely finding people rather than returning empty',
      inFirst(guest.id)
    );
    assert(
      'GTC-294: the coordinator who owns an item is NOW a live auto-nudge candidate — ' +
        'correct under the ruling (she owns an item and is chased like any other adult), ' +
        "and a behaviour change to GTC-178's shipped machinery, so it is asserted here " +
        'rather than inferred from a sentence',
      inFirst(coordWithItem.id)
    );
    assert(
      '⚠ AND SO IS THE COORDINATOR WHO OWNS NOTHING. findNudgeCandidates roots on ' +
        'PersonEvent, not on Assignment; it requires no assignment, and an itemless person ' +
        'computes hasResponded false so leg 0 fires on time alone. Pinned while the blast ' +
        'radius is zero (all 16 coordinator memberships in gather_dev have sentAt NULL), ' +
        'because the founder ruled issuance unconditional knowing this.',
      inFirst(coordItemless.id)
    );
    assert(
      '⚠ GTC-256 RULING 5, THROUGH THE DOOR THAT ACTUALLY MATTERS: the host who ' +
        'coordinates a team is in NEITHER nudge leg. The finder never reads role — the ' +
        'withheld token IS the gate — so this assertion is what Ruling 8 reduces to.',
      !inFirst(hostPerson.id) && !nudge.eligibleSecond.some((c) => c.personId === hostPerson.id)
    );
    assert(
      'and every candidate carries the PARTICIPANT token as its participantToken, never a ' +
        'coordinator one — the finder filters scope in SQL, so two tokens per person does ' +
        'not make it pick the wrong row',
      nudge.eligibleFirst
        .filter((c) => c.eventId === event.id)
        .every((c) => c.participantToken !== undefined && !c.participantToken.startsWith(`${TAG}-`))
    );

    const decideBy = await findDecideByFollowupCandidates(now);
    const dbFor = (personId: string) =>
      decideBy.eligible.filter((c) => c.eventId === event.id && c.personId === personId);

    assert(
      'CONTROL: the guest with a MAYBE is a live decide-by candidate on this event',
      dbFor(guest.id).length === 1
    );
    assert(
      'GTC-294: so is the coordinator with a MAYBE — she now holds the PARTICIPANT token ' +
        'the finder gates on, and her message carries it',
      ok(
        () =>
          dbFor(coordWithItem.id).length === 1 &&
          dbFor(coordWithItem.id)[0].participantToken === askToken!.token
      )
    );
    assert(
      'and the ITEMLESS coordinator is absent from the decide-by finder although she holds ' +
        'the same token — it roots on Assignment, so the two finders deliberately DISAGREE ' +
        'about her and neither is wrong',
      dbFor(coordItemless.id).length === 0
    );
    assert(
      'GTC-256 Ruling 5 here too: the host who coordinates a team is not a decide-by ' +
        'candidate on this event',
      dbFor(hostPerson.id).length === 0
    );

    // ── Layer 7: promotion keeps the link already sent ────────────────────
    section('Layer 7: promotion and demotion');

    const promotedAskBefore =
      (await tokensFor(promoted.id)).find((t) => t.scope === 'PARTICIPANT') ?? null;
    assert(
      'PRECONDITION: the person about to be promoted holds a PARTICIPANT token as an ' +
        'ordinary guest, so what follows measures survival rather than absence',
      !!promotedAskBefore
    );

    /**
     * ⚠ THE ROLE WRITE IS MADE DIRECTLY, AND WHAT THAT DOES AND DOES NOT PROVE IS STATED
     * HERE RATHER THAN LEFT TO THE LABELS.
     *
     * `PATCH /api/events/[id]/people/[personId]` is session-guarded by `requireEventRole`
     * and cannot be driven in-process under `tsx`. What it does on promotion is three
     * things: write the role, `deleteMany` the PARTICIPANT token, and call
     * `ensureEventTokens`. This block reproduces the first and third.
     *
     * SO THE TWO ASSERTIONS BELOW PASS IN THE RED RUN TOO, and they are not measuring this
     * ticket — `ensureEventTokens` never revoked a coordinator's ask, and GTC-256's comment
     * says so ("nothing revoked one already issued, because the cleanup above prunes
     * COORDINATOR tokens and nothing else"). What they fence is that the new step did not
     * ACQUIRE a revocation on the way in. The deleted `deleteMany` is proved gone
     * structurally in layer 8, and the harm it did is demonstrated directly below.
     */
    await prisma.personEvent.update({
      where: { personId_eventId: { personId: promoted.id, eventId: event.id } },
      data: { role: 'COORDINATOR', teamId: drinks.id },
    });
    await ensureEventTokens(event.id);
    const promotedAfter = await tokensFor(promoted.id);

    assert(
      'a role change to COORDINATOR leaves the ask standing — she holds both scopes ' +
        'afterwards, and the new step revokes nothing on its way in (passes in RED too: ' +
        'ensureEventTokens never revoked this, only declined to issue it)',
      promotedAfter.some((t) => t.scope === 'PARTICIPANT') &&
        promotedAfter.some((t) => t.scope === 'COORDINATOR')
    );
    assert(
      'and the value is unchanged across the role write, so nothing in issuance rotates a ' +
        "link that is already in a guest's hand",
      ok(
        () =>
          promotedAfter.find((t) => t.scope === 'PARTICIPANT')!.token === promotedAskBefore!.token
      )
    );

    /**
     * ⚠ THE ROTATION, DEMONSTRATED RATHER THAN ARGUED — this is why the route's delete had
     * to go rather than merely being unnecessary.
     *
     * The removed branch ran `deleteMany` on the PARTICIPANT token and then
     * `ensureEventTokens` one line later. Post-fix that pairing no longer exists in the
     * route, so it is performed here by hand to show what it did: the guest ends up with a
     * DIFFERENT token value, and every link already sent to her is dead. Left in, that
     * happened on every role or team write touching a coordinator.
     */
    const beforeRotation = (await tokensFor(promoted.id)).find(
      (t) => t.scope === 'PARTICIPANT'
    )?.token;
    await prisma.accessToken.deleteMany({
      where: { eventId: event.id, personId: promoted.id, scope: 'PARTICIPANT' },
    });
    await ensureEventTokens(event.id);
    const afterRotation = (await tokensFor(promoted.id)).find(
      (t) => t.scope === 'PARTICIPANT'
    )?.token;
    assert(
      '⚠ DEMONSTRATION, and the reason for the deletion: delete the ask and re-issue, ' +
        'exactly as the promotion branch did, and she gets a NEW token value — a link ' +
        'already in her hand stops working. That is the one thing this ticket could have ' +
        'broken for a guest. (RED cannot even reach it: on the unfixed tree the re-issue ' +
        'declines to mint her one at all, which is the same defect wearing the other face.)',
      !!beforeRotation && !!afterRotation && beforeRotation !== afterRotation
    );

    // Demotion, as the route performs it: write the role, delete the COORDINATOR token
    // (its branch is untouched by this ticket), then re-issue.
    await prisma.personEvent.update({
      where: { personId_eventId: { personId: promoted.id, eventId: event.id } },
      data: { role: 'PARTICIPANT', teamId: null },
    });
    await prisma.accessToken.deleteMany({
      where: { eventId: event.id, personId: promoted.id, scope: 'COORDINATOR' },
    });
    await ensureEventTokens(event.id);
    const demoted = await tokensFor(promoted.id);
    assert(
      'demotion needs no edit and gets none: the COORDINATOR token goes, the ask stays, ' +
        'and the ask value survives that too',
      ok(
        () =>
          demoted.length === 1 &&
          demoted[0].scope === 'PARTICIPANT' &&
          demoted[0].token === afterRotation
      )
    );

    // ── Layer 8: structural — the old rule is gone, not merely unreached ──
    section('Layer 8: structural guards');

    const tokensSrc = fs.readFileSync('src/lib/tokens.ts', 'utf8');
    assert(
      'the note stating the old rule is GONE from src/lib/tokens.ts — it said ' +
        '"Coordinators do NOT receive PARTICIPANT tokens" in two places, and a file that ' +
        'contradicts its own behaviour is how the next reader gets it wrong',
      !/Coordinators do NOT receive PARTICIPANT tokens/i.test(tokensSrc)
    );

    const peopleRouteSrc = stripComments(
      fs.readFileSync('src/app/api/events/[id]/people/[personId]/route.ts', 'utf8')
    );
    assert(
      "the promotion path no longer deletes PARTICIPANT tokens — no `scope: 'PARTICIPANT'` " +
        'survives in that handler outside a comment, so the rotation cannot come back by ' +
        'one edit to a branch that still exists',
      !/scope:\s*'PARTICIPANT'/.test(peopleRouteSrc)
    );
    assert(
      'CONTROL: the COORDINATOR deletes in that same handler ARE still there — the guard ' +
        'above is specific to the ask and has not simply stopped matching',
      /scope:\s*'COORDINATOR'/.test(peopleRouteSrc)
    );

    /*
     * ⚠ STRIPPED, AND IT CAUGHT ITSELF ON THE FIRST GREEN RUN. `ask-preview.ts` keeps the
     * superseded rule in its header — "until GTC-294 a coordinator was reported
     * NONE_COORDINATOR" — so the raw file still contains the literal and a raw search fails
     * this assertion against a correct tree. Exactly the false-positive
     * `tests/coordinator-token-exposure-test.ts` records for its own structural guards: a fix
     * that names the mechanism it removed trips a search for that mechanism. Recorded rather
     * than silently corrected, because the next person to add a guard here will hit it too.
     */
    const askPreviewSrc = stripComments(
      fs.readFileSync('src/lib/preflight/ask-preview.ts', 'utf8')
    );
    assert(
      'and the mirror of the rule outside tokens.ts moved with it: ask-preview.ts no longer ' +
        'reports NONE_COORDINATOR in any code path, so the preview cannot keep telling the ' +
        'host a coordinator gets no link',
      !/NONE_COORDINATOR/.test(askPreviewSrc)
    );
    assert(
      "and it no longer restates step 4's coordinatorIds either — the mirror keys on the " +
        'membership role, so it cannot report a host-coordinator AT_PRESS',
      !/coordinatorIds/.test(askPreviewSrc)
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
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
