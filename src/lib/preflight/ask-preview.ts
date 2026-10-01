/**
 * GTC-189 slice 3 — the pre-flight preview: per person, what the press will actually do.
 *
 * WHY IT EXISTS. The preview used to list every adult, check nothing about whether they could
 * be reached, show no child, and give a coordinator a stand-in link the press would never
 * replace. This reads the event and routes EVERY membership through `chooseAskRoute` — slice 1's
 * chooser, which the senders are to call too — so the host is shown the route the send takes:
 * who is messaged and on which channel, which children's asks each message carries, and who is
 * a line on her list instead, with the reason. Nothing here reads `PersonEvent.contactMethod`
 * (ruling C).
 *
 * ⚠ A JOB IS SOMETHING A CHILD HOLDS (build shape, slice 3). `holdsItems` is true for a row of
 * EITHER kind. Counted over dishes only, a child whose only row is a job is `CHILD_WITHOUT_ITEM`:
 * no carrier, no message, no line on the host's list — a filter wearing different clothes, and it
 * would silently undo GTC-189 answer 6. `tests/ask-preview-test.ts` asserts it with five such
 * children, one on every route a child can take.
 *
 * ⚠ SPLIT BY `Item.kind`, NEVER FILTERED. Every assigned row lands in exactly one of two lists —
 * `jobNames` for TASK, `itemNames` for everything else — because `composeAsk` writes "do" of one
 * and "bring" of the other. No row is dropped; the suite accounts for every one.
 *
 * NAMES ARE PASSED EXACTLY AS STORED. Capitals mid-sentence and bracketed qualifiers show on this
 * screen; the display helper, the prompt changes and the qualifier move are [[GTC-302]]'s, ordered
 * after this slice.
 *
 * THE OPT-OUT FACT PASSED TO THE CHOOSER — [[GTC-301]], which slice 1 answer 6 requires each
 * caller to name: opted out if EITHER `Person.smsOptedOut` is true OR an `SmsOptOut` row is in
 * force for the person's number. The row is read the way `checkOptOut` in `sendSms` refuses on it;
 * the flag because the manual nudge and the wrap-up read it. So the preview never shows a text that
 * either gate would refuse.
 * ACCOUNT-WIDE SINCE [[GTC-288]] (founder ruling, 2026-09-12): a row in force for the number counts
 * whichever host's guest it is. It was per host until then, by GTC-189 slice 3 answer 1, which left
 * the widening to GTC-288; the suite's `[GTC-301]` assertions moved with it.
 *
 * THE LINK, TOLD AS THE PRESS WILL ISSUE IT. `ensureEventTokens` in `src/lib/tokens.ts` issues a
 * PARTICIPANT token to a `role: 'PARTICIPANT'` row and — since [[GTC-294]] — to a
 * `role: 'COORDINATOR'` row as well, and revokes one from a HOST row. So a guest OR a coordinator
 * with no token yet is AT_PRESS, and both are READY once it is issued; the host as carrier gets
 * none until [[GTC-297]]. The rule is read here, not changed — Zone 3 is not entered — and the
 * suite measures it on either side of a real `ensureEventTokens` call.
 *
 * ⚠ SUPERSEDED, KEPT SO THE CHANGE IS LEGIBLE: until [[GTC-294]] a coordinator was reported
 * `NONE_COORDINATOR` — "the press issues her no guest link" — which was true of the tree and is
 * now false of it. GTC-189 ruling E gave her the ask, and this file had to move with issuance
 * rather than after it, because a preview that contradicts the database is worse than no preview.
 *
 * THE HOST'S THIRD IDENTITY PATH. The chooser knows the host by `Event.hostId` and `role: 'HOST'`.
 * The route this replaced also excluded any Person on the host's own `User` — `POST
 * /api/auth/verify` can leave one human as two Person rows (see [[GTC-263]]). That exclusion is
 * kept: such a row is sent nothing and is no line on her list, and if a household picked it, it
 * carries as the host does.
 *
 * READS ONLY. No write, no token issued, nothing sent. Takes a client so the suite can drive it.
 */

