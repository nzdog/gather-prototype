/**
 * GTC-262 — the COORDINATOR token in the two unauthenticated surfaces.
 *
 * WHAT THIS PINS.
 *
 * `GET /api/gather/[eventId]/directory` and `POST /api/join/[token]/claim` are both
 * unauthenticated and both returned whatever access token a person held, preferring
 * PARTICIPANT and falling back to COORDINATOR — together with the URL prefix that opens it.
 * Measured 2026-09-18 against `gather_dev`, unauthenticated, no cookie, and with the shared
 * link SWITCHED OFF on the event:
 *
 *   GET /api/gather/cmmolxnlm00181yn154x1aylz/directory
 *     Henderson Family Christmas 2025 — 42 people, 7 of them tokenPrefix=c
 *
 *   POST /api/join/NzW0…ZdCk/claim  {"personId":"cmu6laq1x001jrj8upc8jrpkm"}
 *     HTTP 200  {"participantToken":"6e45ed18…","redirectPrefix":"c"}
 *
 * Across `gather_dev`: 16 directory rows on 6 events emitted a coordinator token, 9 of them
 * still inside their 90-day `expiresAt`. A coordinator token is not a read link — via
 * `src/app/api/c/[token]/**` it authorises create, PATCH and DELETE of a team's items, and
 * assign/unassign of people to them.
 *
 * THE FIX IS A NARROWING OF WHAT IS PUBLISHED, NOT OF WHAT EXISTS. `resolveToken` is
 * untouched and a coordinator token remains a fully valid credential; `ensureEventTokens` is
 * untouched and issuance is unchanged (that is GTC-294's). The rule about what a stranger
 * may be handed now lives once, in `src/lib/eligibility/shared-link-exposure.ts`.
 *
 * Run: npx tsx tests/coordinator-token-exposure-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { ensureEventTokens } from '../src/lib/tokens';
import { resolveToken } from '../src/lib/auth';
import {
  SHAREABLE_TOKEN_SCOPE,
  SHAREABLE_TOKEN_PREFIX,
  SHAREABLE_ACCESS_TOKEN,
  isClaimableRole,
  UNKNOWN_PERSON_MESSAGE,
  UNKNOWN_PERSON_STATUS,
} from '../src/lib/eligibility/shared-link-exposure';
import { GET as directoryGET } from '../src/app/api/gather/[eventId]/directory/route';
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

/** The route ignores its request argument, so the id in the params is the whole input. */
async function readDirectory(eventId: string) {
  const res = await directoryGET({} as any, { params: Promise.resolve({ eventId }) });
  return { status: res.status, body: (await res.json()) as any };
}

/**
 * The claim route's two outcomes, as this suite can observe them in-process.
 *
 * ⚠ THE HAPPY PATH CANNOT BE DRIVEN IN-PROCESS, AND THAT IS NOT A GAP IN THE ASSERTION.
 * A successful claim builds an audit `deviceId` from `headers()` (`next/headers`), which
 * throws "`headers` was called outside a request scope" under `tsx`. That throw is itself
 * the observation this suite needs: it happens strictly AFTER both guards, so reaching it
 * proves the caller got past them. A refusal returns before it. So the two outcomes are
 * distinguishable and neither is inferred — 'refused' carries the real status and body, and
 * 'reached-claim' means the request was admitted to the claim machinery.
 * The claim's own writes are asserted over HTTP in the ticket's evidence, as GTC-256 did.
 */
type ClaimOutcome = { kind: 'refused'; status: number; body: any } | { kind: 'reached-claim' };

async function postClaim(sharedToken: string, personId: string): Promise<ClaimOutcome> {
  const request = { json: async () => ({ personId }) } as any;
  try {
    const res = await claimPOST(request, { params: Promise.resolve({ token: sharedToken }) });
    return { kind: 'refused', status: res.status, body: await res.json() };
  } catch (e: any) {
    if (String(e?.message ?? '').includes('outside a request scope')) {
      return { kind: 'reached-claim' };
    }
    throw e;
  }
}

