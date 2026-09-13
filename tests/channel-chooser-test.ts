/**
 * GTC-189 slice 1 — the channel chooser, asserted with no database, no server and no clock.
 *
 * WHAT THIS SUITE IS FOR. `chooseAskRoute` and `chooseChaseRoute` in
 * `src/lib/eligibility/channel-chooser.ts` decide, per person, how the ask and the chase reach
 * them. They replace `PersonEvent.contactMethod` as the recipient decision (GTC-189 ruling C),
 * and once wired the preview and the senders call the same two functions.
 *
 * THE ASK AND THE CHASE ARE ASSERTED SEPARATELY FOR EVERY CASE, because they invert: the ask
 * prefers email and the chase prefers text (THE ASK and THE CHASE, 2026-09-13). A suite that
 * asserted one and inferred the other would pass a chooser that had the inversion backwards.
 *
 * SIX LAYERS
 *   M  the matrix — email only, phone only, both, neither, a child, a child in the host's
 *      household, don't-chase, an opted-out phone, a non-NZ number, the host
 *   C  children, carriers, and the host as carrier (rulings A, A2, R)
 *   P  purity — frozen inputs, repeatability, roster order
 *   S  structure — the gates are imported from their modules, not copied; nothing stored is read
 *   I  isolation — nothing imports the chooser yet
 *   T  types — a row missing `nudgeMark` or `smsOptedOut` does not typecheck
 *
 * LABELS THAT TIE AN ASSERTION TO A RECORD, so a later ruling or fix knows which assertions it moves:
 *   [D15-narrow]              pins the NARROW reading of ruling P — a person with no phone is
 *                             chased by email. The wide reading would make each of these NONE.
 *                             ⚠ Decision 15 is OPEN; these are built, not answered.
 *   [RULED slice 1 answer n]  a reading slice 1 reported and the founder ruled on — GTC-189,
 *                             "Founder answers — the slice 1 flags".
 *   [DEFECT GTC-nnn]          pinned as built against a filed defect; expected to change when
 *                             that ticket is fixed, and nowhere else.
 *
 * Run: npx tsx tests/channel-chooser-test.ts
 * Reads no database. Writes three probe files to a temp directory and deletes them.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  chooseAskRoute,
  chooseChaseRoute,
  type AskRoute,
  type Channel,
  type ChaseNoneWhy,
  type ChaseRoute,
  type ChooserEvent,
  type ChooserHousehold,
  type ChooserMembership,
  type HostListWhy,
  type NotRecipientWhy,
} from '../src/lib/eligibility/channel-chooser';

const ROOT = join(__dirname, '..');
const MODULE_REL = 'src/lib/eligibility/channel-chooser.ts';
const SELF_REL = 'tests/channel-chooser-test.ts';

let passed = 0;
let failed = 0;
const red: string[] = [];

function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
    red.push(`[${layer}] ${label}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** A throw yields `undefined`, which equals no expected route — so at RED every behavioural
 *  assertion fails on its own line instead of the suite crashing once. */