import type { Prisma } from '@prisma/client';
import {
  chooseAskRoute,
  chooseChaseRoute,
  type AskRoute,
  type Channel,
  type ChaseChooserEvent,
  type ChaseNoneWhy,
  type ChaseRoute,
  type HostListWhy,
} from '@/lib/eligibility/channel-chooser';
import {
  resolveChaseWhenNoMobile,
  type ChaseWhenNoMobile,
} from '@/lib/eligibility/chase-when-no-mobile';
import { isMessageableRole } from '@/lib/eligibility/child-exclusion';
import { emailOptedOutFact, listEmailOptOutsForEvent } from '@/lib/eligibility/email-opt-out';
import { emailBlockStateOf, listEmailBlocks } from '@/lib/eligibility/email-block';
import { emailNoteFor } from '@/lib/eligibility/email-block-words';
import { isHostMembership } from '@/lib/eligibility/host-exclusion';
import { HOST_NAME_FALLBACK, firstNameOf } from '@/lib/messages/ask-register';
import { buildTokenUrl } from '@/lib/tokens';
import { SMS_OPT_OUT_IN_FORCE } from '@/lib/sms/opt-out-service';

type Db = Prisma.TransactionClient;

/** How the recipient's link stands, as `ensureEventTokens` will leave it at the press. */
export type LinkState =
  /** A PARTICIPANT token exists; `link` is its URL. */
  | 'READY'
  /** No token yet, and the press will issue one. */
  | 'AT_PRESS'
  /** The host as carrier: no guest link — her one-off link is [[GTC-297]]. */
  | 'NONE_HOST_CARRIER'
  /**
   * No link, and the press will not issue one either.
   *
   * ⚠ UNREACHABLE FOR EVERY ROLE `PersonRole` CURRENTLY HAS, AND KEPT ANYWAY. `NONE_COORDINATOR`
   * stood here until [[GTC-294]] gave coordinators a PARTICIPANT token; with HOST rows caught
   * above as carriers and PARTICIPANT and COORDINATOR rows both issued at the press, nothing
   * reaches this today. It survives as the fail-closed default so that a role added to the enum
   * later is reported as having no link rather than promised one it will never get — the same
   * allowlist direction `shared-link-exposure.ts` and `child-exclusion.ts` take next door, and
   * the reason `LINK_NONE` in `ask-preview-compose.ts` exists at all ("honest beats a promise
   * that never arrives", GTC-189 slice 3 answer 2).
   */
  | 'NONE_NOT_ISSUED';

/*
 * ⚠ DECISION 29 ASKED FOR A FIFTH MEMBER HERE AND NONE WAS ADDED. GTC-189 slice 5b, 2026-09-19,
 * recorded rather than done silently.
 *
 * The ruling: "A recipient whose link cannot answer their message is not READY, and slice 3's
 * LinkState has to carry it the way it already carries the coordinator and host-carrier cases."
 * The population it was ruled on was eighteen recipients in `gather_dev` carrying thirty-four
 * children's asks whose page returned only the link holder's own rows — and [[GTC-191]] built
 * the answer to exactly that: `GET /api/p/[token]` returns a separate `carried` array and the
 * ack route takes a carried answer, authorised by re-running `chooseAskRoute`. The eighteen are
 * still there and their links now answer what their message asks.
 *
 * So a fifth member would represent nothing, which is the thing the founder warned against when
 * ruling on GTC-191's order: "a state written after the gap closes is a state nobody has seen
 * fire." `NONE_COORDINATOR` was retired by [[GTC-294]] on the same logic.
 *
 * WHAT DECISION 29 STILL BUYS is below and in `ask-preview-compose.ts`: the withholding the
 * press actually performs is visible BEFORE the press, because the count the host reads is the
 * number of MESSAGES and the recipients who get none are named with a reason. The ruling's own
 * ground — "that is the fix that makes withholding honest" — is met by the arithmetic rather
 * than by a member.
 */

/**
 * The two states in which the press sends nothing at all.
 *
 * Typed as an exclusion rather than listed, so a `LinkState` added later is a COMPILE ERROR in
 * `NOT_MESSAGED_WHY` until somebody decides which side of the line it falls on and writes its
 * words. That is the same guard `ADULT_WHY` uses, and the founder's rule at slice 3, answer 4:
 * every case has words, so a new route cannot produce a blank line.
 */
export type NotMessagedLinkState = Exclude<LinkState, 'READY' | 'AT_PRESS'>;

