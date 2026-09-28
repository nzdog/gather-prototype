/**
 * GTC-311 — the chase channel: one event-level switch, and the people the host takes off it.
 *
 * WHAT THIS SUITE IS FOR. [[GTC-189]] ruling AH makes the chase email anybody with no mobile it
 * can text, by one event-level default (`Event.chaseWhenNoMobileDefault`, ON). The host can take a
 * named person off it (`PersonEvent.chaseException`, *"hand this one to me"*), and ruling AL rules
 * THE NAMED EXCEPTION WINS, in both directions. GTC-311 captures, stores, resolves and shows that
 * choice. **It sends nothing** — slice 8 wires the chase to the chooser — so the two acceptance
 * lines that promise a chase are met here AT THE RESOLVER (SCOPED ruling 1), and layer Z asserts
 * that no provider was reached.
 *
 * ⚠ THE CONTROL'S POLARITY INVERTED ON 2026-09-15. Under ruling AG the per-person control meant
 * CHASE THIS ONE; under AH it means HAND THIS ONE TO ME. Every label below names a VALUE —
 * BY_EMAIL or HAND_TO_HOST — and never a tick, so no label here can read the wrong way round.
 *
 * THE WHOLE ORDER, AS RULED 2026-09-27 (GTC-311 plan, flag B):
 *   1. SMS opt-out (Zone 7)  2. email opt-out ([[GTC-296]])  3. the don't-chase mark
 *   4. a usable mobile → TEXT  5. no usable mobile, holds an email → the resolver
 *   6. neither → PHONE_UNUSABLE / NO_CHANNEL
 * Layer C asserts it by giving subjects two conditions at once.
 *
 * Run: npx tsx tests/chase-channel-test.ts
 * Needs the database. Layer F's CONTROL needs the dev server on :3000.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PrismaClient } from '@prisma/client';

const ROOT = join(__dirname, '..');
const BASE = 'http://localhost:3000';
const TAG = 'GTC311';

const RESOLVER_REL = 'src/lib/eligibility/chase-when-no-mobile.ts';
const CHOOSER_REL = 'src/lib/eligibility/channel-chooser.ts';
const CADENCE_REL = 'src/lib/nudge-cadence.ts';
const PREVIEW_REL = 'src/lib/preflight/ask-preview.ts';
const COMPOSE_REL = 'src/lib/preflight/ask-preview-compose.ts';
const CHOICE_REL = 'src/lib/preflight/chase-choice.ts';
const ROUTE_REL = 'src/app/api/events/[id]/pre-flight/chase/route.ts';
const PAGE_REL = 'src/app/plan/[eventId]/pre-flight/page.tsx';

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

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function expectEq(layer: string, label: string, actual: unknown, expected: unknown) {
  assert(
    layer,
    label,
    isDeepStrictEqual(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${actual === undefined ? 'a throw / undefined' : JSON.stringify(actual)}`
  );
}

const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

/** Comments stripped — naming a thing in prose must not read as using it. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ─── Layer Z's instrument: every provider call is counted, from the first line ──
//
// ⚠ NOTHING SENDS (SCOPED ruling 1). `fetch` is the one door both providers use, so it is replaced
// before any module under test loads. The live CONTROL in layer F uses the saved original, and is
// the only call that may reach the network — to our own dev server, not to a provider.
const realFetch = globalThis.fetch;
const providerCalls: string[] = [];
globalThis.fetch = (async (input: unknown) => {
  providerCalls.push(String(input));
  return new Response(JSON.stringify({ id: 'stub' }), { status: 200 });
}) as typeof fetch;

// ─────────────────────────────────────────────────────────────────────────────
// Pure fixtures for the chooser
// ─────────────────────────────────────────────────────────────────────────────

const HOST_ID = 'person-kate';
const NZ = '+64211234567';
const LONDON = '+447700900123';
const mail = (n: string) => `${n}@example.com`;

type Exception = 'BY_EMAIL' | 'HAND_TO_HOST' | null;

interface PureMember {
  id: string;
  personId: string;
  role: string;
  householdId: string | null;
  householdRole: string | null;
  nudgeMark: string | null;
  holdsItems: boolean;
  chaseException: Exception;
  person: {
    email: string | null;
    phoneNumber: string | null;
    smsOptedOut: boolean;
    emailOptedOut: boolean;
  };
}

function member(
  id: string,
  patch: Partial<Omit<PureMember, 'person'>> & { person?: Partial<PureMember['person']> } = {}
): PureMember {
  const { person, ...rest } = patch;
  return {
    id,
    personId: `person-${id}`,
    role: 'PARTICIPANT',
    householdId: null,
    householdRole: null,
    nudgeMark: null,
    holdsItems: true,
    chaseException: null,
    ...rest,
    person: {
      email: null,
      phoneNumber: null,
      smsOptedOut: false,
      emailOptedOut: false,
      ...person,
    },
  };
}

function eventOf(memberships: PureMember[], chaseWhenNoMobileDefault: Exception = null) {
  return {
    hostId: HOST_ID,
    chaseWhenNoMobileDefault,
    memberships: [member('host', { personId: HOST_ID, role: 'HOST' }), ...memberships],
    households: [] as {
      id: string;
      contactPersonEventId: string | null;
      messagesMuted: boolean | null;
    }[],
  };
}

const direct = (channel: 'EMAIL' | 'TEXT', id: string) => ({
  kind: 'DIRECT',
  channel,
  recipientId: id,
});
const none = (why: string, carrierId?: string) =>
  carrierId ? { kind: 'NONE', why, carrierId } : { kind: 'NONE', why };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

async function main() {
  // ───────────────────────────────────────────────────────────────────────────
  section('Layer A: the resolver — THE NAMED EXCEPTION WINS, all nine combinations');
  // ───────────────────────────────────────────────────────────────────────────

  let resolver: Loose = null;
  try {
    resolver = await import('../src/lib/eligibility/chase-when-no-mobile');
  } catch (e) {
    assert('A', 'the resolver module loads', false, String(e));
  }
  const resolve = (exception: Exception, eventDefault: Exception) =>
    attempt(() => resolver?.resolveChaseWhenNoMobile({ exception, eventDefault }));

  expectEq(
    'A',
    'the system default is BY_EMAIL — ON (ruling AH)',
    resolver?.DEFAULT_CHASE_WHEN_NO_MOBILE,
    'BY_EMAIL'
  );

  const TABLE: [Exception, Exception, 'BY_EMAIL' | 'HAND_TO_HOST', string][] = [
    [null, null, 'BY_EMAIL', 'nothing set → the system default'],
    [null, 'BY_EMAIL', 'BY_EMAIL', 'no exception → the event default decides'],
    [null, 'HAND_TO_HOST', 'HAND_TO_HOST', 'no exception → the event default decides'],
    ['HAND_TO_HOST', null, 'HAND_TO_HOST', 'an exception beats the system default'],
    [
      'HAND_TO_HOST',
      'BY_EMAIL',
      'HAND_TO_HOST',
      'RULING AL, FIRST DIRECTION — default ON plus "hand this one to me": he comes to her list',
    ],
    ['HAND_TO_HOST', 'HAND_TO_HOST', 'HAND_TO_HOST', 'an exception equal to the default'],
    ['BY_EMAIL', null, 'BY_EMAIL', 'an exception equal to the system default'],
    [
      'BY_EMAIL',
      'HAND_TO_HOST',
      'BY_EMAIL',
      'RULING AL, SECOND DIRECTION — default OFF plus "chase this one by email": he is chased',
    ],
    ['BY_EMAIL', 'BY_EMAIL', 'BY_EMAIL', 'an exception equal to the default'],
  ];
  for (const [exception, eventDefault, expected, why] of TABLE) {
    expectEq(
      'A',
      `exception ${exception} × default ${eventDefault} → ${expected} (${why})`,
      resolve(exception, eventDefault),
      expected
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer B: the chooser reads the resolver — and only where it should');
  // ───────────────────────────────────────────────────────────────────────────

  let chooser: Loose = null;
  try {
    chooser = await import('../src/lib/eligibility/channel-chooser');
  } catch (e) {
    assert('B', 'the chooser module loads', false, String(e));
  }
  const chase = (m: PureMember, ev = eventOf([m])) =>
    attempt(() => chooser?.chooseChaseRoute(m, ev));

  const emailOnly = member('e', { person: { email: mail('e') } });
  expectEq(
    'B',
    'ACCEPTANCE (chase line 1, met at the resolver): default unset, no exception, email and no ' +
      'mobile → chased by EMAIL',
    chase(emailOnly),
    direct('EMAIL', 'e')
  );
  const excepted = member('x', { chaseException: 'HAND_TO_HOST', person: { email: mail('x') } });
  expectEq(
    'B',
    'ACCEPTANCE (chase line 2, met at the resolver): excepted HAND_TO_HOST → chased by nothing, ' +
      'HANDED_TO_HOST',
    chase(excepted),
    none('HANDED_TO_HOST')
  );
  expectEq(
    'B',
    'RULING AL both ways, at the chooser: default HAND_TO_HOST, exception BY_EMAIL → EMAIL',
    chase(
      member('b', { chaseException: 'BY_EMAIL', person: { email: mail('b') } }),
      eventOf(
        [member('b', { chaseException: 'BY_EMAIL', person: { email: mail('b') } })],
        'HAND_TO_HOST'
      )
    ),
    direct('EMAIL', 'b')
  );
  expectEq(
    'B',
    'default HAND_TO_HOST and no exception → HANDED_TO_HOST (the switch alone decides)',
    chase(
      member('o', { person: { email: mail('o') } }),
      eventOf([member('o', { person: { email: mail('o') } })], 'HAND_TO_HOST')
    ),
    none('HANDED_TO_HOST')
  );
  for (const ex of [null, 'BY_EMAIL', 'HAND_TO_HOST'] as Exception[]) {
    const withPhone = member('p', {
      chaseException: ex,
      person: { email: mail('p'), phoneNumber: NZ },
    });
    expectEq(
      'B',
      `ACCEPTANCE: a usable mobile is unaffected — TEXT whatever the exception (${ex})`,
      chase(withPhone),
      direct('TEXT', 'p')
    );
  }
  expectEq(
    'B',
    'FLAG A, RULED 2026-09-27 — the London cousin with an email is in the email chase by default ' +
      '(this narrows ruling P)',
    chase(member('l', { person: { email: mail('l'), phoneNumber: LONDON } })),
    direct('EMAIL', 'l')
  );
  expectEq(
    'B',
    'the London cousin excepted → HANDED_TO_HOST',
    chase(
      member('l2', {
        chaseException: 'HAND_TO_HOST',
        person: { email: mail('l2'), phoneNumber: LONDON },
      })
    ),
    none('HANDED_TO_HOST')
  );
  expectEq(
    'B',
    'the London cousin WITHOUT an email still comes to the host — PHONE_UNUSABLE, whatever the exception',
    chase(member('l3', { chaseException: 'BY_EMAIL', person: { phoneNumber: LONDON } })),
    none('PHONE_UNUSABLE')
  );
  expectEq(
    'B',
    'no email and no phone → NO_CHANNEL, whatever the exception',
    chase(member('n', { chaseException: 'BY_EMAIL' })),
    none('NO_CHANNEL')
  );
  expectEq(
    'B',
    'RULING AI / ZONE 7: an SMS opt-out with an email and an exception of BY_EMAIL is NOT chased',
    chase(
      member('s', {
        chaseException: 'BY_EMAIL',
        person: { email: mail('s'), phoneNumber: NZ, smsOptedOut: true },
      })
    ),
    none('SMS_OPTED_OUT')
  );
  expectEq(
    'B',
    '[[GTC-296]]: an email opt-out with an exception of BY_EMAIL is not chased on any channel',
    chase(
      member('u', { chaseException: 'BY_EMAIL', person: { email: mail('u'), emailOptedOut: true } })
    ),
    none('EMAIL_OPTED_OUT')
  );
  for (const ex of [null, 'BY_EMAIL', 'HAND_TO_HOST'] as Exception[]) {
    expectEq(
      'B',
      `ACCEPTANCE: nudgeMark composes independently — DONT_CHASE with exception ${ex} is not chased`,
      chase(
        member('d', { nudgeMark: 'DONT_CHASE', chaseException: ex, person: { email: mail('d') } })
      ),
      none('MARKED_DONT_CHASE')
    );
  }
  expectEq(
    'B',
    'GENTLE is a volume control, not an off-switch — an email-only GENTLE person is still chased by email',
    chase(member('g', { nudgeMark: 'GENTLE', person: { email: mail('g') } })),
    direct('EMAIL', 'g')
  );

  // A carried child follows the CARRIER's exception — the chase goes to the carrier.
  {
    const sarah = member('sarah', {
      householdId: 'hh',
      householdRole: 'PRIMARY_CONTACT',
      holdsItems: false,
      person: { email: mail('sarah') },
    });
    const ollie = member('ollie', { householdId: 'hh', householdRole: 'CHILD' });
    const ev = {
      ...eventOf([sarah, ollie]),
      households: [{ id: 'hh', contactPersonEventId: null, messagesMuted: null }],
    };
    expectEq(
      'B',
      'a carried child is chased through an email-only carrier by EMAIL by default',
      attempt(() => chooser?.chooseChaseRoute(ollie, ev)),
      { kind: 'CARRIED', channel: 'EMAIL', recipientId: 'sarah' }
    );
    const sarahOut = { ...sarah, chaseException: 'HAND_TO_HOST' as Exception };
    const ev2 = {
      ...ev,
      memberships: ev.memberships.map((m) => (m.id === 'sarah' ? sarahOut : m)),
    };
    expectEq(
      'B',
      "and follows the CARRIER's exception — Sarah handed to the host means Ollie's ask is not chased",
      attempt(() => chooser?.chooseChaseRoute(ollie, ev2)),
      none('HANDED_TO_HOST', 'sarah')
    );
    const ollieOwn = { ...ollie, chaseException: 'HAND_TO_HOST' as Exception };
    const ev3 = {
      ...ev,
      memberships: ev.memberships.map((m) => (m.id === 'ollie' ? ollieOwn : m)),
    };
    expectEq(
      'B',
      "a value on the CHILD's own row decides nothing — the carrier is who is chased",
      attempt(() => chooser?.chooseChaseRoute(ollieOwn, ev3)),
      { kind: 'CARRIED', channel: 'EMAIL', recipientId: 'sarah' }
    );
  }

  expectEq(
    'B',
    'the ASK is untouched — an excepted person is still asked by email (Scope: "the ask")',
    attempt(() => chooser?.chooseAskRoute(excepted, eventOf([excepted]))),
    direct('EMAIL', 'x')
  );

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer C: the whole order — two conditions at once, the reported reason');
  // ───────────────────────────────────────────────────────────────────────────

  expectEq(
    'C',
    '1 before 2: SMS opt-out AND email opt-out → SMS_OPTED_OUT (Zone 7 keeps the top)',
    chase(member('c1', { person: { email: mail('c1'), smsOptedOut: true, emailOptedOut: true } })),
    none('SMS_OPTED_OUT')
  );
  expectEq(
    'C',
    '2 before 3: email opt-out AND DONT_CHASE → EMAIL_OPTED_OUT',
    chase(
      member('c2', { nudgeMark: 'DONT_CHASE', person: { email: mail('c2'), emailOptedOut: true } })
    ),
    none('EMAIL_OPTED_OUT')
  );
  expectEq(
    'C',
    '3 before 5 (FLAG B, RULED): DONT_CHASE AND excepted HAND_TO_HOST → MARKED_DONT_CHASE — the ' +
      "mark is reported, so ruling T and ruling 14's grey hold",
    chase(
      member('c3', {
        nudgeMark: 'DONT_CHASE',
        chaseException: 'HAND_TO_HOST',
        person: { email: mail('c3') },
      })
    ),
    none('MARKED_DONT_CHASE')
  );
  expectEq(
    'C',
    '4 before 5: a usable mobile AND excepted HAND_TO_HOST → TEXT — the exception is never read',
    chase(
      member('c4', {
        chaseException: 'HAND_TO_HOST',
        person: { email: mail('c4'), phoneNumber: NZ },
      })
    ),
    direct('TEXT', 'c4')
  );
  expectEq(
    'C',
    '1 before 5: SMS opt-out AND default HAND_TO_HOST → SMS_OPTED_OUT',
    chase(
      member('c5', { person: { email: mail('c5'), phoneNumber: NZ, smsOptedOut: true } }),
      eventOf(
        [member('c5', { person: { email: mail('c5'), phoneNumber: NZ, smsOptedOut: true } })],
        'HAND_TO_HOST'
      )
    ),
    none('SMS_OPTED_OUT')
  );

  // ───────────────────────────────────────────────────────────────────────────
  section("Layer D: the words — ruling AN's map, ruling AM verbatim, W1 to W9");
  // ───────────────────────────────────────────────────────────────────────────

  let compose: Loose = null;
  try {
    compose = await import('../src/lib/preflight/ask-preview-compose');
  } catch (e) {
    assert('D', 'the compose module loads', false, String(e));
  }
  const map = compose?.CHASE_NONE_WHY as Record<string, string> | undefined;
  const WHYS = [
    'EMAIL_OPTED_OUT',
    'HOST_OWN_ASK',
    'CHILD_WITHOUT_ITEM',
    'HOST_HOUSEHOLD_CHILD',
    'NO_CARRIER',
    'HOUSEHOLD_MUTED',
    'HOST_AS_CARRIER',
    'SMS_OPTED_OUT',
    'MARKED_DONT_CHASE',
    'PHONE_UNUSABLE',
    'NO_CHANNEL',
    'HANDED_TO_HOST',
  ];
  assert(
    'D',
    'CHASE_NONE_WHY has words for every ChaseNoneWhy, HANDED_TO_HOST included',
    !!map && WHYS.every((w) => typeof map[w] === 'string' && map[w].length > 0),
    map ? `missing: ${WHYS.filter((w) => !map[w]).join(', ')}` : 'no map exported'
  );
  expectEq(
    'D',
    'RULING AM, VERBATIM — the opted-out reason line',
    map?.SMS_OPTED_OUT,
    "They've opted out of texts — so I won't chase them at all."
  );
  expectEq(
    'D',
    'RULING AM, VERBATIM — where the control would be',
    compose?.CHASE_OPTED_OUT_PLACEHOLDER,
    "[can't be chased — opted out]"
  );
  expectEq(
    'D',
    'W7 — HANDED_TO_HOST',
    map?.HANDED_TO_HOST,
    "You're handling them yourself, so I won't chase them."
  );

  // RULING AN: no sentence from the ask-refusal maps may appear on a chase-refusal row.
  const askSentences = new Set<string>();
  if (compose?.hostListReason) {
    for (const why of [
      'EMAIL_OPTED_OUT',
      'NO_CHANNEL',
      'SMS_OPTED_OUT',
      'PHONE_UNUSABLE',
      'HOST_HOUSEHOLD_CHILD',
      'NO_CARRIER',
      'HOUSEHOLD_MUTED',
    ]) {
      for (const child of [false, true]) {
        askSentences.add(compose.hostListReason({ why, child, carrierName: null }));
      }
    }
  }
  assert(
    'D',
    'RULING AN — no CHASE_NONE_WHY sentence equals any ADULT_WHY or CHILD_WHY sentence',
    !!map && askSentences.size > 0 && Object.values(map).every((s) => !askSentences.has(s)),
    map
      ? `shared: ${Object.values(map)
          .filter((s) => askSentences.has(s))
          .join(' | ')}`
      : undefined
  );
  expectEq(
    'D',
    'a carried child names the carrier in one sentence',
    attempt(() =>
      compose?.notChasedReason({ why: 'HANDED_TO_HOST', child: true, carrierName: 'Sarah Jones' })
    ),
    "Sarah gets it, but I won't chase Sarah."
  );
  expectEq(
    'D',
    'an adult reads the map',
    attempt(() =>
      compose?.notChasedReason({ why: 'SMS_OPTED_OUT', child: false, carrierName: null })
    ),
    "They've opted out of texts — so I won't chase them at all."
  );
  expectEq(
    'D',
    'W1 — the default ON',
    compose?.CHASE_DEFAULT_SENTENCE?.BY_EMAIL,
    "When someone hasn't answered and has no mobile I can text, I'll chase them by email."
  );
  expectEq(
    'D',
    'W2 — the default OFF',
    compose?.CHASE_DEFAULT_SENTENCE?.HAND_TO_HOST,
    "When someone hasn't answered and has no mobile I can text, I'll leave them to you."
  );
  expectEq('D', 'W3 — the switch pills', compose?.CHASE_DEFAULT_PILLS, {
    BY_EMAIL: 'Chase them by email',
    HAND_TO_HOST: 'Leave them to me',
  });
  expectEq(
    'D',
    'W3 and the ruling of 2026-09-27 — the default suffix',
    compose?.DEFAULT_SUFFIX,
    ' (the default)'
  );
  expectEq('D', 'W4 — the row label', compose?.CHASED_BY_LABEL, 'Chased by');
  expectEq('D', 'W4 — its values', compose?.CHASED_BY_VALUE, {
    TEXT: 'Text',
    EMAIL: 'Email',
    NONE: 'Not chased — yours',
  });
  expectEq('D', 'W5 — the per-person pills', compose?.CHASE_PERSON_PILLS, {
    BY_EMAIL: 'Chase by email',
    HAND_TO_HOST: 'Hand this one to me',
  });
  expectEq(
    'D',
    'W6 — group A heading',
    compose?.HOST_LIST_NOT_ASKED_HEADING,
    "I won't message them"
  );
  expectEq(
    'D',
    'W6 — group B heading',
    compose?.HOST_LIST_NOT_CHASED_HEADING,
    "I'll ask, but won't chase"
  );
  expectEq(
    'D',
    'W6 — group B blurb',
    compose?.HOST_LIST_NOT_CHASED_BLURB,
    "Their asks go out, and I won't follow up on them. If they haven't answered, they're yours."
  );
  expectEq('D', 'KEPT — the ruled heading', compose?.HOST_LIST_HEADING, 'Yours to handle');
  expectEq(
    'D',
    'KEPT — the ruled blurb, now under group A, of whom it is exactly true',
    compose?.HOST_LIST_BLURB,
    'Gather will not message these people. Each is named with what they have been asked for, and why it comes to you.'
  );
  expectEq('D', 'KEPT — the empty state', compose?.HOST_LIST_EMPTY, 'Nobody.');

  // THE ADDITION OF 2026-09-27: the per-person pill equal to the default is marked while unset.
  expectEq(
    'D',
    'RULING 2026-09-27 — per-person pills mark the default while no exception is stored',
    attempt(() => compose?.chasePersonPills({ exception: null, eventDefault: null })),
    [
      { value: 'BY_EMAIL', label: 'Chase by email (the default)', active: true, writes: null },
      {
        value: 'HAND_TO_HOST',
        label: 'Hand this one to me',
        active: false,
        writes: 'HAND_TO_HOST',
      },
    ]
  );
  expectEq(
    'D',
    'and once an exception is stored, no pill carries the suffix',
    attempt(() => compose?.chasePersonPills({ exception: 'HAND_TO_HOST', eventDefault: null })),
    [
      { value: 'BY_EMAIL', label: 'Chase by email', active: false, writes: null },
      { value: 'HAND_TO_HOST', label: 'Hand this one to me', active: true, writes: 'HAND_TO_HOST' },
    ]
  );
  expectEq(
    'D',
    'default OFF: the marked pill moves with the switch, and picking BY_EMAIL writes the exception',
    attempt(() => compose?.chasePersonPills({ exception: null, eventDefault: 'HAND_TO_HOST' })),
    [
      { value: 'BY_EMAIL', label: 'Chase by email', active: false, writes: 'BY_EMAIL' },
      {
        value: 'HAND_TO_HOST',
        label: 'Hand this one to me (the default)',
        active: true,
        writes: null,
      },
    ]
  );

  const page = read(PAGE_REL);
  assert(
    'D',
    'W8 — step 4 blurb',
    page.includes("Exactly what each person will receive, and who I'll chase.")
  );
  assert('D', 'W9 — step 4 check reads "Settled"', /checkLabel="Settled"/.test(page));
  assert(
    'D',
    'W9 — header',
    page.includes('Five things to go through.') && !page.includes('Five things to look at.')
  );
  assert(
    'D',
    'the page renders the words from the module and keeps no copy of its own',
    page.includes('CHASE_DEFAULT_SENTENCE') &&
      page.includes('chasePersonPills') &&
      page.includes('CHASE_OPTED_OUT_PLACEHOLDER') &&
      page.includes('notChasedReason') &&
      !page.includes("can't be chased — opted out")
  );

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer T: types — the fields whose absence would fail open, and the Record guard');
  // ───────────────────────────────────────────────────────────────────────────
  runTypeProbes();

  // ───────────────────────────────────────────────────────────────────────────
  // Layers E and F — against the database
  // ───────────────────────────────────────────────────────────────────────────
  await runDatabaseLayers();

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer G: structural — where things are, and where they must not be');
  // ───────────────────────────────────────────────────────────────────────────

  const resolverSrc = read(RESOLVER_REL);
  assert('G', 'the resolver is its own module', resolverSrc.length > 0);
  assert(
    'G',
    'RULING AL (ii) — neither "ladder" nor "quieter" appears in the resolver module, prose included',
    resolverSrc.length > 0 && !/ladder|quieter/i.test(resolverSrc)
  );
  assert(
    'G',
    'the resolver imports nothing — client-safe, like nudge-cadence.ts',
    resolverSrc.length > 0 && !/^\s*import\s/m.test(codeOnly(resolverSrc))
  );
  const cadence = read(CADENCE_REL);
  assert(
    'G',
    'RULING AL (i) — nudge-cadence.ts does not reference the resolver or either column',
    !/resolveChaseWhenNoMobile|chaseException|chaseWhenNoMobileDefault/.test(cadence)
  );
  assert(
    'G',
    'resolveNudgeOffsetDays is unchanged — nudge-cadence.ts has no diff against HEAD',
    gitDiff(CADENCE_REL) === ''
  );
  const chooserCode = codeOnly(read(CHOOSER_REL));
  assert(
    'G',
    "decision 15's narrow line and its ANCHOR are gone from the chooser",
    !read(CHOOSER_REL).includes('ANCHOR(GTC-189): decision 15')
  );
  assert('G', 'the chooser calls the resolver', /resolveChaseWhenNoMobile\(/.test(chooserCode));

  // One answer from one place: the resolver's callers in src/.
  const callers = grepSrc('resolveChaseWhenNoMobile\\(').filter((f) => f !== RESOLVER_REL);
  expectEq(
    'G',
    'ONE ANSWER, ONE PLACE — the resolver is called by the chooser (per person), the preview (what ' +
      'the switch means today) and the words module (which pill is the default), and nothing else',
    callers.sort(),
    [COMPOSE_REL, CHOOSER_REL, PREVIEW_REL].sort()
  );
  const preview = codeOnly(read(PREVIEW_REL));
  assert('G', 'the preview calls chooseChaseRoute', /chooseChaseRoute\(/.test(preview));
  assert(
    'G',
    'the write path is a lib function the route calls',
    read(ROUTE_REL).includes('writeChaseChoice')
  );
  assert(
    'G',
    'the route guards with requireEventRole(HOST, COHOST), as its siblings do',
    /requireEventRole\(eventId, \['HOST', 'COHOST'\]\)/.test(read(ROUTE_REL))
  );
  assert(
    'G',
    'route-classifications.json classifies the new route',
    read('route-classifications.json').includes('pre-flight/chase')
  );

  // Zone 7, Zone 5, and the chase code — untouched.
  assert(
    'G',
    'ZONE 7 — the two opt-out modules are unchanged',
    gitDiff('src/lib/sms/opt-out-service.ts') === '' &&
      gitDiff('src/lib/sms/opt-out-keywords.ts') === ''
  );
  assert(
    'G',
    'ZONE 7 — no non-comment schema line touching smsOptedOut or SmsOptOut changed',
    !gitDiff('prisma/schema.prisma')
      .split('\n')
      .filter((l) => /^[+-][^+-]/.test(l) && !/^[+-]\s*\/\//.test(l))
      .some((l) => /smsOptedOut|SmsOptOut/.test(l))
  );
  /*
   * ⚠ REPLACED AT [[GTC-189]] SLICE 8a, NOT DELETED. These two were GTC-311's scope claims measured
   * against the working tree — "the chase is slice 8" and "no migration" — and slice 8 is the tree
   * they were written to exclude, so against HEAD they fire the day it is built, as intended. The
   * claim was always about GTC-311's own commit, so it is now measured there, where it stays true.
   */
  assert(
    'G',
    "GTC-311's commit (0067be3) edited no file under src/lib/sms/ — the chase is slice 8",
    gitShowFiles('0067be3', 'src/lib/sms') === ''
  );
  assert(
    'G',
    "ZONE 5 — GTC-311's commit (0067be3) carried no migration: nothing under prisma/",
    gitShowFiles('0067be3', 'prisma') === ''
  );

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer Z: nothing sent');
  // ───────────────────────────────────────────────────────────────────────────
  expectEq(
    'Z',
    'NOTHING SENDS — no provider was called by anything in this suite',
    providerCalls,
    []
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer T
// ─────────────────────────────────────────────────────────────────────────────

function runTypeProbes() {
  const probeDir = mkdtempSync(join(tmpdir(), 'gtc311-probe-'));
  const CHOOSER_IMPORT = join(ROOT, CHOOSER_REL).replace(/\.ts$/, '');
  const probe = (name: string, body: string): { ok: boolean; output: string } => {
    const file = join(probeDir, `${name}.ts`);
    const config = join(probeDir, `${name}.tsconfig.json`);
    writeFileSync(file, body);
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
  };

  // [[GTC-189]] slice 8a added two required facts to the chooser person ([[GTC-324]]).
  const PERSON = `person: { email: null, phoneNumber: null, smsOptedOut: false, emailOptedOut: false, emailBlocked: false, emailReported: false }`;
  const ROW = `id: 'a', personId: 'p', role: 'PARTICIPANT', householdId: null, householdRole: null, holdsItems: true, nudgeMark: null, ${PERSON}`;
  const head = `import type { ChaseChooserMembership, ChaseChooserEvent } from '${CHOOSER_IMPORT}';\n`;

  try {
    const control = probe(
      'control',
      head +
        `export const row: ChaseChooserMembership = { ${ROW}, chaseException: null };\n` +
        `export const ev: ChaseChooserEvent = { hostId: 'h', households: [], memberships: [row], chaseWhenNoMobileDefault: null };\n`
    );
    assert(
      'T',
      'CONTROL: a complete chase membership and event typecheck',
      control.ok,
      control.output || undefined
    );

    const noException = probe(
      'no-exception',
      head + `export const row: ChaseChooserMembership = { ${ROW} };\n`
    );
    assert(
      'T',
      'a chase membership without chaseException does not typecheck, and the error names it',
      !noException.ok && /chaseException/.test(noException.output)
    );
    const noDefault = probe(
      'no-default',
      head +
        `const row: ChaseChooserMembership = { ${ROW}, chaseException: null };\n` +
        `export const ev: ChaseChooserEvent = { hostId: 'h', households: [], memberships: [row] };\n`
    );
    assert(
      'T',
      'a chase event without chaseWhenNoMobileDefault does not typecheck, and the error names it',
      !noDefault.ok && /chaseWhenNoMobileDefault/.test(noDefault.output)
    );

    // Ruling AN: the map is a Record over ChaseNoneWhy, so a new why without words is a compile error.
    const compose = read(COMPOSE_REL);
    assert(
      'T',
      'CHASE_NONE_WHY is declared Record<ChaseNoneWhy, string>',
      /export const CHASE_NONE_WHY: Record<ChaseNoneWhy, string>/.test(compose)
    );
    const missing = probe(
      'record-missing',
      `import type { ChaseNoneWhy } from '${CHOOSER_IMPORT}';\n` +
        `export const m: Record<ChaseNoneWhy, string> = { EMAIL_OPTED_OUT: '', HOST_OWN_ASK: '', CHILD_WITHOUT_ITEM: '', HOST_HOUSEHOLD_CHILD: '', NO_CARRIER: '', HOUSEHOLD_MUTED: '', HOST_AS_CARRIER: '', SMS_OPTED_OUT: '', MARKED_DONT_CHASE: '', PHONE_UNUSABLE: '', NO_CHANNEL: '' };\n`
    );
    assert(
      'T',
      'a Record<ChaseNoneWhy, string> without HANDED_TO_HOST does not typecheck — the new why needs words',
      !missing.ok && /HANDED_TO_HOST/.test(missing.output)
    );

    // Schema-follows-module: the resolver's vocabulary equals Prisma's enum, both ways.
    const RESOLVER_IMPORT = join(ROOT, RESOLVER_REL).replace(/\.ts$/, '');
    const same = probe(
      'enum-equal',
      `import type { ChaseWhenNoMobile } from '${RESOLVER_IMPORT}';\n` +
        // Absolute, because the probe lives in a temp directory with no node_modules above it.
        `import type { $Enums } from '${join(ROOT, 'node_modules', '@prisma', 'client')}';\n` +
        `type P = $Enums.ChaseWhenNoMobile;\n` +
        `export const a: ChaseWhenNoMobile[] = [] as P[];\n` +
        `export const b: P[] = [] as ChaseWhenNoMobile[];\n`
    );
    assert(
      'T',
      "the resolver's ChaseWhenNoMobile equals Prisma's enum, in both directions",
      same.ok,
      same.output || undefined
    );
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layers E and F — the preview and the write path, against gather_dev
// ─────────────────────────────────────────────────────────────────────────────

async function runDatabaseLayers() {
  const prisma = new PrismaClient();
  const created = {
    people: [] as string[],
    users: [] as string[],
    events: [] as string[],
  };
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  try {
    const user = await prisma.user.create({
      data: { email: `${TAG.toLowerCase()}+${stamp}@example.test` },
    });
    created.users.push(user.id);
    const mkPerson = async (label: string, over: Record<string, unknown> = {}) => {
      const p = await prisma.person.create({
        data: {
          name: `${TAG} ${label}`,
          email: `${TAG.toLowerCase()}-${label}-${stamp}@example.test`,
          ...over,
        },
      });
      created.people.push(p.id);
      return p;
    };
    const host = await mkPerson('Host', { email: user.email, userId: user.id });
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const mkEvent = async (label: string) => {
      const e = await prisma.event.create({
        data: {
          name: `${TAG} ${label}`,
          startDate: endDate,
          endDate,
          hostId: host.id,
          status: 'CONFIRMING',
        },
      });
      created.events.push(e.id);
      await prisma.eventRole.create({ data: { eventId: e.id, userId: user.id, role: 'HOST' } });
      await prisma.personEvent.create({ data: { personId: host.id, eventId: e.id, role: 'HOST' } });
      const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: e.id } });
      return { event: e, team };
    };
    const { event, team } = await mkEvent('main');
    const other = await mkEvent('other');

    const add = async (
      p: { id: string },
      over: Record<string, unknown> = {},
      holds = true,
      eventId = event.id,
      teamId = team.id
    ) => {
      const pe = await prisma.personEvent.create({
        data: { personId: p.id, eventId, role: 'PARTICIPANT', ...over },
      });
      if (holds) {
        const item = await prisma.item.create({
          data: { name: `${TAG} dish`, teamId, status: 'ASSIGNED' },
        });
        await prisma.assignment.create({
          data: { itemId: item.id, personId: p.id, response: 'PENDING' },
        });
      }
      return pe;
    };

    const emailOnly = await mkPerson('EmailOnly');
    const withPhone = await mkPerson('WithPhone', { phoneNumber: '+64211234567' });
    const london = await mkPerson('London', { phoneNumber: '+447700900123' });
    const optedOut = await mkPerson('OptedOut', { phoneNumber: '+64211234568', smsOptedOut: true });
    const marked = await mkPerson('Marked');
    const noContact = await mkPerson('NoContact', { email: null });
    const sarah = await mkPerson('Sarah');
    const ollie = await mkPerson('Ollie', { email: null });
    const stranger = await mkPerson('Stranger');

    const peEmail = await add(emailOnly);
    const pePhone = await add(withPhone);
    const peLondon = await add(london);
    const peOpted = await add(optedOut);
    const peMarked = await add(marked, { nudgeMark: 'DONT_CHASE' });
    await add(noContact);
    const hh = await prisma.household.create({ data: { eventId: event.id } });
    const peSarah = await add(
      sarah,
      { householdId: hh.id, householdRole: 'PRIMARY_CONTACT' },
      false
    );
    const peOllie = await add(ollie, { householdId: hh.id, householdRole: 'CHILD' });
    const peStranger = await add(stranger, {}, true, other.event.id, other.team.id);
    const hostPe = await prisma.personEvent.findFirstOrThrow({
      where: { eventId: event.id, personId: host.id },
    });

    let previewMod: Loose = null;
    let choiceMod: Loose = null;
    try {
      previewMod = await import('../src/lib/preflight/ask-preview');
    } catch (e) {
      assert('E', 'the preview module loads', false, String(e));
    }
    try {
      choiceMod = await import('../src/lib/preflight/chase-choice');
    } catch (e) {
      assert('F', 'the write-path module loads', false, String(e));
    }
    const readPreview = (db: PrismaClient = prisma) =>
      previewMod.readAskPreview(db, event.id, 'http://localhost:3000');
    const write = async (body: unknown) => {
      try {
        return await choiceMod.writeChaseChoice(prisma, event.id, body, 'http://localhost:3000');
      } catch (e) {
        return { status: -1, body: { error: String(e) } };
      }
    };

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer E: the preview — what the screen is given');
    // ─────────────────────────────────────────────────────────────────────────

    const before = await attemptAsync(() => readPreview());
    const rc = (peId: string) => before?.chase?.byRecipient?.[peId];
    // [[GTC-189]] slice 8b — every expectation below gained `carried`: the children whose CHASE reaches
    // this recipient (ruling R). Empty for everybody but Sarah, whose row carries Ollie's.
    expectEq(
      'E',
      'the stored default is null and resolves to BY_EMAIL',
      {
        stored: before?.chase?.stored,
        resolved: before?.chase?.resolved,
      },
      { stored: null, resolved: 'BY_EMAIL' }
    );
    expectEq('E', 'email only → chased by EMAIL, control OFFERED', rc(peEmail.id), {
      chasedBy: 'EMAIL',
      why: null,
      control: 'OFFERED',
      exception: null,
      carried: [],
    });
    expectEq('E', 'ACCEPTANCE — usable mobile → TEXT, NO control shown', rc(pePhone.id), {
      chasedBy: 'TEXT',
      why: null,
      control: 'NONE',
      exception: null,
      carried: [],
    });
    expectEq(
      'E',
      'FLAG A — the London cousin with an email → EMAIL, control OFFERED',
      rc(peLondon.id),
      { chasedBy: 'EMAIL', why: null, control: 'OFFERED', exception: null, carried: [] }
    );
    expectEq('E', 'RULING AI — opted out → NONE, control REFUSED_OPTED_OUT', rc(peOpted.id), {
      chasedBy: 'NONE',
      why: 'SMS_OPTED_OUT',
      control: 'REFUSED_OPTED_OUT',
      exception: null,
      carried: [],
    });
    expectEq('E', 'marked DONT_CHASE → NONE, no control (grey, ruling 14)', rc(peMarked.id), {
      chasedBy: 'NONE',
      why: 'MARKED_DONT_CHASE',
      control: 'NONE',
      exception: null,
      carried: [],
    });
    expectEq(
      'E',
      'Sarah, carrying Ollie, email only → EMAIL, control OFFERED on HER row',
      rc(peSarah.id),
      { chasedBy: 'EMAIL', why: null, control: 'OFFERED', exception: null, carried: [peOllie.id] }
    );
    expectEq(
      'E',
      'ACCEPTANCE — the opted-out person is on her list, in group B, with the AM reason',
      (before?.chase?.notChased ?? []).map((l: Loose) => [l.personEventId, l.why, l.child]),
      [[peOpted.id, 'SMS_OPTED_OUT', false]]
    );
    const hostListBefore = JSON.stringify(before?.hostList);
    const recipientsBefore = JSON.stringify(before?.recipients);
    assert(
      'E',
      'group A (hostList) holds the no-contact adult, as before',
      (before?.hostList ?? []).length === 1
    );

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer F: the write path — stored, refused, and read back after a "restart"');
    // ─────────────────────────────────────────────────────────────────────────

    const r1 = await write({ personEventId: peEmail.id, chaseException: 'HAND_TO_HOST' });
    expectEq('F', 'hand one to her → 200', r1?.status, 200);
    const r2 = await write({ personEventId: peSarah.id, chaseException: 'HAND_TO_HOST' });
    expectEq('F', 'hand the carrier to her → 200', r2?.status, 200);
    const r3 = await write({ chaseWhenNoMobileDefault: 'BY_EMAIL' });
    expectEq('F', 'set the event default explicitly → 200', r3?.status, 200);

    // "Both decisions survive from the pre-flight to the chase across a server restart":
    // a fresh client, sharing nothing with the one that wrote.
    const fresh = new PrismaClient();
    try {
      const stored = await fresh.personEvent.findUnique({
        where: { id: peEmail.id },
        select: { chaseException: true },
      });
      const storedEv = await fresh.event.findUnique({
        where: { id: event.id },
        select: { chaseWhenNoMobileDefault: true },
      });
      expectEq(
        'F',
        'ACCEPTANCE — the exception reads back through a fresh client',
        stored?.chaseException,
        'HAND_TO_HOST'
      );
      expectEq(
        'F',
        'ACCEPTANCE — the default reads back through a fresh client',
        storedEv?.chaseWhenNoMobileDefault,
        'BY_EMAIL'
      );

      const after = await attemptAsync(() => readPreview(fresh));
      expectEq(
        'F',
        'and the chooser, reading them fresh, answers HANDED_TO_HOST',
        after?.chase?.byRecipient?.[peEmail.id],
        {
          chasedBy: 'NONE',
          why: 'HANDED_TO_HOST',
          control: 'OFFERED',
          exception: 'HAND_TO_HOST',
          carried: [],
        }
      );
      expectEq(
        'F',
        'ACCEPTANCE — the excepted people are on her list, named with their items; Ollie via Sarah',
        (after?.chase?.notChased ?? []).map((l: Loose) => [
          l.name,
          l.why,
          l.child,
          l.carrierName,
          l.itemNames.length,
        ]),
        [
          [`${TAG} EmailOnly`, 'HANDED_TO_HOST', false, null, 1],
          [`${TAG} Ollie`, 'HANDED_TO_HOST', true, `${TAG} Sarah`, 1],
          [`${TAG} OptedOut`, 'SMS_OPTED_OUT', false, null, 1],
          [`${TAG} Sarah`, 'HANDED_TO_HOST', false, null, 0],
        ]
      );
      assert(
        'F',
        '⚠ THE ASK IS UNTOUCHED — hostList and recipients are byte-identical with and without ' +
          'exceptions, so the press, the drain and the mini-send write the same ask rows',
        // ⚠ Guarded: at RED both sides were `undefined`, and `undefined === undefined` passed a claim
        // about two previews that did not exist.
        // And the exception must really be stored, or "with" and "without" are the same state.
        stored?.chaseException === 'HAND_TO_HOST' &&
          Array.isArray(after?.hostList) &&
          Array.isArray(after?.recipients) &&
          after.recipients.length >= 5 &&
          JSON.stringify(after?.hostList) === hostListBefore &&
          JSON.stringify(after?.recipients) === recipientsBefore
      );
      /*
       * [[GTC-305]] — `chase.byMembership` is the board's source, so it must be the SAME answer the
       * pre-flight shows. For every recipient, its route agrees with `byRecipient` (the chooser's
       * answer this screen already renders), and for every group-B line it carries the same why.
       */
      assert(
        'F',
        'GTC-305 — byMembership agrees with the chooser answer the pre-flight shows, recipient by recipient and line by line',
        attempt(() => {
          const byM = after.chase.byMembership as Record<string, Loose>;
          const recipientsAgree = Object.entries(
            after.chase.byRecipient as Record<string, Loose>
          ).every(([id, rc]) =>
            rc.chasedBy === 'NONE'
              ? byM[id]?.kind === 'NONE' && byM[id].why === rc.why
              : byM[id]?.kind !== 'NONE' && byM[id]?.channel === rc.chasedBy
          );
          const linesAgree = (after.chase.notChased as Loose[]).every(
            (l) => byM[l.personEventId]?.kind === 'NONE' && byM[l.personEventId].why === l.why
          );
          return Object.keys(after.chase.byRecipient).length >= 5 && recipientsAgree && linesAgree;
        }) === true
      );
    } finally {
      await fresh.$disconnect();
    }

    // RULING AL, second direction, end to end: default OFF, one person chased anyway.
    await write({ chaseWhenNoMobileDefault: 'HAND_TO_HOST' });
    const r4 = await write({ personEventId: peLondon.id, chaseException: 'BY_EMAIL' });
    expectEq('F', 'default OFF, then chase the London cousin by email → 200', r4?.status, 200);
    const off = await attemptAsync(() => readPreview());
    expectEq(
      'F',
      'RULING AL — default OFF plus BY_EMAIL: he is chased',
      off?.chase?.byRecipient?.[peLondon.id]?.chasedBy,
      'EMAIL'
    );
    expectEq(
      'F',
      'the unexcepted email-only guest follows the switch to her list',
      off?.chase?.byRecipient?.[peEmail.id]?.why,
      'HANDED_TO_HOST'
    );
    expectEq(
      'F',
      'and a usable mobile is still TEXT with the switch OFF',
      off?.chase?.byRecipient?.[pePhone.id]?.chasedBy,
      'TEXT'
    );

    // A write equal to the default stores null — so a stored value is always a real exception.
    const r5 = await write({ personEventId: peEmail.id, chaseException: null });
    expectEq('F', 'null clears the exception → 200', r5?.status, 200);
    const cleared = await prisma.personEvent.findUnique({
      where: { id: peEmail.id },
      select: { chaseException: true },
    });
    expectEq('F', 'and it is null in the database', cleared?.chaseException, null);
    const r6 = await write({ chaseWhenNoMobileDefault: null });
    expectEq('F', 'null clears the default → 200', r6?.status, 200);

    // Refusals — the route is the gate, not the markup.
    const refused = async (label: string, body: unknown, status: number, code?: string) => {
      const r = await write(body);
      expectEq(
        'F',
        `${label} → ${status}${code ? ` ${code}` : ''}`,
        [r?.status, code ? r?.body?.error : undefined],
        [status, code]
      );
    };
    await refused(
      'RULING AI — an opted-out row is refused the exception',
      { personEventId: peOpted.id, chaseException: 'HAND_TO_HOST' },
      409,
      'CHASE_EXCEPTION_OPTED_OUT'
    );
    await refused(
      'a usable mobile is not offered the control',
      { personEventId: pePhone.id, chaseException: 'HAND_TO_HOST' },
      409,
      'CHASE_EXCEPTION_NOT_OFFERED'
    );
    await refused(
      'a DONT_CHASE row is not offered the control',
      { personEventId: peMarked.id, chaseException: 'HAND_TO_HOST' },
      409,
      'CHASE_EXCEPTION_NOT_OFFERED'
    );
    await refused(
      "the host's own row is not offered the control",
      { personEventId: hostPe.id, chaseException: 'HAND_TO_HOST' },
      409,
      'CHASE_EXCEPTION_NOT_OFFERED'
    );
    await refused(
      "a child's own row is not offered the control — the carrier's is",
      { personEventId: peOllie.id, chaseException: 'HAND_TO_HOST' },
      409,
      'CHASE_EXCEPTION_NOT_OFFERED'
    );
    await refused(
      'a person on another event is 404',
      { personEventId: peStranger.id, chaseException: 'HAND_TO_HOST' },
      404
    );
    await refused(
      'a bad exception value is 400',
      { personEventId: peEmail.id, chaseException: 'YES' },
      400
    );
    await refused('a bad default value is 400', { chaseWhenNoMobileDefault: true }, 400);
    await refused('an empty body is 400', {}, 400);
    const opted = await prisma.personEvent.findUnique({
      where: { id: peOpted.id },
      select: { chaseException: true },
    });
    expectEq('F', 'and the refused opted-out row was not written', opted?.chaseException, null);
    const markedRow = await prisma.personEvent.findUnique({
      where: { id: peMarked.id },
      select: { nudgeMark: true },
    });
    expectEq('F', 'the mark is never written by this path', markedRow?.nudgeMark, 'DONT_CHASE');

    // The live door: no cookie, no write.
    try {
      const res = await realFetch(`${BASE}/api/events/${event.id}/pre-flight/chase`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chaseWhenNoMobileDefault: 'HAND_TO_HOST' }),
      });
      expectEq('F', 'CONTROL, LIVE: the route answers 401 with no session', res.status, 401);
    } catch (e) {
      assert('F', 'CONTROL, LIVE: the dev server is up on :3000', false, String(e));
    }
  } finally {
    try {
      await prisma.assignment.deleteMany({ where: { personId: { in: created.people } } });
      await prisma.item.deleteMany({ where: { team: { eventId: { in: created.events } } } });
      await prisma.personEvent.deleteMany({ where: { eventId: { in: created.events } } });
      await prisma.household.deleteMany({ where: { eventId: { in: created.events } } });
      await prisma.team.deleteMany({ where: { eventId: { in: created.events } } });
      await prisma.eventRole.deleteMany({ where: { eventId: { in: created.events } } });
      await prisma.event.deleteMany({ where: { id: { in: created.events } } });
      await prisma.person.deleteMany({ where: { id: { in: created.people } } });
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
      const leftovers = await prisma.person.count({ where: { name: { startsWith: TAG } } });
      assert('F', 'teardown left no tagged rows behind', leftovers === 0);
    } catch (e) {
      assert('F', 'teardown ran', false, String(e));
    }
    await prisma.$disconnect();
  }
}

async function attemptAsync<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/** The files a commit touched under a path — empty when none. */
function gitShowFiles(rev: string, path: string): string {
  try {
    return execFileSync('git', ['show', '--name-only', '--format=', rev, '--', path], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'git show failed';
  }
}

function gitDiff(path: string): string {
  try {
    return execFileSync('git', ['diff', 'HEAD', '--', path], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return 'git diff failed';
  }
}

function gitUntracked(path: string): string {
  try {
    return execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', path], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'git ls-files failed';
  }
}

/** Files under src/ whose CODE (comments stripped) matches the pattern. */
function grepSrc(pattern: string): string[] {
  let files: string[] = [];
  try {
    files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => /\.(ts|tsx)$/.test(f));
  } catch {
    return [];
  }
  const re = new RegExp(pattern);
  return files.filter((f) => re.test(codeOnly(read(f))));
}

main()
  .catch((e) => {
    assert('!', 'the suite ran to completion', false, String(e));
  })
  .finally(() => {
    console.log('\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m');
    console.log(`Total tests: ${passed + failed}`);
    console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
    console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
    if (failed > 0) {
      console.error('\nRED:');
      for (const r of red) console.error(`  ${r}`);
      process.exit(1);
    }
    process.exit(0);
  });