function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function expectRoute(layer: string, label: string, actual: unknown, expected: unknown) {
  assert(
    layer,
    label,
    isDeepStrictEqual(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${actual === undefined ? 'a throw' : JSON.stringify(actual)}`
  );
}

/** Source with comments stripped — naming a thing in prose must not read as using it
 *  (GTC-264 phase 2, finding 2). String literals are kept: an import specifier is one. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — one event, one roster. Frozen, so a chooser that mutates its input throws.
// ─────────────────────────────────────────────────────────────────────────────

const HOST_ID = 'person-kate';
const NZ = '+64211234567';
const LONDON = '+447700900123';
const SYDNEY = '+61412345678';
const mail = (name: string) => `${name}@example.com`;

type MemberPatch = Partial<Omit<ChooserMembership, 'person'>> & {
  person?: Partial<ChooserMembership['person']>;
};

function member(id: string, patch: MemberPatch = {}): ChooserMembership {
  const { person, ...rest } = patch;
  return {
    id,
    personId: `person-${id}`,
    role: 'PARTICIPANT',
    householdId: null,
    householdRole: null,
    nudgeMark: null,
    holdsItems: true,
    ...rest,
    person: { email: null, phoneNumber: null, smsOptedOut: false, ...person },
  };
}

function household(id: string, patch: Partial<ChooserHousehold> = {}): ChooserHousehold {
  return { id, contactPersonEventId: null, messagesMuted: null, ...patch };
}

const MEMBERS: ChooserMembership[] = [
  // The host's own household. GTC-256 Ruling 7 makes her its PRIMARY_CONTACT.
  member('kate', {
    personId: HOST_ID,
    role: 'HOST',
    householdId: 'hh-kate',
    householdRole: 'PRIMARY_CONTACT',
    person: { email: mail('kate'), phoneNumber: NZ },
  }),
  member('dan', {
    householdId: 'hh-kate',
    householdRole: 'PARTNER',
    person: { email: mail('dan'), phoneNumber: NZ },
  }),
  // Children carry contact details of their own, so no pass can come from the data.
  member('mia', {
    householdId: 'hh-kate',
    householdRole: 'CHILD',
    person: { email: mail('mia'), phoneNumber: NZ },
  }),

  // An ordinary household.
  member('sarah', {
    householdId: 'hh-sarah',
    householdRole: 'PRIMARY_CONTACT',
    person: { email: mail('sarah'), phoneNumber: NZ },
  }),
  member('ollie', {
    householdId: 'hh-sarah',
    householdRole: 'CHILD',
    person: { email: mail('ollie'), phoneNumber: NZ },
  }),
  member('lily', { householdId: 'hh-sarah', householdRole: 'CHILD', holdsItems: false }),
  member('ruby', { householdId: 'hh-sarah', householdRole: 'CHILD', nudgeMark: 'DONT_CHASE' }),

  // Ruling A2: a household that picked the host as its contact.
  member('grandad', { householdId: 'hh-grandad', householdRole: 'PRIMARY_CONTACT' }),
  member('noah', { householdId: 'hh-grandad', householdRole: 'CHILD' }),

  // Cross-household pick (GTC-172): Grandma's household picked Sarah.
  member('grandma', { householdId: 'hh-grandma', householdRole: 'PRIMARY_CONTACT' }),
  member('ben', { householdId: 'hh-grandma', householdRole: 'CHILD' }),

  // Carriers with narrower channels.
  member('emma', {
    householdId: 'hh-emma',
    householdRole: 'PRIMARY_CONTACT',
    person: { email: mail('emma') },
  }),
  member('jack', { householdId: 'hh-emma', householdRole: 'CHILD' }),
  member('pita', {
    householdId: 'hh-pita',
    householdRole: 'PRIMARY_CONTACT',
    person: { phoneNumber: NZ },
  }),
  member('aroha', { householdId: 'hh-pita', householdRole: 'CHILD' }),
  member('ned', { householdId: 'hh-ned', householdRole: 'PRIMARY_CONTACT' }),
  member('finn', { householdId: 'hh-ned', householdRole: 'CHILD' }),
  member('olga', {
    householdId: 'hh-olga',
    householdRole: 'PRIMARY_CONTACT',
    person: { email: mail('olga'), phoneNumber: NZ, smsOptedOut: true },
  }),
  member('ivy', { householdId: 'hh-olga', householdRole: 'CHILD' }),
  member('dora', {
    householdId: 'hh-dora',
    householdRole: 'PRIMARY_CONTACT',
    nudgeMark: 'DONT_CHASE',
    person: { email: mail('dora'), phoneNumber: NZ },
  }),
  member('max', { householdId: 'hh-dora', householdRole: 'CHILD' }),
  member('liam', {
    householdId: 'hh-liam',
    householdRole: 'PRIMARY_CONTACT',
    person: { email: mail('liam'), phoneNumber: LONDON },
  }),
  member('ella', { householdId: 'hh-liam', householdRole: 'CHILD' }),

  // Households whose channel does not resolve to a sending adult of this event.
  member('rob', {
    householdId: 'hh-muted',
    householdRole: 'PRIMARY_CONTACT',
    person: { email: mail('rob'), phoneNumber: NZ },
  }),
  member('zoe', { householdId: 'hh-muted', householdRole: 'CHILD' }),
  member('paul', {
    householdId: 'hh-badpick',
    householdRole: 'PRIMARY_CONTACT',
    person: { email: mail('paul'), phoneNumber: NZ },
  }),
  member('tom', { householdId: 'hh-badpick', householdRole: 'CHILD' }),
  member('gus', {
    householdId: 'hh-ghost',
    householdRole: 'PRIMARY_CONTACT',
    person: { email: mail('gus') },
  }),
  member('amy', { householdId: 'hh-ghost', householdRole: 'CHILD' }),
  member('kit', { householdId: 'hh-kids-only', householdRole: 'CHILD' }),
  member('orphan', { householdRole: 'CHILD' }),

  // A co-host: a role HOST row that is not Event.hostId.
  member('cohost', { role: 'HOST', person: { email: mail('cohost'), phoneNumber: NZ } }),

  // Adults added by name, no household — householdRole NULL, as people/route.ts leaves it.
  member('e-only', { person: { email: mail('e-only') } }),
  member('p-only', { person: { phoneNumber: NZ } }),
  member('both', { person: { email: mail('both'), phoneNumber: NZ } }),
  member('neither'),
  member('guest', { householdRole: 'GUEST', person: { email: mail('guest'), phoneNumber: NZ } }),
  member('dc-both', {
    nudgeMark: 'DONT_CHASE',
    person: { email: mail('dc-both'), phoneNumber: NZ },
  }),
  member('dc-email', { nudgeMark: 'DONT_CHASE', person: { email: mail('dc-email') } }),
  member('dc-phone', { nudgeMark: 'DONT_CHASE', person: { phoneNumber: NZ } }),
  member('dc-neither', { nudgeMark: 'DONT_CHASE' }),
  member('gentle', { nudgeMark: 'GENTLE', person: { email: mail('gentle'), phoneNumber: NZ } }),
  member('oo-email', { person: { email: mail('oo-email'), phoneNumber: NZ, smsOptedOut: true } }),
  member('oo-only', { person: { phoneNumber: NZ, smsOptedOut: true } }),
  member('oo-dc', {
    nudgeMark: 'DONT_CHASE',
    person: { email: mail('oo-dc'), phoneNumber: NZ, smsOptedOut: true },
  }),
  member('oo-no-phone', { person: { email: mail('oo-no-phone'), smsOptedOut: true } }),
  member('ldn-email', { person: { email: mail('ldn-email'), phoneNumber: LONDON } }),
  member('ldn-only', { person: { phoneNumber: LONDON } }),
  member('ldn-dc', { nudgeMark: 'DONT_CHASE', person: { phoneNumber: LONDON } }),
  member('syd-only', { person: { phoneNumber: SYDNEY } }),
  member('walt', { holdsItems: false, person: { email: mail('walt') } }),
  member('cora', { role: 'COORDINATOR', holdsItems: false, person: { phoneNumber: NZ } }),
];

const HOUSEHOLDS: ChooserHousehold[] = [
  household('hh-kate'),
  household('hh-sarah'),
  household('hh-grandad', { contactPersonEventId: 'kate' }),
  household('hh-grandma', { contactPersonEventId: 'sarah' }),
  household('hh-emma'),
  household('hh-pita'),
  household('hh-ned'),
  household('hh-olga'),
  household('hh-dora'),
  household('hh-liam'),
  household('hh-muted', { messagesMuted: true }),
  household('hh-badpick', { contactPersonEventId: 'ollie' }),
  household('hh-ghost', { contactPersonEventId: 'not-in-this-event' }),
  household('hh-kids-only'),
];

const EVENT: ChooserEvent = deepFreeze({
  hostId: HOST_ID,
  memberships: MEMBERS,
  households: HOUSEHOLDS,
});

/** A copy of the event with some rows changed — frozen like the original. */
function variant(patch: {
  members?: Record<string, MemberPatch>;
  households?: Record<string, Partial<ChooserHousehold>>;
}): ChooserEvent {
  return deepFreeze({
    hostId: EVENT.hostId,
    memberships: EVENT.memberships.map((row) => {
      const p = patch.members?.[row.id];
      if (!p) return row;
      const { person, ...rest } = p;
      return { ...row, ...rest, person: { ...row.person, ...person } };
    }),
    households: EVENT.households.map((row) => ({ ...row, ...patch.households?.[row.id] })),
  });
}

const direct = (channel: Channel, id: string): AskRoute & ChaseRoute => ({
  kind: 'DIRECT',
  channel,
  recipientId: id,
});
const carried = (channel: Channel, carrierId: string): AskRoute & ChaseRoute => ({
  kind: 'CARRIED',
  channel,
  recipientId: carrierId,
});
const hostList = (why: HostListWhy, carrierId?: string): AskRoute =>
  carrierId ? { kind: 'HOST_LIST', why, carrierId } : { kind: 'HOST_LIST', why };
const notRecipient = (why: NotRecipientWhy): AskRoute => ({ kind: 'NOT_A_RECIPIENT', why });
const none = (why: ChaseNoneWhy, carrierId?: string): ChaseRoute =>
  carrierId ? { kind: 'NONE', why, carrierId } : { kind: 'NONE', why };

interface Case {
  id: string;
  label: string;
  ask: AskRoute;
  chase: ChaseRoute;
  event?: ChooserEvent;
}

function subjectOf(id: string, event: ChooserEvent): ChooserMembership {
  const row = event.memberships.find((m) => m.id === id);
  if (!row) throw new Error(`fixture has no membership ${id}`);
  return row;
}

function runCases(layer: string, cases: Case[]) {
  for (const c of cases) {
    const event = c.event ?? EVENT;
    const subject = subjectOf(c.id, event);
    expectRoute(
      layer,
      `${c.label} — ASK`,
      attempt(() => chooseAskRoute(subject, event)),
      c.ask
    );
    expectRoute(
      layer,
      `${c.label} — CHASE`,
      attempt(() => chooseChaseRoute(subject, event)),
      c.chase
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('Layer M: the matrix — ask and chase, each asserted');
// ─────────────────────────────────────────────────────────────────────────────

runCases('M', [
  {
    id: 'e-only',
    label: 'email only: asked by email, chased by email [D15-narrow]',
    ask: direct('EMAIL', 'e-only'),
    chase: direct('EMAIL', 'e-only'),
  },
  {
    id: 'p-only',
    label: 'phone only: asked by text, chased by text',
    ask: direct('TEXT', 'p-only'),
    chase: direct('TEXT', 'p-only'),
  },
  {
    id: 'both',
    label: 'both: asked by EMAIL, chased by TEXT — the inversion',
    ask: direct('EMAIL', 'both'),
    chase: direct('TEXT', 'both'),
  },
  {
    id: 'neither',
    label: "neither: a line on the host's list, and not chased",
    ask: hostList('NO_CHANNEL'),
    chase: none('NO_CHANNEL'),
  },
  {
    id: 'guest',
    label: 'a GUEST household role is an adult like a NULL one',
    ask: direct('EMAIL', 'guest'),
    chase: direct('TEXT', 'guest'),
  },
  {
    id: 'ollie',
    label: "a child: carried by their household's contact, their own phone and email ignored",
    ask: carried('EMAIL', 'sarah'),
    chase: carried('TEXT', 'sarah'),
  },
  {
    id: 'mia',
    label: "a child in the host's own household: her list, and she is not chased about them",
    ask: hostList('HOST_HOUSEHOLD_CHILD'),
    chase: none('HOST_HOUSEHOLD_CHILD'),
  },
  {
    id: 'dc-both',
    label: "don't-chase with both: the ask still goes (ruling T), the chase does not",
    ask: direct('EMAIL', 'dc-both'),
    chase: none('MARKED_DONT_CHASE'),
  },
  {
    id: 'dc-email',
    label: "don't-chase with email only: the mark stops the email leg too",
    ask: direct('EMAIL', 'dc-email'),
    chase: none('MARKED_DONT_CHASE'),
  },
  {
    id: 'dc-phone',
    label: "don't-chase with phone only: asked by text, not chased",
    ask: direct('TEXT', 'dc-phone'),
    chase: none('MARKED_DONT_CHASE'),
  },
  {
    id: 'dc-neither',
    label: "don't-chase and unreachable: on the list for the ask; the mark names the chase's why",
    ask: hostList('NO_CHANNEL'),
    chase: none('MARKED_DONT_CHASE'),
  },
  {
    id: 'gentle',
    label: 'GENTLE is a cadence, not a suppression: chased by text',
    ask: direct('EMAIL', 'gentle'),
    chase: direct('TEXT', 'gentle'),
  },
  {
    id: 'oo-email',
    label: 'opted-out phone with email: asked by email, NOT chased by email (ruling O)',
    ask: direct('EMAIL', 'oo-email'),
    chase: none('SMS_OPTED_OUT'),
  },
  {
    id: 'oo-only',
    label: "opted-out phone only: the host's list, not chased",
    ask: hostList('SMS_OPTED_OUT'),
    chase: none('SMS_OPTED_OUT'),
  },
  {
    id: 'oo-dc',
    label: "opted out AND don't-chase: opt-out names the why (Zone 7 before the mark)",
    ask: direct('EMAIL', 'oo-dc'),
    chase: none('SMS_OPTED_OUT'),
  },
  {
    id: 'oo-no-phone',
    label: 'opted out with the number since removed: the refusal stands (ruling O)',
    ask: direct('EMAIL', 'oo-no-phone'),
    chase: none('SMS_OPTED_OUT'),
  },
  {
    id: 'ldn-email',
    label: 'London number with email: asked by email, NOT chased by email (ruling P)',
    ask: direct('EMAIL', 'ldn-email'),
    chase: none('PHONE_UNUSABLE'),
  },
  {
    id: 'ldn-only',
    label: "London number only: the host's list, not chased [RULED slice 1 answer 2]",
    ask: hostList('PHONE_UNUSABLE'),
    chase: none('PHONE_UNUSABLE'),
  },
  {
    id: 'ldn-dc',
    label: "London number and don't-chase: the mark names the chase's why",
    ask: hostList('PHONE_UNUSABLE'),
    chase: none('MARKED_DONT_CHASE'),
  },
  {
    id: 'syd-only',
    label: 'Sydney number only: unusable while isValidNZNumber rejects +61 [DEFECT GTC-300]',
    ask: hostList('PHONE_UNUSABLE'),
    chase: none('PHONE_UNUSABLE'),
  },
  {
    id: 'kate',
    label: 'the host, holding items with both channels: no ask of her own, no chase',
    ask: notRecipient('HOST_OWN_ASK'),
    chase: none('HOST_OWN_ASK'),
  },
  {
    id: 'walt',
    label: 'an itemless adult is asked (GTC-187 decision 8) [D15-narrow] [RULED slice 1 answer 4]',
    ask: direct('EMAIL', 'walt'),
    chase: direct('EMAIL', 'walt'),
  },
  {
    id: 'cora',
    label: 'an itemless coordinator is routed like any adult [RULED slice 1 answer 4]',
    ask: direct('TEXT', 'cora'),
    chase: direct('TEXT', 'cora'),
  },
]);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer C: children, carriers, and the host as carrier');
// ─────────────────────────────────────────────────────────────────────────────

runCases('C', [
  {
    id: 'lily',
    label: 'a child holding nothing is not a recipient and not a line',
    ask: notRecipient('CHILD_WITHOUT_ITEM'),
    chase: none('CHILD_WITHOUT_ITEM'),
  },
  {
    id: 'mia',
    label: "a child of the host's household holding nothing is not a line on her list",
    event: variant({ members: { mia: { holdsItems: false } } }),
    ask: notRecipient('CHILD_WITHOUT_ITEM'),
    chase: none('CHILD_WITHOUT_ITEM'),
  },
  {
    id: 'mia',
    label: "the host's household picked Dan and switched messages on: Mia is still hers",
    event: variant({
      households: { 'hh-kate': { contactPersonEventId: 'dan', messagesMuted: false } },
    }),
    ask: hostList('HOST_HOUSEHOLD_CHILD'),
    chase: none('HOST_HOUSEHOLD_CHILD'),
  },
  {
    id: 'dan',
    label: "an adult of the host's household is messaged individually, not through her",
    ask: direct('EMAIL', 'dan'),
    chase: direct('TEXT', 'dan'),
  },
  {
    id: 'ruby',
    label: "a child marked don't-chase: the ask is carried, the chase is not",
    ask: carried('EMAIL', 'sarah'),
    chase: none('MARKED_DONT_CHASE'),
  },
  {
    id: 'ben',
    label: "a cross-household pick: Grandma's household's child is carried by Sarah",
    ask: carried('EMAIL', 'sarah'),
    chase: carried('TEXT', 'sarah'),
  },
  {
    id: 'grandma',
    label: 'but Grandma herself, with no channel, is a line on the list — not carried (THE ASK)',
    ask: hostList('NO_CHANNEL'),
    chase: none('NO_CHANNEL'),
  },
  {
    id: 'jack',
    label: 'carrier with email only: carried and chased by email [D15-narrow]',
    ask: carried('EMAIL', 'emma'),
    chase: carried('EMAIL', 'emma'),
  },
  {
    id: 'aroha',
    label: 'carrier with phone only: carried and chased by text',
    ask: carried('TEXT', 'pita'),
    chase: carried('TEXT', 'pita'),
  },
  {
    id: 'finn',
    label: "carrier with neither: the child's item is on the list, naming the carrier",
    ask: hostList('NO_CHANNEL', 'ned'),
    chase: none('NO_CHANNEL', 'ned'),
  },
  {
    id: 'ivy',
    label: 'carrier opted out of texts: carried by email, not chased by email (O through R)',
    ask: carried('EMAIL', 'olga'),
    chase: none('SMS_OPTED_OUT', 'olga'),
  },
  {
    id: 'max',
    label: "carrier marked don't-chase: carried, not chased",
    ask: carried('EMAIL', 'dora'),
    chase: none('MARKED_DONT_CHASE', 'dora'),
  },
  {
    id: 'ella',
    label: 'carrier with a London number and email: carried by email, not chased (P through R)',
    ask: carried('EMAIL', 'liam'),
    chase: none('PHONE_UNUSABLE', 'liam'),
  },
  {
    id: 'zoe',
    label: 'household messages switched off: the child is on the list [RULED slice 1 answer 5]',
    ask: hostList('HOUSEHOLD_MUTED'),
    chase: none('HOUSEHOLD_MUTED'),
  },
  {
    id: 'tom',
    label: 'a picked contact that is a CHILD fails closed',
    ask: hostList('NO_CARRIER'),
    chase: none('NO_CARRIER'),
  },
  {
    id: 'tom',
    label: "no carrier AND marked don't-chase: the mark names the chase's why",
    event: variant({ members: { tom: { nudgeMark: 'DONT_CHASE' } } }),
    ask: hostList('NO_CARRIER'),
    chase: none('MARKED_DONT_CHASE'),
  },
  {
    id: 'amy',
    label: 'a picked contact outside this event fails closed',
    ask: hostList('NO_CARRIER'),
    chase: none('NO_CARRIER'),
  },
  {
    id: 'kit',
    label: 'a household with no adult fails closed',
    ask: hostList('NO_CARRIER'),
    chase: none('NO_CARRIER'),
  },
  {
    id: 'orphan',
    label: 'a child with no household fails closed',
    ask: hostList('NO_CARRIER'),
    chase: none('NO_CARRIER'),
  },

  // Ruling A2 — the one case in the model where the host receives an ask.
  {
    id: 'noah',
    label: 'A2: carried to the host, and she is not chased about it [RULED slice 1 answer 1]',
    ask: carried('EMAIL', 'kate'),
    chase: none('HOST_AS_CARRIER', 'kate'),
  },
  {
    id: 'kate',
    label: 'A2: while she carries Noah, her own ask is still not produced',
    ask: notRecipient('HOST_OWN_ASK'),
    chase: none('HOST_OWN_ASK'),
  },
  {
    id: 'grandad',
    label: 'A2: the adult of a household she is contact for is NOT carried to her',
    ask: hostList('NO_CHANNEL'),
    chase: none('NO_CHANNEL'),
  },
  {
    id: 'noah',
    label: "A2: that household's messages switched off — not carried to her",
    event: variant({ households: { 'hh-grandad': { messagesMuted: true } } }),
    ask: hostList('HOUSEHOLD_MUTED'),
    chase: none('HOUSEHOLD_MUTED'),
  },
  {
    id: 'noah',
    label: 'A2: the child holds nothing — nothing carried to her',
    event: variant({ members: { noah: { holdsItems: false } } }),
    ask: notRecipient('CHILD_WITHOUT_ITEM'),
    chase: none('CHILD_WITHOUT_ITEM'),
  },
  {
    id: 'kate',
    label: "Ruling 5 keys on Event.hostId: the host's row with its role rewritten is still hers",
    event: variant({ members: { kate: { role: 'PARTICIPANT' } } }),
    ask: notRecipient('HOST_OWN_ASK'),
    chase: none('HOST_OWN_ASK'),
  },
  {
    id: 'cohost',
    label: 'a role HOST row that is not Event.hostId is not a recipient either',
    ask: notRecipient('HOST_OWN_ASK'),
    chase: none('HOST_OWN_ASK'),
  },
]);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer P: purity');
// ─────────────────────────────────────────────────────────────────────────────

assert(
  'P',
  'CONTROL: the fixture really is frozen, so a mutating chooser would throw',
  Object.isFrozen(EVENT.memberships) && Object.isFrozen(EVENT.memberships[0].person)
);

const everyId = EVENT.memberships.map((m) => m.id);

assert(
  'P',
  'neither function throws on any frozen member of the roster',
  everyId.every((id) => {
    const s = subjectOf(id, EVENT);
    return (
      attempt(() => chooseAskRoute(s, EVENT)) !== undefined &&
      attempt(() => chooseChaseRoute(s, EVENT)) !== undefined
    );
  })
);

assert(
  'P',
  'the same input gives the same route, twice, for every member',
  everyId.every((id) => {
    const s = subjectOf(id, EVENT);
    const a1 = attempt(() => chooseAskRoute(s, EVENT));
    const a2 = attempt(() => chooseAskRoute(s, EVENT));
    const c1 = attempt(() => chooseChaseRoute(s, EVENT));
    const c2 = attempt(() => chooseChaseRoute(s, EVENT));
    return (
      a1 !== undefined && c1 !== undefined && isDeepStrictEqual(a1, a2) && isDeepStrictEqual(c1, c2)
    );
  })
);

const REVERSED: ChooserEvent = deepFreeze({
  hostId: EVENT.hostId,
  memberships: [...EVENT.memberships].reverse(),
  households: [...EVENT.households].reverse(),
});

assert(
  'P',
  'roster order does not change any route',
  everyId.every((id) => {
    const s = subjectOf(id, EVENT);
    const ask = attempt(() => chooseAskRoute(s, EVENT));
    const chase = attempt(() => chooseChaseRoute(s, EVENT));
    return (
      ask !== undefined &&
      chase !== undefined &&
      isDeepStrictEqual(
        ask,
        attempt(() => chooseAskRoute(s, REVERSED))
      ) &&
      isDeepStrictEqual(
        chase,
        attempt(() => chooseChaseRoute(s, REVERSED))
      )
    );
  })
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer S: structure — the gates are called, and nothing stored is read');
// ─────────────────────────────────────────────────────────────────────────────

const moduleCode = codeOnly(readFileSync(join(ROOT, MODULE_REL), 'utf-8'));

function importsFrom(code: string, names: string[], specifier: string): boolean {
  const escaped = specifier.replace(/[/.]/g, '\\$&');
  const clause = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${escaped}'`).exec(code);
  if (!clause) return false;
  return names.every((n) => new RegExp(`\\b${n}\\b`).test(clause[1]));
}

for (const [names, specifier, why] of [
  [['isMessageableRole'], '@/lib/eligibility/child-exclusion', 'the child rule (§10.6)'],
  [['isHostMembership'], '@/lib/eligibility/host-exclusion', 'the host exclusion (Ruling 5)'],
  [
    ['resolveHouseholdChannel', 'resolveHouseholdMuted'],
    '@/lib/households/channel',
    'the household contact and switch',
  ],
  [['isChaseable'], '@/lib/eligibility/nudge-mark', "the don't-chase mark"],
  [['isValidNZNumber'], '@/lib/phone', 'what a usable phone is today'],
] as Array<[string[], string, string]>) {
  assert(
    'S',
    `imports ${names.join(' and ')} from ${specifier} — ${why}`,
    importsFrom(moduleCode, names, specifier)
  );
}

const COPIED_GATE = /['"](CHILD|DONT_CHASE|PRIMARY_CONTACT|HOST)['"]|\+64|messagesMuted\s*\?\?/;
const STORED_READ = /\bcontactMethod\b|\breachabilityTier\b|\bproxyPersonEventId\b|\.phone\b/;
const IMPURE =
  /@prisma\/client|PrismaClient|@\/lib\/prisma|\bprisma\.|\bfetch\(|from 'next|\bDate\b|performance\.now|hrtime/;

assert(
  'S',
  'CONTROL: the three matchers catch what they are for',
  COPIED_GATE.test(`if (role === 'CHILD') {}`) &&
    COPIED_GATE.test(`/^\\+64\\d{8,10}$/`) &&
    STORED_READ.test('pe.contactMethod === "SMS"') &&
    STORED_READ.test('person.phone') &&
    !STORED_READ.test('person.phoneNumber') &&
    IMPURE.test("import { prisma } from '@/lib/prisma'") &&
    IMPURE.test('const now = Date.now()')
);
assert(
  'S',
  'copies no gate — no role, mark or country-code literal of its own',
  !COPIED_GATE.test(moduleCode)
);
assert(
  'S',
  'reads nothing stored: not contactMethod, reachabilityTier, proxyPersonEventId or legacy phone',
  !STORED_READ.test(moduleCode)
);
assert('S', 'touches no database, network, framework or clock', !IMPURE.test(moduleCode));

// ─────────────────────────────────────────────────────────────────────────────
section('Layer I: isolation — slice 1 lands dark');
// ─────────────────────────────────────────────────────────────────────────────
//
// A DELIBERATE TEMPORARY STATE. GTC-189 slice 3 wires the preview to the chooser and removes
// this layer; until then a caller appearing anywhere is a slice boundary crossed.

function referencesChooser(src: string): boolean {
  return /channel-chooser|\bchooseAskRoute\b|\bchooseChaseRoute\b/.test(codeOnly(src));
}

assert(
  'I',
  'CONTROL: the matcher sees a static import and a dynamic one, and not a comment',
  referencesChooser("import { chooseAskRoute } from '@/lib/eligibility/channel-chooser';") &&
    referencesChooser("const m = await import('../eligibility/channel-chooser');") &&
    !referencesChooser('// see channel-chooser for why\nconst x = 1;')
);

const importers: string[] = [];
function walk(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
    const rel = relative(ROOT, full);
    if (rel === MODULE_REL || rel === SELF_REL) continue;
    if (referencesChooser(readFileSync(full, 'utf-8'))) importers.push(rel);
  }
}
for (const dir of ['src', 'scripts', 'prisma', 'tests']) walk(join(ROOT, dir));

assert(
  'I',
  'nothing in src, scripts, prisma or tests imports the chooser — no caller, no preview, no route',
  importers.length === 0,
  importers.length ? `imported by: ${importers.join(', ')}` : undefined
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer T: types — the fields whose absence would fail open');
// ─────────────────────────────────────────────────────────────────────────────
//
// A missing `nudgeMark` reads as chaseable and a missing `smsOptedOut` as not opted out, and
// both silently. That is a TYPE property, so it is asserted by compiling probes. The CONTROL is
// load-bearing: a probe that failed for an unrelated reason would pass the negatives falsely.

const probeDir = mkdtempSync(join(tmpdir(), 'gtc189-chooser-probe-'));
const MODULE_IMPORT = join(ROOT, MODULE_REL).replace(/\.ts$/, '');

function tscProbe(name: string, rowFields: string): { ok: boolean; output: string } {
  const file = join(probeDir, `${name}.ts`);
  const config = join(probeDir, `${name}.tsconfig.json`);
  writeFileSync(
    file,
    `import type { ChooserMembership } from '${MODULE_IMPORT}';\n` +
      `export const row: ChooserMembership = { ${rowFields} };\n`
  );
  writeFileSync(
    config,
    JSON.stringify({
      extends: join(ROOT, 'tsconfig.json'),
      compilerOptions: { incremental: false, plugins: [] },
      files: [file],
      include: [],
    })
  );
  try {
    execFileSync('npx', ['tsc', '-p', config], { cwd: ROOT, stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const PERSON = `person: { email: null, phoneNumber: null, smsOptedOut: false }`;
const PERSON_NO_OPT_OUT = `person: { email: null, phoneNumber: null }`;
const ROW = `id: 'a', personId: 'p', role: 'PARTICIPANT', householdId: null, householdRole: null, holdsItems: true`;

try {
  const control = tscProbe('control', `${ROW}, nudgeMark: null, ${PERSON}`);
  assert(
    'T',
    'CONTROL: a complete membership row typechecks',
    control.ok,
    control.output || undefined
  );

  const noMark = tscProbe('no-mark', `${ROW}, ${PERSON}`);
  assert(
    'T',
    'a row without nudgeMark does not typecheck, and the error names it',
    !noMark.ok && /nudgeMark/.test(noMark.output)
  );

  const noOptOut = tscProbe('no-opt-out', `${ROW}, nudgeMark: null, ${PERSON_NO_OPT_OUT}`);
  assert(
    'T',
    'a person without smsOptedOut does not typecheck, and the error names it',
    !noOptOut.ok && /smsOptedOut/.test(noOptOut.output)
  );
} finally {
  rmSync(probeDir, { recursive: true, force: true });
}

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
if (failed > 0) {
  console.error('\nRED:');
  for (const r of red) console.error(`  ${r}`);
  process.exit(1);
}