/**
 * WILL THE PRESS SEND THIS RECIPIENT A MESSAGE? One rule, two callers.
 *
 * `AT_PRESS` is true because that is what AT_PRESS MEANS — the press issues the token and then
 * holds the link. `READY` is true because it already holds it. The other two are false: a
 * message needs a link to carry, and `composeAsk` says so in its type — its `link` is a required
 * string, not an optional one.
 *
 * ⚠ WHY IT IS A FUNCTION HERE RATHER THAN A COMPARISON AT EACH CALLER. GTC-189 slice 5a read
 * `linkState === 'READY'` inline inside `src/lib/press/press.ts`, which is a second reading of
 * this rule living in a different file from the states themselves. `linkOf` below already
 * carries a note about exactly that hazard — it mirrors `ensureEventTokens` step 4, and
 * [[GTC-294]] is the occasion when the mirror drifted and the screen went on promising a
 * coordinator no link while the database handed her one. **Two readings of one rule is how the
 * screen and the send come to disagree about who was messaged**, and this is the module that has
 * already been bitten by it once.
 *
 * ⚠ AND THE PRESS ASSERTS THE STRONGER FORM AS WELL, which is not the same question. Before the
 * press, `AT_PRESS` is a promise; after `ensureEventTokens` has run it must have become `READY`.
 * A recipient still reading `AT_PRESS` after issuance means issuance did not do what this screen
 * promised, and `pressSend` refuses rather than dropping them — see `LINKS_NOT_ISSUED` there.
 */
export function pressWillMessage(linkState: LinkState): boolean {
  return linkState === 'READY' || linkState === 'AT_PRESS';
}

/**
 * WHO THE PRESS WRITES A ROW FOR, ON ONE EVENT — ONE RULE, NOW THREE CALLERS.
 *
 * ⚠ EXTRACTED AT [[GTC-322]] ON A FOUNDER RULING, 2026-09-19, AND THE REASON IS THE RULING:
 *
 * > One predicate, shared with `enrolMiniSends`. Identical populations is a property, not a
 * > margin, and one person of difference is a real invitation from an event pressed months ago.
 *
 * The two-step rule — *would the press message them at all*, then *do they hold a link yet* —
 * was spelled three times: in `pressSend` as `intended`/`addressed`, in `enrolMiniSends` as a
 * `continue` pair, and a third time in GTC-322's backfill. `pressWillMessage` below was already
 * shared; **the split built on it was not**, and it is the split that decides who gets a row.
 *
 * ⚠ WHY THAT MATTERS MORE THAN TIDINESS, MEASURED: GTC-322's backfill writes rows for the
 * people a legacy press never wrote rows for, which **flips `enrolMiniSends`' event predicate
 * on all eight of those events** — from 1 event considered to 8. It would enrol ZERO, and only
 * because the two populations are identical. **One person of difference and the two-minute cron
 * sends that person a real invitation from an event pressed months ago** — which is the incident
 * slice 5e already had once, at 20 rows across four real boards.
 */
export function askRowPopulation(recipients: readonly PreviewRecipient[]): {
  /** Holds a link now: the press writes them an addressed row. */
  ready: PreviewRecipient[];
  /**
   * The press WOULD message them and issuance has not produced a link yet. `pressSend` refuses
   * the whole press when this is non-empty after `ensureEventTokens` (`LINKS_NOT_ISSUED`);
   * `enrolMiniSends` counts them and waits, because minting from a cron is [[GTC-316]]'s.
   */
  awaitingLink: PreviewRecipient[];
} {
  const intended = recipients.filter((r) => pressWillMessage(r.linkState));
  return {
    ready: intended.filter((r) => r.linkState === 'READY'),
    awaitingLink: intended.filter((r) => r.linkState !== 'READY'),
  };
}

/**
 * [[GTC-301]]'S TWO OPT-OUT FACTS, MERGED IN ONE PLACE.
 *
 * ⚠ EXTRACTED AT GTC-189 SLICE 7b RATHER THAN COPIED. This expression lived inline in
 * `readAskPreview` below, and ruling U's third action — *"send to the phone instead"* — needs
 * the identical answer at the bounce door. GTC-301's whole finding is that two opt-out facts
 * with different writers and different readers is a defect nobody had named; a second reader
 * spelling the `||` for itself is how the door and the pre-flight come to disagree about
 * whether a phone may be used, which is Do-Not-Touch Zone 7.
 *
 * The QUERY stays per caller and stays narrow — the preview reads every number on the event in
 * one go, the door reads one — because the cost of the two lookups differs by two orders of
 * magnitude. It is the RULE that has one definition, not the fetch.
 */
export function smsOptedOutFact(
  person: { smsOptedOut: boolean; phoneNumber: string | null },
  optedOutNumbers: ReadonlySet<string>
): boolean {
  return person.smsOptedOut || (!!person.phoneNumber && optedOutNumbers.has(person.phoneNumber));
}

