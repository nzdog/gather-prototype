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
 * caller to name: opted out if EITHER `Person.smsOptedOut` is true OR an `SmsOptOut` row exists
 * for the person's number under THIS event's host. The row is read per host because that is what
 * `checkOptOut` in `sendSms` refuses on today; the flag because the manual nudge and the wrap-up
 * read it. So the preview never shows a text that either gate would refuse.
 * PER HOST BY FOUNDER RULING, not inherited (GTC-189 slice 3 answer 1): "GTC-288 rules it
 * account-wide and owns the change; building 288's answer before 288 exists means two places to
 * correct later." The widening is [[GTC-288]]'s, and the suite's `[GTC-301]` assertions move with it.
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
  type Channel,
  type ChooserEvent,
  type HostListWhy,
} from '@/lib/eligibility/channel-chooser';
import { isMessageableRole } from '@/lib/eligibility/child-exclusion';
import { isHostMembership } from '@/lib/eligibility/host-exclusion';
import { HOST_NAME_FALLBACK, firstNameOf } from '@/lib/messages/ask-register';
import { buildTokenUrl } from '@/lib/tokens';

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
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export async function readAskPreview(
  db: Db,
  eventId: string,
  baseUrl: string
): Promise<AskPreview | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      name: true,
      startDate: true,
      venueName: true,
      occasionDescription: true,
      hostId: true,
      askAuthorLine: true,
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
    phones.length === 0
      ? []
      : (
          await db.smsOptOut.findMany({
            where: { hostId: event.hostId, phoneNumber: { in: phones } },
            select: { phoneNumber: true },
          })
        ).map((o) => o.phoneNumber)
  );

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

  const chooserEvent: ChooserEvent = {
    hostId: event.hostId,
    households,
    memberships: memberships.map((m) => ({
      id: m.id,
      personId: m.personId,
      role: m.role,
      householdId: m.householdId,
      householdRole: m.householdRole,
      nudgeMark: m.nudgeMark,
      // ⚠ A row of EITHER kind. A child holding only a job holds something — see the header.
      holdsItems: rowsByPerson.has(m.personId),
      person: {
        email: m.person.email,
        phoneNumber: m.person.phoneNumber,
        // [[GTC-301]] — either fact; see the header.
        smsOptedOut:
          m.person.smsOptedOut ||
          (!!m.person.phoneNumber && optedOutNumbers.has(m.person.phoneNumber)),
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
    };
    recipients.set(m.id, created);
    return created;
  };

  const hostList: HostListLine[] = [];

  for (const subject of chooserEvent.memberships) {
    const m = byId.get(subject.id)!;
    const route = chooseAskRoute(subject, chooserEvent);

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
  };
}
