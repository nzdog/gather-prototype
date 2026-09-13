/**
 * GTC-256 (phase 3, commit 2) — Ruling 5, the never-messaged concept, as one named thing.
 *
 * "The host never receives her OWN ask. No invitation, no auto-nudge, no proxy nudge, no
 * decide-by follow-up, no wrap-up thank-you. Her name is not claimable through the shared
 * link."
 *
 * WHAT THE RE-VERIFICATION CHANGED, because this file's shape follows it. The ticket's
 * phase-3 list named four sites. Measured against the tree on 2026-08-29, two of them were
 * already closed and three unlisted ones were live:
 *
 *   NOT A SITE  decide-by-eligibility.ts — it requires a PARTICIPANT token, and has since
 *               GTC-175 (59a4afb). The ticket's "no token, no role check" was never true.
 *               Closed by construction (Ruling 8), exactly like nudge-eligibility.ts, with
 *               exactly the same stale-token caveat — which is what the revocation below
 *               exists to remove.
 *   NOT A SITE  proxy-nudge-eligibility.ts — covered by phase 2's own Ruling 6 switch.
 *               What IS wrong there is the COUNT, not the exclusion: see checkInCount.
 *   NEW         PATCH /people/[personId] had no host guard on `role`, so one call minted
 *               her a PARTICIPANT token — and ensureEventTokens never revoked it, because
 *               its prune handled COORDINATOR only. Both finders went live and stayed live.
 *   NEW         resolveManualNudgeRecipient had no host check at all.
 *   NEW         invite-status promised reminders to a person the sweep will never send to.
 *
 * The directory exposure — the fifth new site, and the severe one — lands in its own
 * commit with tests/host-directory-exposure-test.ts.
 *
 * Run: npx tsx tests/host-never-messaged-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { createHostHousehold } from '../src/lib/households/hostHousehold';
import { ensureEventTokens } from '../src/lib/tokens';
import { resolveManualNudgeRecipient } from '../src/lib/sms/manual-nudge-recipient';
import { findNudgeCandidatesForEvent } from '../src/lib/sms/nudge-eligibility';
import { findDecideByFollowupCandidates } from '../src/lib/sms/decide-by-eligibility';
import { findProxyNudgeCandidatesForEvent } from '../src/lib/sms/proxy-nudge-eligibility';
import { isAddressable, HOST_SKIP_REASON } from '../src/lib/eligibility/host-exclusion';
import { POST as claimPOST } from '../src/app/api/join/[token]/claim/route';

const prisma = new PrismaClient();

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

/**
 * The claim endpoint is UNAUTHENTICATED, so the handler can be driven directly. It reads
 * only `request.json()` before the branch under test, and `headers()` sits past it on the
 * success path — so a stub request is the whole of the input.
 */