/** A child's rows, carried in a recipient's message. */
export interface PreviewCarried {
  personEventId: string;
  name: string;
  firstName: string;
  itemNames: string[];
  jobNames: string[];
}

export interface PreviewRecipient {
  personEventId: string;
  personId: string;
  name: string;
  channel: Channel;
  /** Ruling A2: the host, reached only as another household's picked contact. */
  hostAsCarrier: boolean;
  /** Their OWN rows. Always empty for the host as carrier — nothing of hers is merged in. */
  itemNames: string[];
  jobNames: string[];
  carried: PreviewCarried[];
  link: string | null;
  linkState: LinkState;
  /**
   * [[GTC-189]] slice 8a, W2 — set when the provider will not deliver to this person's address and
   * the ask reaches them by text instead. Null otherwise. A sentence, never the address.
   */
  emailNote: string | null;
}

/** A line on the host's list: an adult Gather cannot reach, or a child whose route is closed. */
export interface HostListLine {
  personEventId: string;
  personId: string;
  name: string;
  child: boolean;
  why: HostListWhy;
  itemNames: string[];
  jobNames: string[];
  /** The adult who would have carried a child's ask, when it was that adult who could not be reached. */
  carrierName: string | null;
}

/**
 * [[GTC-311]] — how one RECIPIENT is chased, and whether the host may take them off it.
 *
 * ⚠ THE CONTROL IS READ OFF THE CHASE ROUTE, NEVER RE-DERIVED. Since the narrow line left the
 * chooser, the only way a chase reaches EMAIL is through `resolveChaseWhenNoMobile`, and the only
 * way it reaches `HANDED_TO_HOST` is the same call answering the other way. So "the exception
 * applies to this person" is exactly "the chase is EMAIL, or HANDED_TO_HOST" — and nothing here
 * states the order a second time for it to drift from.
 */
export interface RecipientChase {
  chasedBy: 'TEXT' | 'EMAIL' | 'NONE';
  why: ChaseNoneWhy | null;
  /**
   *  OFFERED             — the resolver decides this person; the per-person pills are shown.
   *  REFUSED_OPTED_OUT   — ruling AI: an SMS opt-out is never offered it, and ruling AM's
   *                        placeholder is shown in its place.
   *  NONE                — a usable mobile, the mark, the host as carrier: nothing to decide.
   */
  control: 'OFFERED' | 'REFUSED_OPTED_OUT' | 'NONE';
  /** `PersonEvent.chaseException` as stored. NULL means follow the default. */
  exception: ChaseWhenNoMobile | null;
  /**
   * [[GTC-189]] slice 8b, ruling R — the CHILDREN whose chase reaches this recipient as their
   * carrier (`chooseChaseRoute` answered CARRIED to them). Their pending rows keep the carrier
   * chased, and their names go in the reminder. `PersonEvent` ids.
   */
  carried: string[];
}

/**
 * A line in group B of the host's list — ASKED, and not chased.
 *
 * ⚠ DELIBERATELY NOT A `HostListLine` AND NEVER IN `hostList`. `pressSend`, `drainOnce` and
 * `enrolMiniSends` each read `hostList` to write WITHHELD ASK rows ([[GTC-325]], [[GTC-296]]), so a
 * chase line put there would stop the person's invitation — a chase decision silently withholding
 * the ask. `tests/chase-channel-test.ts` asserts `hostList` and `recipients` are byte-identical with
 * and without exceptions.
 */
export interface NotChasedLine {
  personEventId: string;
  personId: string;
  name: string;
  child: boolean;
  why: ChaseNoneWhy;
  itemNames: string[];
  jobNames: string[];
  /** The adult who carries a child's ask, when it is that adult who is not chased. */
  carrierName: string | null;
}

export interface PreviewChase {
  /** `Event.chaseWhenNoMobileDefault` as stored. NULL means not set. */
  stored: ChaseWhenNoMobile | null;
  /** What the switch means today — the stored value, or the system default (ruling AH, ON). */
  resolved: ChaseWhenNoMobile;
  /** Keyed by `PreviewRecipient.personEventId`. */
  byRecipient: Record<string, RecipientChase>;
  notChased: NotChasedLine[];
  /**
   * [[GTC-305]] — THE CHOOSER'S CHASE ANSWER FOR EVERY NON-HOST MEMBERSHIP, keyed by `PersonEvent`
   * id. The board reads it, so the board, this screen and the chase get one answer from one place.
   *
   * ⚠ EVERY membership, not only the asked ones. A guest who unsubscribes or reports after the press
   * has ask route HOST_LIST — `askChannelOf` refuses on the email no above every channel — and she is
   * exactly who GTC-305 ruling 3 is about.
   */
  byMembership: Record<string, ChaseRoute>;
}