/**
 * Source with comments removed, for the structural guards at the end.
 *
 * ⚠ NOT A SUBSTRING SEARCH OVER THE RAW FILE. Both routes deliberately NAME the mechanism
 * being removed in the comment explaining why it is gone, so a raw search false-positives on
 * the fix's own warning. That is the exact correction `tests/host-directory-exposure-test.ts`
 * already carries for `child-exclusion` — GTC-256 phase 4 tripped it when it sited a boundary
 * comment — and this is the same class one rung up: there the fix was an import, here it is a
 * literal. The stripper is asserted against a fixture below before it is trusted.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ── Layer 0: the rule, before any database work ───────────────────────
    //
    // Asserted first because every site below is one call of it, and because the ROLE
    // key is the whole of the design note in shared-link-exposure.ts.
    assert(
      'GTC-262: exactly one scope is shareable, and it is PARTICIPANT — the ask, not the job',
      SHAREABLE_TOKEN_SCOPE === 'PARTICIPANT' && SHAREABLE_TOKEN_PREFIX === 'p'
    );
    assert(
      'the SQL fragment narrows the token query itself, so a coordinator token never ' +
        'enters the process rather than being dropped after it loads',
      JSON.stringify(SHAREABLE_ACCESS_TOKEN) === JSON.stringify({ scope: 'PARTICIPANT' })
    );

    assert(
      'RULED (unknown 1, 2026-09-18): a COORDINATOR membership is not claimable through ' +
        'the shared link — the bargain was struck about the ask, never about the job',
      isClaimableRole('COORDINATOR') === false
    );
    assert(
      'RULED (unknown 2, 2026-09-18): an ordinary PARTICIPANT still is — this fix narrows ' +
        'the KIND of credential, not the bargain',
      isClaimableRole('PARTICIPANT') === true
    );
    assert(
      'a HOST membership is refused here too, so the two predicates agree rather than ' +
        'merely not conflicting (GTC-256 Ruling 5 is still the load-bearing one)',
      isClaimableRole('HOST') === false
    );
    assert(
      'it is an ALLOWLIST: null, undefined and an unknown future PersonRole are all ' +
        'refused, which is the safe direction on an endpoint whose output is credentials',
      isClaimableRole(null) === false &&
        isClaimableRole(undefined) === false &&
        isClaimableRole('SOME_FUTURE_ROLE') === false
    );
    assert(
      'the refusal is the unknown-person one, byte-identical to the host refusal, so it ' +
        'cannot be used as an oracle for "this personId coordinates a team here"',
      UNKNOWN_PERSON_MESSAGE === 'Person not found in this event' && UNKNOWN_PERSON_STATUS === 404
    );

    assert(
      'CONTROL: the comment stripper used by the structural guards actually strips — ' +
        'asserted before it is trusted, because a broken stripper passes those guards',
      stripComments(
        "/* prefixMap 'c' */ const a = 1; // redirectPrefix 'c'\nconst b = 2;"
      ).includes("'c'") === false
    );

    // ── The fixture: a coordinator, a guest, and a host on one event ──────
    const stamp = Date.now();
    const user = await prisma.user.create({
      data: { email: `gtc262+${stamp}@example.com` },
    });
    createdUserIds.push(user.id);

    const hostPerson = await prisma.person.create({
      data: { name: 'GTC-262 Host', email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const coordinatorPerson = await prisma.person.create({
      data: { name: 'GTC-262 Coordinator', email: `gtc262-coord+${stamp}@example.com` },
    });
    createdPersonIds.push(coordinatorPerson.id);

    const guestPerson = await prisma.person.create({
      data: { name: 'GTC-262 Guest', email: `gtc262-guest+${stamp}@example.com` },
    });
    createdPersonIds.push(guestPerson.id);

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const sharedLinkToken = `gtc262-shared-${stamp}`;
    const event = await prisma.event.create({
      data: {
        name: 'GTC-262 coordinator exposure test',
        startDate: start,
        endDate: start,
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sharedLinkToken,
        sharedLinkEnabled: true,
      },
    });
    createdEventIds.push(event.id);

    const team = await prisma.team.create({
      data: { name: 'GTC-262 Team', eventId: event.id, coordinatorId: coordinatorPerson.id },
    });

    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: event.id, role: 'HOST' },
    });
    await prisma.personEvent.create({
      data: {
        personId: coordinatorPerson.id,
        eventId: event.id,
        role: 'COORDINATOR',
        teamId: team.id,
      },
    });
    await prisma.personEvent.create({
      data: { personId: guestPerson.id, eventId: event.id, role: 'PARTICIPANT' },
    });

    await ensureEventTokens(event.id);

    const coordinatorToken = await prisma.accessToken.findFirstOrThrow({
      where: { eventId: event.id, personId: coordinatorPerson.id, scope: 'COORDINATOR' },
    });

    // ── PRECONDITIONS: the RED state, demonstrated rather than described ──
    //
    // These pass in the RED run and in the GREEN one, on purpose. GTC-256's
    // host-never-messaged suite does the same and records why: a narrowing whose
    // preconditions are not asserted can later be read as scaffolding and deleted. What
    // these two fix in place is that the thing being withheld is a REAL, WORKING
    // credential and the person keeping it is a REAL member of the event — so neither
    // "it was already a dud" nor "we just dropped the row" can be mistaken for the fix.
    const resolved = await resolveToken(coordinatorToken.token);
    assert(
      'PRECONDITION: the coordinator token is a live credential — resolveToken returns ' +
        "COORDINATOR scope with a team, which is write access to that team's items",
      resolved?.scope === 'COORDINATOR' && resolved?.team?.id === team.id
    );
    assert(
      'PRECONDITION: and the coordinator is a real member of this event, so what follows ' +
        'withholds the CREDENTIAL and not the ROW',
      (await prisma.personEvent.count({
        where: { eventId: event.id, personId: coordinatorPerson.id },
      })) === 1
    );
    assert(
      'PRECONDITION: ensureEventTokens issues no PARTICIPANT token to a coordinator today ' +
        '— the condition GTC-294 removes, which is why the refusal below must not key on it',
      (await prisma.accessToken.count({
        where: { eventId: event.id, personId: coordinatorPerson.id, scope: 'PARTICIPANT' },
      })) === 0
    );

    // ── SITE 1: the directory ─────────────────────────────────────────────
    const dir = await readDirectory(event.id);
    const people: Array<{
      id: string;
      name: string;
      token: string | null;
      tokenPrefix: string | null;
    }> = dir.body.people;

    assert(
      'GTC-262: no row in the directory carries the COORDINATOR prefix, so nothing in ' +
        'this payload routes a clicker to /c/',
      dir.status === 200 && people.every((p) => p.tokenPrefix !== 'c')
    );
    assert(
      'GTC-262: and the coordinator token does not appear anywhere in the response, under ' +
        'any name — the token is what grants access, so the assertion is on the token',
      !JSON.stringify(dir.body).includes(coordinatorToken.token)
    );
    assert(
      'GTC-262: the coordinator is STILL LISTED — they are a guest and belong in the ' +
        "family's view of who is coming; what is withheld is the credential, not the name",
      people.some((p) => p.id === coordinatorPerson.id)
    );
    assert(
      'and their row carries a null token and a null prefix rather than a substitute — ' +
        'the page has a branch for that and it is the one the new copy speaks to',
      people.find((p) => p.id === coordinatorPerson.id)?.token === null &&
        people.find((p) => p.id === coordinatorPerson.id)?.tokenPrefix === null
    );

    // The endpoint must still do its job. A directory that leaks nothing because it
    // returns nothing is not a fix — unknown 2 was RULED, and the participant bargain
    // stands exactly as it was.
    assert(
      'RULED (unknown 2): the ordinary guest still gets a working PARTICIPANT link, ' +
        'prefix p — the shared directory is still a credential dispenser and still works',
      people.find((p) => p.id === guestPerson.id)?.tokenPrefix === 'p' &&
        !!people.find((p) => p.id === guestPerson.id)?.token
    );
    assert(
      'GTC-256 Ruling 5 survives untouched: the host is not listed and her HOST token is ' +
        'not in the payload',
      people.every((p) => p.id !== hostPerson.id) && people.every((p) => p.tokenPrefix !== 'h')
    );

    // ── SITE 2: the claim route ───────────────────────────────────────────
    const coordinatorClaim = await postClaim(sharedLinkToken, coordinatorPerson.id);
    assert(
      'GTC-262: the claim route REFUSES a coordinator — 404 with the unknown-person ' +
        'wording, not a redirect carrying their token',
      coordinatorClaim.kind === 'refused' &&
        coordinatorClaim.status === UNKNOWN_PERSON_STATUS &&
        coordinatorClaim.body?.error === UNKNOWN_PERSON_MESSAGE
    );
    assert(
      'and the refusal body carries no token and no prefix at all — the removed branch ' +
        'returned both under a field named participantToken',
      coordinatorClaim.kind === 'refused' &&
        !JSON.stringify(coordinatorClaim.body).includes(coordinatorToken.token) &&
        !('redirectPrefix' in (coordinatorClaim.body ?? {}))
    );
    assert(
      'and the refusal WROTE NOTHING — no claim stamp on the token, no SHARED tier and no ' +
        'claimedViaSharedLink on the membership row',
      (await prisma.accessToken.count({
        where: { id: coordinatorToken.id, claimedAt: null, claimedBy: null },
      })) === 1 &&
        (await prisma.personEvent.count({
          where: {
            eventId: event.id,
            personId: coordinatorPerson.id,
            claimedViaSharedLink: false,
            reachabilityTier: { not: 'SHARED' },
          },
        })) === 1
    );

    const guestClaim = await postClaim(sharedLinkToken, guestPerson.id);
    assert(
      'CONTROL: an ordinary guest is still admitted to the claim machinery — the refusal ' +
        'is scoped to the coordinator and has not swallowed everybody',
      guestClaim.kind === 'reached-claim'
    );

    const hostClaim = await postClaim(sharedLinkToken, hostPerson.id);
    assert(
      'GTC-256 Ruling 5 survives untouched here too: the host is still refused 404 with ' +
        'the same wording',
      hostClaim.kind === 'refused' &&
        hostClaim.status === 404 &&
        hostClaim.body?.error === 'Person not found in this event'
    );

    // ── THE GTC-294 ASSERTION — the reason the refusal keys on the role ───
    //
    // GTC-294 (GTC-189 ruling E) issues coordinators a PARTICIPANT token as well. Minted
    // by hand here because that ticket is not built, and this is the whole point of the
    // role key: written the token-shaped way, the refusal above stops refusing on the day
    // GTC-294 lands, silently, with every other assertion in this file still green.
    const simulatedGtc294Token = await prisma.accessToken.create({
      data: {
        token: `gtc262-sim-gtc294-${stamp}`,
        scope: 'PARTICIPANT',
        personId: coordinatorPerson.id,
        eventId: event.id,
        teamId: null,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    const afterGtc294 = await postClaim(sharedLinkToken, coordinatorPerson.id);
    assert(
      'GTC-294 FORWARD GUARD: with a PARTICIPANT token present the coordinator is STILL ' +
        'refused — the gate reads PersonEvent.role, which GTC-294 does not touch, so it ' +
        'survives issuance changing underneath it',
      afterGtc294.kind === 'refused' &&
        afterGtc294.status === UNKNOWN_PERSON_STATUS &&
        afterGtc294.body?.error === UNKNOWN_PERSON_MESSAGE
    );
    assert(
      'and nothing was claimed on that simulated token either — after GTC-294 the full ' +
        'claim path would otherwise have run and stamped the coordinator as SHARED',
      (await prisma.accessToken.count({
        where: { id: simulatedGtc294Token.id, claimedAt: null },
      })) === 1
    );

    const dirAfterGtc294 = await readDirectory(event.id);
    const coordRowAfter = dirAfterGtc294.body.people.find(
      (p: { id: string }) => p.id === coordinatorPerson.id
    );
    assert(
      "GTC-294 FORWARD GUARD: the directory then emits the coordinator's PARTICIPANT " +
        'link with prefix p — after GTC-294 they reach their own ask from the directory, ' +
        'which is what the directory is for, and never the /c/ job link',
      coordRowAfter?.tokenPrefix === 'p' && coordRowAfter?.token === simulatedGtc294Token.token
    );
    assert(
      'and the coordinator token is still absent from the payload with both tokens live — ' +
        'the narrowing is a query filter, not a priority the new token happens to outrank',
      !JSON.stringify(dirAfterGtc294.body).includes(coordinatorToken.token)
    );

    // ── STRUCTURAL: the mechanism is GONE, not merely unreachable ─────────
    //
    // Founder ruling, 2026-09-18, on removing rather than restricting the claim route's
    // fallback: "restricting leaves the mechanism standing as dead code, and the dead code
    // is the mechanism." Asserted structurally for the same reason GTC-207's prohibition
    // is: the failure guarded against is an edit that type-checks perfectly.
    const fs = await import('fs');
    const dirSrc = stripComments(
      fs.readFileSync('src/app/api/gather/[eventId]/directory/route.ts', 'utf8')
    );
    const claimSrc = stripComments(
      fs.readFileSync('src/app/api/join/[token]/claim/route.ts', 'utf8')
    );

    assert(
      'the directory carries no scope-priority table and no multi-scope prefix map — the ' +
        'two rows that were the defect are not present to be re-reached by one edit',
      !/scopePriority/.test(dirSrc) && !/prefixMap/.test(dirSrc) && !/COORDINATOR/.test(dirSrc)
    );
    assert(
      'the claim route carries no redirectPrefix and no non-participant token fallback',
      !/redirectPrefix/.test(claimSrc) && !/tokens\[0\]/.test(claimSrc)
    );
    assert(
      'and both routes IMPORT the rule rather than restating it, so the two doors cannot ' +
        'drift apart the way GTC-256 phase 3 found its two modal doors had',
      /from\s+['"][^'"]*shared-link-exposure['"]/.test(dirSrc) &&
        /from\s+['"][^'"]*shared-link-exposure['"]/.test(claimSrc)
    );
    assert(
      'the claim route still imports host-exclusion — the role allowlist does NOT replace ' +
        'the Event.hostId check, and a host row re-roled to PARTICIPANT needs both',
      /from\s+['"][^'"]*host-exclusion['"]/.test(claimSrc)
    );

    const forbiddenImporters = [
      'src/lib/tokens.ts',
      'src/lib/auth.ts',
      'src/lib/auto-assign.ts',
      'src/lib/sms/nudge-eligibility.ts',
    ];
    const leaked = forbiddenImporters.filter(
      (p) =>
        fs.existsSync(p) &&
        /from\s+['"][^'"]*shared-link-exposure['"]/.test(fs.readFileSync(p, 'utf8'))
    );
    assert(
      'PUBLICATION-ONLY: no issuance, auth or messaging path imports shared-link-exposure ' +
        '— it says what a stranger may be handed and nothing about who may hold or be sent',
      leaked.length === 0
    );
  } finally {
    for (const eventId of createdEventIds) {
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