async function claim(token: string, personId: string) {
  const res = await claimPOST({ json: async () => ({ personId }) } as any, {
    params: Promise.resolve({ token }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    const stamp = Date.now();
    const user = await prisma.user.create({ data: { email: `gtc256-nm+${stamp}@example.com` } });
    createdUserIds.push(user.id);

    const hostPerson = await prisma.person.create({
      data: {
        name: 'Kate Whittaker',
        email: user.email,
        phoneNumber: '+64211234567',
        userId: user.id,
      },
    });
    createdPersonIds.push(hostPerson.id);

    // Sent 10 days ago so both nudge legs are past due, ending soon enough that the
    // decide-by follow-up window is open (decideBy = endDate - 120h, lead 24h). Both
    // clocks matter: a fixture outside either window would pass for the wrong reason.
    const sentAt = new Date();
    sentAt.setDate(sentAt.getDate() - 10);
    const endDate = new Date();
    endDate.setTime(endDate.getTime() + 130 * 60 * 60 * 1000);

    const event = await prisma.event.create({
      data: {
        name: 'GTC-256 never-messaged test',
        startDate: endDate,
        endDate,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt,
        sharedLinkToken: `gtc256-nm-${stamp}`,
        sharedLinkEnabled: true,
      },
    });
    createdEventIds.push(event.id);

    await prisma.$transaction((tx) =>
      createHostHousehold(tx, {
        eventId: event.id,
        hostPersonId: hostPerson.id,
        sentAt,
        input: {
          alone: false,
          name: 'Kate Whittaker',
          phone: '021 123 4567',
          partner: {
            name: 'Sam Whittaker',
            email: `gtc256-nm-p+${stamp}@example.com`,
            phone: '021 999 8888',
          },
        },
      })
    );

    const hostPE = await prisma.personEvent.findUniqueOrThrow({
      where: { personId_eventId: { personId: hostPerson.id, eventId: event.id } },
    });
    const partnerPE = await prisma.personEvent.findFirstOrThrow({
      where: { eventId: event.id, personId: { not: hostPerson.id } },
    });
    createdPersonIds.push(partnerPE.personId);

    await ensureEventTokens(event.id);

    // ── SITE: the claim ENDPOINT ──────────────────────────────────────────
    //
    // The claim LIST already excludes her (it filters role: 'PARTICIPANT'). Ruling 5's
    // phase-3 note is that this is not enough: "an excluded list is not a refusing
    // endpoint." This endpoint is unauthenticated and takes personId from the body, so
    // the list protects nothing.
    const clean = await claim(`gtc256-nm-${stamp}`, hostPerson.id);
    assert(
      'RULING 5: the claim endpoint REFUSES the host — 404, the same shape as an unknown ' +
        'person, because the endpoint is unauthenticated and a 403 would confirm she exists',
      clean.status === 404
    );
    assert(
      'and it hands back no token of any kind — before the fix this returned her HOST ' +
        "token with redirectPrefix 'h'",
      !clean.body.participantToken && !clean.body.redirectPrefix
    );

    // The partner is checked through the ALREADY-CLAIMED branch (409) rather than a
    // successful claim, because the success path calls next/headers, which needs a real
    // request scope this harness has not got. 409 is the stronger assertion anyway: it
    // proves the endpoint resolved her, found her PARTICIPANT token, and reached the
    // claim logic — so the new refusal is scoped to the host and has not swallowed
    // everybody. A successful first claim is asserted over HTTP in the ticket's evidence.
    await prisma.accessToken.updateMany({
      where: { eventId: event.id, personId: partnerPE.personId, scope: 'PARTICIPANT' },
      data: { claimedAt: new Date(), claimedBy: 'test-device' },
    });
    const partnerClaim = await claim(`gtc256-nm-${stamp}`, partnerPE.personId);
    assert(
      'the claim endpoint still reaches the claim logic for an ordinary guest — the ' +
        'refusal is scoped to the host and nothing else',
      partnerClaim.status === 409
    );
    await prisma.accessToken.updateMany({
      where: { eventId: event.id, personId: partnerPE.personId, scope: 'PARTICIPANT' },
      data: { claimedAt: null, claimedBy: null },
    });

    // ── SITE: the host-triggered manual nudge ─────────────────────────────
    //
    // Founder answer, 2026-08-29: "Yes — refuse the manual nudge at the host. 403,
    // matching the child rule's shape in that function." The route takes personId
    // straight from the URL, and the UI reaches it through invite-status's people list,
    // so the host's own row was one click from texting herself.
    const manualHost = await resolveManualNudgeRecipient(event.id, hostPerson.id);
    assert(
      'RULING 5: the manual nudge refuses the host — 403, the shape the child rule ' +
        'already uses in this function (she exists and may be seen; messaging her is what ' +
        'is forbidden)',
      manualHost.ok === false && manualHost.status === 403
    );
    const manualPartner = await resolveManualNudgeRecipient(event.id, partnerPE.personId);
    assert('and it still resolves an ordinary guest', manualPartner.ok === true);

    // ── SITE: the stale PARTICIPANT token, and its revocation ─────────────
    //
    // Build decision 3, and it is live TODAY on new events rather than only under a
    // backfill. Ruling 8 closes the auto-nudge finder and the decide-by finder BY
    // WITHHOLDING this token; nothing revoked it once issued, because ensureEventTokens'
    // prune handled COORDINATOR only. So one role write re-opened both, permanently.
    const staleToken = await prisma.accessToken.create({
      data: {
        token: `stale-participant-${stamp}`,
        scope: 'PARTICIPANT',
        personId: hostPerson.id,
        eventId: event.id,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    // The RED state, demonstrated rather than described: with the token present, both
    // "closed by construction" finders chase her.
    const nudgeWithStale = await findNudgeCandidatesForEvent(event.id);
    assert(
      'PRECONDITION: a stale PARTICIPANT token makes the auto-nudge finder chase the ' +
        'host — this is what Ruling 8 is only construction-deep without revocation',
      [...nudgeWithStale.eligibleFirst, ...nudgeWithStale.eligibleSecond].some(
        (c) => c.personId === hostPerson.id
      )
    );

    await ensureEventTokens(event.id);

    const hostTokensAfter = await prisma.accessToken.findMany({
      where: { eventId: event.id, personId: hostPerson.id },
      select: { scope: true },
    });
    assert(
      'RULING 5 / build decision 3: ensureEventTokens REVOKES a PARTICIPANT token held by ' +
        'a role-HOST row — not merely declines to issue one',
      !hostTokensAfter.some((t) => t.scope === 'PARTICIPANT')
    );
    assert(
      'and leaves her HOST token alone — the revocation is scoped to the wrong scope, ' +
        'not to the person',
      hostTokensAfter.some((t) => t.scope === 'HOST')
    );
    assert(
      'the revoked row is gone from the table, not merely filtered at read time',
      (await prisma.accessToken.count({ where: { id: staleToken.id } })) === 0
    );

    const partnerTokens = await prisma.accessToken.findMany({
      where: { eventId: event.id, personId: partnerPE.personId },
      select: { scope: true },
    });
    assert(
      "ZONE 3, SCOPED: an ordinary participant's PARTICIPANT token is untouched — the " +
        'prune keys on role HOST and reaches nothing wider',
      partnerTokens.some((t) => t.scope === 'PARTICIPANT')
    );

    // ── The two construction-closed finders, now closed for good ──────────
    const nudgeAfter = await findNudgeCandidatesForEvent(event.id);
    assert(
      'RULING 5 + 8: the auto-nudge finder no longer chases the host, and cannot be ' +
        're-opened by a token that survives a role change',
      ![...nudgeAfter.eligibleFirst, ...nudgeAfter.eligibleSecond].some(
        (c) => c.personId === hostPerson.id
      )
    );

    // decide-by needs her to hold something and answer MAYBE — Ruling 4 walking into
    // Ruling 5, which is the case the ticket predicted would go live once she has items.
    const team = await prisma.team.create({ data: { eventId: event.id, name: 'Puddings' } });
    await prisma.personEvent.update({ where: { id: hostPE.id }, data: { teamId: team.id } });
    const item = await prisma.item.create({
      data: { teamId: team.id, name: 'The pavlova', status: 'ASSIGNED', critical: true },
    });
    await prisma.assignment.create({
      data: { itemId: item.id, personId: hostPerson.id, response: 'MAYBE' },
    });

    const decide = await findDecideByFollowupCandidates(new Date());
    assert(
      'RULING 4 into RULING 5: the host holds an item and answered MAYBE inside the ' +
        'follow-up window, and the decide-by finder does not chase her',
      !decide.eligible.some((c) => c.personId === hostPerson.id && c.eventId === event.id)
    );

    // ── SITE: the proxy message COUNTS her ────────────────────────────────
    //
    // Not an exclusion — Ruling 6 says she MAY receive her own household's messages once
    // she switches them on, and founder answer 2 confirms the analogous case. What was
    // wrong is the number: the template asks her to "check in with them", and she cannot
    // check in with herself.
    await prisma.household.update({
      where: { id: hostPE.householdId! },
      data: { messagesMuted: false },
    });
    await prisma.personEvent.update({ where: { id: hostPE.id }, data: { contactMethod: 'SMS' } });

    const proxy = await findProxyNudgeCandidatesForEvent(event.id);
    assert(
      "RULING 6 still holds: she switched her household's messages on, so she is a " +
        'candidate — Ruling 5 does not reach this path and must not be made to',
      proxy.eligible.length === 1 && proxy.eligible[0].primaryContactPersonId === hostPerson.id
    );
    assert(
      'memberCount is still the TRUE household size, so the metadata does not start lying',
      proxy.eligible[0].memberCount === 2
    );
    assert(
      'RULING 5: but checkInCount — the number the message quotes — excludes her. She is ' +
        'not among the people she is being asked to check in with',
      proxy.eligible[0].checkInCount === 1
    );

    // ── The reason string is shared, so two paths cannot explain it two ways
    assert(
      'the skip reason is a single exported constant, as the mark and the pace are',
      typeof HOST_SKIP_REASON === 'string' && HOST_SKIP_REASON.includes('Ruling 5')
    );

    // ── SITE: recipients, and the numbers that must NOT move ──────────────
    //
    // Build decision 2, narrowed by phase 2 and settled here. Three of the four counting
    // sites moved deliberately in phase 2 and are correct; `recipients` is the fourth,
    // and Ruling 5 says she is not one.
    const allMemberships = await prisma.personEvent.findMany({
      where: { eventId: event.id },
      select: { personId: true, role: true },
    });
    assert(
      'RULING 3 is untouched: the host is still a PersonEvent on her own event, so the ' +
        'headcount and attendance totals phase 2 moved stay moved',
      allMemberships.length === 2 && allMemberships.some((m) => m.personId === hostPerson.id)
    );
    assert(
      'RULING 5: and the recipients count — computed through the module — is one fewer ' +
        'than the membership count, because she is not a recipient',
      allMemberships.filter((m) => isAddressable(m, event.hostId)).length === 1
    );

    // ── The routes that carry an inline guard still import the rule ───────
    //
    // Behavioural coverage for these needs the requireEventRole cookie context, so they
    // are asserted over HTTP in the ticket's evidence. This catches the failure that
    // evidence cannot: a later edit deleting the guard while every suite stays green.
    const fs = await import('fs');
    const guarded = [
      'src/app/api/events/[id]/people/[personId]/route.ts',
      'src/app/api/events/[id]/pre-flight/route.ts',
      'src/app/api/events/[id]/pre-flight/cadence/route.ts',
      'src/app/api/events/[id]/confirm-invites-sent/route.ts',
      'src/app/api/events/[id]/invite-status/route.ts',
    ];
    const unguarded = guarded.filter((p) => !fs.readFileSync(p, 'utf8').includes('host-exclusion'));
    assert(
      `every route carrying an inline Ruling 5 guard imports the one module — no second ` +
        `copy of the rule (missing: ${unguarded.join(', ') || 'none'})`,
      unguarded.length === 0
    );

    // ── BOTH doors to the nudge composer are gated ────────────────────────
    //
    // `PersonInviteDetailModal` -> `HostNudgeSection` -> the nudge route is reached from
    // TWO components, and the route refusing with 403 is not a reason to leave either
    // offering the click. Suppressing one and not the other would be the claim endpoint's
    // mistake in UI form — an excluded list is not a refusing endpoint, and a suppressed
    // affordance is not a suppressed affordance if a second one opens the same modal.
    const doors = [
      'src/components/plan/InviteStatusSection.tsx',
      'src/components/plan/WhosMissing.tsx',
    ];
    const ungatedDoors = doors.filter((p) => !fs.readFileSync(p, 'utf8').includes('isHost'));
    assert(
      `both entry points to the nudge composer gate on isHost (ungated: ` +
        `${ungatedDoors.join(', ') || 'none'})`,
      ungatedDoors.length === 0
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
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