/**
 * The chase refusals that group B leaves out, and where each already is.
 *  - MARKED_DONT_CHASE: grey, and revisited in step 3 where it is set (GTC-192 Rulings 14 and 17).
 *  - HOST_AS_CARRIER: already on the screen as a recipient the press does not message.
 *  - HOST_OWN_ASK, CHILD_WITHOUT_ITEM: not recipients of anything.
 */
const NOT_ON_GROUP_B: ReadonlySet<ChaseNoneWhy> = new Set<ChaseNoneWhy>([
  'MARKED_DONT_CHASE',
  'HOST_AS_CARRIER',
  'HOST_OWN_ASK',
  'CHILD_WITHOUT_ITEM',
]);

function recipientChaseOf(route: ChaseRoute, exception: ChaseWhenNoMobile | null): RecipientChase {
  if (route.kind !== 'NONE') {
    return {
      chasedBy: route.channel,
      why: null,
      control: route.channel === 'EMAIL' ? 'OFFERED' : 'NONE',
      exception,
      carried: [],
    };
  }
  return {
    chasedBy: 'NONE',
    why: route.why,
    control:
      route.why === 'HANDED_TO_HOST'
        ? 'OFFERED'
        : route.why === 'SMS_OPTED_OUT'
          ? 'REFUSED_OPTED_OUT'
          : 'NONE',
    exception,
    carried: [],
  };
}

/**
 * [[GTC-335]] — THE GUEST FACTS RECORDED AFTER A GIVEN MOMENT, which the arrival replay's past must
 * not see. Built by `rewindGuestFacts` in `src/lib/glance/rewind.ts`, which is where every recorded
 * time is read; this module only SUBTRACTS, and learns no time.
 *
 * ⚠ THE GUEST'S SIDE ONLY, WHICH IS THE RULING. Founder, SCOPED 2026-10-01: *"Your own changes
 * (don't-chase marks, the reminders switch, exceptions) still never replay: Ruling 22 says your own
 * decisions aren't news to you."* So nothing here can reach `nudgeMark`, `chaseException`,
 * `chaseWhenNoMobileDefault`, a household, an address or a phone: those are read as they are now.
 */
export interface LaterFacts {
  /** `EmailOptOut` rows for this event recorded after the moment, by `personId`. */
  emailOptOutPersonIds: ReadonlySet<string>;
  /** `EmailBlock` addresses first seen after the moment, normalised as the block stores them. */
  blockAddresses: ReadonlySet<string>;
  /** `SmsOptOut` numbers in force, any host ([[GTC-288]]), recorded after the moment. */
  smsOptOutNumbers: ReadonlySet<string>;
  /** People whose `Person.smsOptedOut` flag was set after the moment. */
  smsFlagPersonIds: ReadonlySet<string>;
}

export interface AskPreview {
  event: {
    name: string;
    startDate: Date;
    venueName: string | null;
    occasionDescription: string | null;
  };
  hostName: string;
  /** False on events that predate [[GTC-256]] phase 2 and keep no host membership row. */
  hostIdentityResolved: boolean;
  storedAuthorLine: string | null;
  /** `User.email` of the host (ruling F). Null when the host has no `User` — decision 12, unanswered. */
  replyTo: string | null;
  recipients: PreviewRecipient[];
  hostList: HostListLine[];
  /** [[GTC-311]] — the chase, as the screen shows it. Read-only; the ask above does not depend on it. */
  chase: PreviewChase;
  /**
   * [[GTC-336]] Q2 — THE CHOOSER'S ASK ANSWER FOR EVERY MEMBERSHIP, keyed by `PersonEvent` id: the
   * route the walk below already computes, recorded rather than recomputed. The board reads it to
   * learn whose message carried a child's ask (`carrierOfAsk` in `src/lib/glance/delivery-fact.ts`),
   * so a child's red comes from the carrier the chooser names — the one the drain would carry the ask
   * with — and not from the household's contact. Nothing on the send side reads it.
   */
  askRoutes: Record<string, AskRoute>;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export async function readAskPreview(
  db: Db,
  eventId: string,
  baseUrl: string,
  /**
   * [[GTC-335]] — the arrival replay's past: the chooser's answer with these guest facts not yet
   * recorded. Absent everywhere else, and absent means today's preview, unchanged — the press, the
   * drain, the chase and the pre-flight never pass it.
   */
  options: { discount?: LaterFacts } = {}
): Promise<AskPreview | null> {
  const discount = options.discount ?? null;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      name: true,
      startDate: true,
      venueName: true,
      occasionDescription: true,
      hostId: true,
      askAuthorLine: true,
      chaseWhenNoMobileDefault: true,
      host: { select: { name: true, userId: true, user: { select: { email: true } } } },
    },
  });
  if (!event) return null;

  // GTC-294: the `Team.coordinatorId` query that used to be the fifth member of this tuple is
  // gone with it. It fed `coordinatorIds` in `linkOf`, and `linkOf` now keys on the membership
  // role — see the note there for why that is a correctness change and not a tidy-up.
  const [memberships, households, assignments, tokens] = await Promise.all([
    db.personEvent.findMany({
      where: { eventId },
      select: {
        id: true,
        personId: true,
        role: true,
        householdId: true,
        householdRole: true,
        nudgeMark: true,
        chaseException: true,
        person: {
          select: { name: true, email: true, phoneNumber: true, smsOptedOut: true, userId: true },
        },
      },
    }),
    db.household.findMany({
      where: { eventId },
      select: { id: true, contactPersonEventId: true, messagesMuted: true },
    }),
    // Names and kind only (GTC-187 decision 1): the message names the rows, the tap page carries
    // their logistics. No `kind` in the WHERE — the kind splits, it never filters.
    db.assignment.findMany({
      where: { item: { team: { eventId } } },
      select: { personId: true, item: { select: { name: true, kind: true } } },
      orderBy: { item: { name: 'asc' } },
    }),
    db.accessToken.findMany({
      where: { eventId, scope: 'PARTICIPANT' },
      select: { personId: true, token: true },
    }),
  ]);

  const phones = memberships.map((m) => m.person.phoneNumber).filter((n): n is string => !!n);
  const optedOutNumbers = new Set(
    (phones.length === 0
      ? []
      : (
          await db.smsOptOut.findMany({
            where: { phoneNumber: { in: phones }, ...SMS_OPT_OUT_IN_FORCE },
            select: { phoneNumber: true },
          })
        ).map((o) => o.phoneNumber)
    ).filter((n) => !discount?.smsOptOutNumbers.has(n))
  );

  /*
   * [[GTC-296]] — THE EMAIL WAY OUT, LOADED ONCE PER EVENT.
   *
   * ⚠ THE SAME SHAPE AS THE SMS SET DIRECTLY ABOVE, AND FOR THE SAME REASON. This walk is the
   * one `pressSend`, `drainOnce` and `enrolMiniSends` all run, so a per-person check here would
   * put the query count under the guest list's control. One query per event, whatever the roster.
   *
   * ⚠ AND IT IS SCOPED TO THIS EVENT, WHICH IS RULING 1. A set built for another event would
   * suppress the wrong people — the failure mode a per-host table would have had by design.
   */
  const emailOptedOutPersonIds = new Set(
    [...(await listEmailOptOutsForEvent(db, eventId))].filter(
      (id) => !discount?.emailOptOutPersonIds.has(id)
    )
  );

  /*
   * [[GTC-324]] ruling 2 / [[GTC-189]] slice 8a — THE ADDRESS-WIDE BLOCK, one query per event, the
   * same shape as the two sets above. Keyed on the address, so it reaches this event whichever event
   * the provider's refusal was learned from.
   */
  const emailBlocks = new Map(
    [
      ...(await listEmailBlocks(
        db,
        memberships.map((m) => m.person.email)
      )),
    ].filter(([address]) => !discount?.blockAddresses.has(address))
  );
  const blockStateOf = (email: string | null) => emailBlockStateOf(email, eventId, emailBlocks);

  const rowsByPerson = new Map<string, { itemNames: string[]; jobNames: string[] }>();
  for (const a of assignments) {
    const rows = rowsByPerson.get(a.personId) ?? { itemNames: [], jobNames: [] };
    (a.item.kind === 'TASK' ? rows.jobNames : rows.itemNames).push(a.item.name);
    rowsByPerson.set(a.personId, rows);
  }
  const rowsOf = (personId: string) => {
    const rows = rowsByPerson.get(personId);
    return { itemNames: [...(rows?.itemNames ?? [])], jobNames: [...(rows?.jobNames ?? [])] };
  };

  // [[GTC-311]]: typed for the CHASE, which is a superset of what the ask needs — `chooseAskRoute`
  // reads the same object and never the two chase fields.
  const chooserEvent: ChaseChooserEvent = {
    hostId: event.hostId,
    chaseWhenNoMobileDefault: event.chaseWhenNoMobileDefault,
    households,
    memberships: memberships.map((m) => ({
      id: m.id,
      personId: m.personId,
      role: m.role,
      householdId: m.householdId,
      householdRole: m.householdRole,
      nudgeMark: m.nudgeMark,
      chaseException: m.chaseException,
      // ⚠ A row of EITHER kind. A child holding only a job holds something — see the header.
      holdsItems: rowsByPerson.has(m.personId),
      person: {
        email: m.person.email,
        phoneNumber: m.person.phoneNumber,
        // [[GTC-301]] — either fact; see the header and `smsOptedOutFact` above, which is the
        // one definition of the merge and is what the bounce door asks as well.
        smsOptedOut: smsOptedOutFact(
          {
            phoneNumber: m.person.phoneNumber,
            // [[GTC-335]] — the flag, less one recorded after the replay's `since`.
            smsOptedOut: m.person.smsOptedOut && !discount?.smsFlagPersonIds.has(m.personId),
          },
          optedOutNumbers
        ),
        // [[GTC-296]] ruling 1 — per event, and this set is this event's.
        emailOptedOut: emailOptedOutFact(m.personId, emailOptedOutPersonIds),
        // [[GTC-324]] rulings 2 and 1 — the block, and whether THIS event's message was reported.
        emailBlocked: blockStateOf(m.person.email) !== 'NONE',
        emailReported: blockStateOf(m.person.email) === 'REPORTED',
      },
    })),
  };

  const hostUserId = event.host?.userId ?? null;
  const isHost = (m: (typeof memberships)[number]) =>
    isHostMembership(m, event.hostId) || (hostUserId !== null && m.person.userId === hostUserId);

  const tokenByPerson = new Map(tokens.map((t) => [t.personId, t.token]));
  /**
   * ⚠ THIS MIRRORS `ensureEventTokens`, AND [[GTC-294]] IS WHY THE MIRROR IS NAMED.
   *
   * Nothing here issues anything; this function reports the state the press will leave. But
   * it restates step 4's rule, and a restatement drifts. GTC-294 moved issuance and this had
   * to move with it or the screen would have gone on telling the host a coordinator gets no
   * link while the database handed her one.
   *
   * SO IT KEYS ON THE ROLE, exactly as step 4b does, and `coordinatorIds` is gone from here
   * too. Keyed on `coordinatorIds` — which is built without a role filter and so contains a
   * host who is a team's `coordinatorId` — this would have reported her AT_PRESS, promising
   * the host a guest link for the one person GTC-256 Ruling 5 guarantees will never have one.
   * She is caught above as a carrier, and that ordering is load-bearing rather than incidental.
   */
  const linkOf = (
    m: (typeof memberships)[number],
    hostAsCarrier: boolean
  ): { link: string | null; linkState: LinkState } => {
    if (hostAsCarrier) return { link: null, linkState: 'NONE_HOST_CARRIER' };
    const token = tokenByPerson.get(m.personId);
    if (token) return { link: buildTokenUrl(baseUrl, 'PARTICIPANT', token), linkState: 'READY' };
    if (m.role === 'PARTICIPANT' || m.role === 'COORDINATOR') {
      return { link: null, linkState: 'AT_PRESS' };
    }
    return { link: null, linkState: 'NONE_NOT_ISSUED' };
  };

  const byId = new Map(memberships.map((m) => [m.id, m]));
  const recipients = new Map<string, PreviewRecipient>();
  const recipientFor = (m: (typeof memberships)[number], channel: Channel) => {
    const existing = recipients.get(m.id);
    if (existing) return existing;
    const hostAsCarrier = isHost(m);
    const created: PreviewRecipient = {
      personEventId: m.id,
      personId: m.personId,
      name: m.person.name,
      channel,
      hostAsCarrier,
      itemNames: [],
      jobNames: [],
      carried: [],
      ...linkOf(m, hostAsCarrier),
      emailNote:
        channel === 'TEXT' && blockStateOf(m.person.email) !== 'NONE'
          ? emailNoteFor({
              state: blockStateOf(m.person.email),
              textable: true,
              smsOptedOut: false,
            })
          : null,
    };
    recipients.set(m.id, created);
    return created;
  };

  const hostList: HostListLine[] = [];
  const askRoutes: Record<string, AskRoute> = {};

  for (const subject of chooserEvent.memberships) {
    const m = byId.get(subject.id)!;
    const route = chooseAskRoute(subject, chooserEvent);
    askRoutes[subject.id] = route;

    if (route.kind === 'NOT_A_RECIPIENT') continue;

    if (route.kind === 'DIRECT') {
      if (isHost(m)) continue;
      Object.assign(recipientFor(m, route.channel), rowsOf(m.personId));
      continue;
    }

    if (route.kind === 'CARRIED') {
      recipientFor(byId.get(route.recipientId)!, route.channel).carried.push({
        personEventId: m.id,
        name: m.person.name,
        firstName: firstNameOf(m.person.name),
        ...rowsOf(m.personId),
      });
      continue;
    }

    if (isHost(m)) continue;
    hostList.push({
      personEventId: m.id,
      personId: m.personId,
      name: m.person.name,
      child: !isMessageableRole(m.householdRole),
      why: route.why,
      ...rowsOf(m.personId),
      carrierName: route.carrierId ? (byId.get(route.carrierId)?.person.name ?? null) : null,
    });
  }

  const recipientList = [...recipients.values()].sort(byName);
  for (const r of recipientList) r.carried.sort(byName);

  /*
   * [[GTC-311]] — THE CHASE, READ BESIDE THE ASK AND NEVER THROUGH IT.
   *
   * A second walk rather than a branch in the loop above, so nothing about the ask can come to
   * depend on it. Pure: no query beyond the two columns the selects above already carry.
   */
  const subjectById = new Map(chooserEvent.memberships.map((m) => [m.id, m]));
  const byRecipient: Record<string, RecipientChase> = {};
  for (const r of recipientList) {
    const subject = subjectById.get(r.personEventId)!;
    byRecipient[r.personEventId] = recipientChaseOf(
      chooseChaseRoute(subject, chooserEvent),
      subject.chaseException
    );
  }

  // [[GTC-189]] slice 8b, ruling R — which children each recipient carries for the CHASE. Asked of
  // the chooser per child, never inferred from the ask's carried list: the two can differ (the
  // child's own mark stops the chase and not the ask).
  for (const subject of chooserEvent.memberships) {
    if (isMessageableRole(subject.householdRole)) continue;
    const route = chooseChaseRoute(subject, chooserEvent);
    if (route.kind === 'CARRIED') byRecipient[route.recipientId]?.carried.push(subject.id);
  }

  const notChased: NotChasedLine[] = [];
  const byMembership: Record<string, ChaseRoute> = {};
  for (const subject of chooserEvent.memberships) {
    const m = byId.get(subject.id)!;
    if (isHost(m)) continue;
    // [[GTC-305]] — asked of the chooser BEFORE the ask-route skip below, so a guest now on the
    // host's list still has her chase answer. One call, recorded, then filtered for group B.
    const chase = chooseChaseRoute(subject, chooserEvent);
    byMembership[subject.id] = chase;
    const ask = chooseAskRoute(subject, chooserEvent);
    // Asked: the ask reaches them, directly or carried. Group A already holds everyone else.
    if (ask.kind !== 'DIRECT' && ask.kind !== 'CARRIED') continue;
    if (chase.kind !== 'NONE' || NOT_ON_GROUP_B.has(chase.why)) continue;
    notChased.push({
      personEventId: m.id,
      personId: m.personId,
      name: m.person.name,
      child: !isMessageableRole(m.householdRole),
      why: chase.why,
      ...rowsOf(m.personId),
      carrierName: chase.carrierId ? (byId.get(chase.carrierId)?.person.name ?? null) : null,
    });
  }

  return {
    event: {
      name: event.name,
      startDate: event.startDate,
      venueName: event.venueName,
      occasionDescription: event.occasionDescription,
    },
    hostName: event.host?.name?.trim() || HOST_NAME_FALLBACK,
    hostIdentityResolved: memberships.some(isHost),
    storedAuthorLine: event.askAuthorLine,
    replyTo: event.host?.user?.email ?? null,
    recipients: recipientList,
    hostList: hostList.sort(byName),
    askRoutes,
    chase: {
      stored: event.chaseWhenNoMobileDefault,
      resolved: resolveChaseWhenNoMobile({
        exception: null,
        eventDefault: event.chaseWhenNoMobileDefault,
      }),
      byRecipient,
      notChased: notChased.sort(byName),
      byMembership,
    },
  };
}
