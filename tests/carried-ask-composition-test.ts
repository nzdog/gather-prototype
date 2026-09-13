/**
 * GTC-189 slice 2 — a child's ask carried in an adult's message, asserted with no database, no
 * server and no clock.
 *
 * WHAT THIS SUITE IS FOR. Under the recipient model ruled 2026-09-13, a child's item is carried
 * in their household contact's message — "the only case where a message carries someone else's
 * ask" (GTC-189, THE ASK). GTC-187 decision 1 is narrowed to one message per RECIPIENT (ruling
 * D), so one message can hold two registers: the recipient's own ask, and a child's ask the
 * recipient answers for. `composeAsk` in `src/lib/messages/ask-register.ts` composed for one
 * owner. Ruling D names the two gaps this closes: `AskRecipient` carried no owner name, and
 * `askSystemVoice`'s itemless branch would tell a carrier "Nothing for you to bring".
 *
 * THE WORDS ARE RULED, AND PINNED TWICE. Layer W holds the carried sentences word for word as
 * the founder ruled them at slice 2, and layer R the register's own ask. Layers K to X pin the
 * PROPERTIES beside them — whose item is whose, which movement it sits in, that a carried item
 * never reads as the recipient's to bring — so a later rewording is checked for what matters
 * and not only for its letters. The one property that also constrains word order is [ORDER].
 * [DEFECT GTC-302] pins item names composed exactly as stored: a data problem, filed.
 *
 * NO ASSERTION ABOUT A CARRIED MESSAGE CAN PASS BY ABSENCE. Each first requires the carried ask
 * to be in the message. A composer that dropped carried asks would otherwise satisfy "never
 * reads as the carrier's to bring" by saying nothing — which is exactly today's behaviour.
 *
 * LAYERS
 *   R  the register's own ask — word for word, as built and as since ruled
 *   K  carried only — one child's item, nothing of the carrier's own
 *   B  both — the carrier's item and one child's
 *   C  two carried — two children's items, nothing of the carrier's own
 *   X  a carried item plus two of the carrier's own
 *   W  the carried words, as ruled
 *   J  jobs — done, not brought
 *   V  voice — the carried ask is Gather's sentence; the host's movements do not change
 *   G  GSM-7 — the new sentences cost single-rate
 *   D  dark — every caller passes `carried: []`; slice 3 removes this layer
 *   T  types — decision 1 is not widened: the only other owner a message can name is a child
 *
 * Run: npx tsx tests/carried-ask-composition-test.ts
 * Reads no database. Writes four probe files to a temp directory and deletes them.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  askHandover,
  composeAsk,
  type AskEventFacts,
  type CarriedChildAsk,
  type ComposedAsk,
} from '../src/lib/messages/ask-register';

const ROOT = join(__dirname, '..');
const MODULE_REL = 'src/lib/messages/ask-register.ts';

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

/** Source with comments stripped — naming a thing in prose must not read as using it. */
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
// Fixtures — ruling R's household: Sarah carries Ollie's dishes. Frozen, so a composer that
// mutates what it is handed throws.
// ─────────────────────────────────────────────────────────────────────────────

const EVENT: AskEventFacts = deepFreeze({
  name: 'Henderson Family Christmas 2026',
  startDate: new Date('2026-12-23T00:00:00.000Z'),
  venueName: "Uncle Rob's place, Mangawhai",
  occasionDescription: null,
});
const HOST = 'Kate Henderson';
const LINK = 'https://gather.test/p/tok-sarah';

const OLLIE: CarriedChildAsk = deepFreeze({
  childFirstName: 'Ollie',
  itemNames: ['dishes'],
  jobNames: [],
});
const OLLIE_TWO: CarriedChildAsk = deepFreeze({
  childFirstName: 'Ollie',
  itemNames: ['dishes', 'plates'],
  jobNames: [],
});
const MIA: CarriedChildAsk = deepFreeze({
  childFirstName: 'Mia',
  itemNames: ['fruit salad'],
  jobNames: [],
});

function compose(
  own: string[],
  carried: CarriedChildAsk[],
  storedAuthorLine: string | null = null,
  jobs: string[] = []
): ComposedAsk {
  return composeAsk({
    event: EVENT,
    hostName: HOST,
    recipient: deepFreeze({
      firstName: 'Sarah',
      itemNames: own,
      jobNames: jobs,
      carried,
      link: LINK,
    }),
    storedAuthorLine,
  });
}

const systemText = (a: ComposedAsk) =>
  a.movements.find((m) => m.slot === 'systemVoice')?.text ?? '';
const sentencesOf = (text: string) => text.split(/(?<=[.?!])\s+/);
const sentencesWith = (text: string, needle: string) =>
  sentencesOf(text).filter((s) => s.includes(needle));
const names = (text: string, name: string) => new RegExp(`\\b${name}\\b`).test(text);
const includesAll = (text: string, needles: string[]) => needles.every((n) => text.includes(n));

/** The recipient asked to take something on: "Would you bring", "for you to bring", "you're
 *  bringing", "can you also bring", "Would you do". Second person GOVERNING bring or do — not
 *  any sentence that happens to hold the words. */
const ASKED_TO_ACT = /\byou(?:'re|\s+are)?\s+(?:to\s+|also\s+)?(?:bring|do\b)/i;
/** The item framed as the recipient's. */
const POSSESSED = /\byours?\b/i;
/** The existing suite's pronoun check: pronouns are captured nowhere, so any is a guess. */
const GENDERED = /\b(she|her|hers|he|him|his)\b/i;

/** A carried item reads as the child's: every sentence holding it names the child, and none
 *  asks the recipient to bring it or calls it theirs. False when the item is absent. */
function readsAsTheChilds(text: string, child: string, item: string): boolean {
  const found = sentencesWith(text, item);
  return (
    found.length > 0 &&
    found.every((s) => names(s, child) && !ASKED_TO_ACT.test(s) && !POSSESSED.test(s))
  );
}

/** The nearest child named before the item's first appearance — whose item it reads as. */
function ownerBefore(text: string, item: string, children: string[]): string | null {
  const at = text.indexOf(item);
  if (at < 0) return null;
  let best: { name: string; index: number } | null = null;
  for (const name of children) {
    for (const m of text.slice(0, at).matchAll(new RegExp(`\\b${name}\\b`, 'g'))) {
      if (m.index !== undefined && (!best || m.index > best.index)) best = { name, index: m.index };
    }
  }
  return best?.name ?? null;
}

/** The same GSM 03.38 table `tests/message-composition-test.ts` layer 1i uses. */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅå' +
  'Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ' +
  ' !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§' +
  '¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7 = new Set([...GSM7_BASIC, ...'\f^{}\\[~]|€']);
const nonGsm7 = (text: string) => [...new Set([...text].filter((c) => !GSM7.has(c)))];

// ─────────────────────────────────────────────────────────────────────────────
section("Layer R: the register's own ask — as built, and as since ruled");
// ─────────────────────────────────────────────────────────────────────────────

const ownOnly = compose(['pavlova'], []);
const ownTwo = compose(['pavlova', 'trifle'], []);
const nothing = compose([], []);

assert(
  'R',
  'own item only, nothing carried: movement 3 word for word, as ruled — would, and a sentence',
  systemText(ownOnly) ===
    `Hi - Gather here, helping Kate with this one. Would you bring the pavlova? ` +
      `I'll check back if I haven't heard from you. ` +
      `One tap to say yes, no or maybe - the details are on the page: ${LINK}`,
  systemText(ownOnly)
);
assert(
  'R',
  'two own items: one sentence, "the pavlova and the trifle"',
  systemText(ownTwo).includes('Would you bring the pavlova and the trifle?') &&
    systemText(ownTwo).split('Would you bring').length === 2
);
assert(
  'R',
  'three or more: a comma list with "and" before the last, every item with its "the"',
  systemText(compose(['pavlova', 'trifle', 'ham'], [])).includes(
    'Would you bring the pavlova, the trifle and the ham?'
  )
);
assert(
  'R',
  'no colon list anywhere — "bring:" is a form field, not a sentence',
  [ownOnly, ownTwo, compose([], [OLLIE]), compose(['pavlova'], [OLLIE])].every(
    (a) => /\bbring the\b/.test(a.text) && !/bring:/.test(a.text)
  )
);
assert(
  'R',
  "no items and nothing carried: decision 8's itemless message, word for word",
  systemText(nothing) ===
    `Hi - Gather here, helping Kate with this one. Nothing for you to bring. ` +
      `I'll check back if I haven't heard from you. ` +
      `One tap to say whether you can make it: ${LINK}`,
  systemText(nothing)
);

// WOULD, NOT COULD — founder ruling on the whole register: "Could asks whether she is able;
// would asks whether she is willing, and willing is what is being asked." One voice means no
// sentence says could, carried or not. Presence of "Would you" is required so it cannot pass
// by a message that asks nothing.
const everyShape = [
  ownOnly,
  ownTwo,
  compose([], [OLLIE]),
  compose(['pavlova'], [OLLIE]),
  compose([], [OLLIE_TWO, MIA]),
  compose(['pavlova', 'trifle'], [OLLIE]),
];
assert(
  'R',
  'WOULD, not could: every ask and every carried question says would, and nothing says could',
  everyShape.every((a) => /\bWould you\b/.test(systemText(a))) &&
    ![...everyShape, nothing].some((a) => /\bcould\b/i.test(a.text))
);

// ─────────────────────────────────────────────────────────────────────────────
section("Layer K: carried only — Ollie's dishes, nothing of the carrier's own");
// ─────────────────────────────────────────────────────────────────────────────

const carriedOnly = compose([], [OLLIE]);
const k = systemText(carriedOnly);

assert(
  'K',
  "the child's item is named with the child, and reads as the child's (ruling D item 1)",
  readsAsTheChilds(k, 'Ollie', 'dishes'),
  k
);
assert(
  'K',
  'the carrier is not told "Nothing for you to bring" (ruling D item 2)',
  k.includes('dishes') && !/nothing for you to bring/i.test(carriedOnly.text)
);
assert(
  'K',
  'nothing in the message asks the carrier to bring anything',
  carriedOnly.text.includes('dishes') && !ASKED_TO_ACT.test(carriedOnly.text)
);
assert(
  'K',
  "the carrier is asked for the one decision on the child's item — yes, no or maybe (Hinge §3)",
  k.includes('dishes') && /yes, no or maybe/.test(k)
);
assert(
  'K',
  'one message: three movements, the handover intact, the carried ask inside movement 3',
  carriedOnly.movements.length === 3 &&
    carriedOnly.movements[1].text === askHandover() &&
    k.includes('dishes')
);
assert(
  'K',
  'still promises to check back — a carried ask is chased like one (ruling R), never cold',
  k.includes('dishes') && /check back/.test(k)
);
assert(
  'K',
  'the link still ends the message',
  carriedOnly.text.includes('dishes') && carriedOnly.text.trimEnd().endsWith(LINK)
);

const withEmpty = compose([], [{ childFirstName: 'Ollie', itemNames: [], jobNames: [] }, MIA]);
assert(
  'K',
  'a carried entry with no items and no jobs adds nothing — a child is named only with something to answer for',
  withEmpty.text.includes('fruit salad') && !names(withEmpty.text, 'Ollie')
);

// ─────────────────────────────────────────────────────────────────────────────
section("Layer B: both — the carrier's pavlova and Ollie's dishes");
// ─────────────────────────────────────────────────────────────────────────────

const both = compose(['pavlova'], [OLLIE]);
const b = systemText(both);

assert(
  'B',
  'both items are named in the one message',
  includesAll(both.text, ['pavlova', 'dishes'])
);
assert(
  'B',
  "the carrier's own item is still asked of the carrier, in a sentence naming no child",
  b.includes('dishes') &&
    sentencesWith(b, 'pavlova').length > 0 &&
    sentencesWith(b, 'pavlova').every((s) => ASKED_TO_ACT.test(s) && !names(s, 'Ollie'))
);
assert(
  'B',
  "the child's item reads as the child's, never the carrier's to bring",
  readsAsTheChilds(b, 'Ollie', 'dishes'),
  b
);
assert(
  'B',
  'no sentence holds both items — the two registers are not merged into one list',
  includesAll(b, ['pavlova', 'dishes']) &&
    sentencesOf(b).every((s) => !(s.includes('pavlova') && s.includes('dishes')))
);
assert(
  'B',
  'one message, not two: three movements, both asks inside movement 3, one link, last',
  both.movements.length === 3 &&
    includesAll(b, ['pavlova', 'dishes']) &&
    both.text.split(LINK).length === 2 &&
    both.text.trimEnd().endsWith(LINK)
);

// ─────────────────────────────────────────────────────────────────────────────
section("Layer C: two carried — Ollie's dishes and plates, Mia's fruit salad");
// ─────────────────────────────────────────────────────────────────────────────

const two = compose([], [OLLIE_TWO, MIA]);
const c = systemText(two);
const CHILDREN = ['Ollie', 'Mia'];

assert(
  'C',
  'both children and all three items are named',
  includesAll(c, ['Ollie', 'Mia', 'dishes', 'plates', 'fruit salad'])
);
assert(
  'C',
  '[ORDER] each item is attributed to its own child — the nearest child named before it',
  ownerBefore(c, 'dishes', CHILDREN) === 'Ollie' &&
    ownerBefore(c, 'plates', CHILDREN) === 'Ollie' &&
    ownerBefore(c, 'fruit salad', CHILDREN) === 'Mia',
  c
);
assert(
  'C',
  "each item reads as its child's, not the carrier's to bring",
  readsAsTheChilds(c, 'Ollie', 'dishes') &&
    readsAsTheChilds(c, 'Ollie', 'plates') &&
    readsAsTheChilds(c, 'Mia', 'fruit salad')
);
assert(
  'C',
  'no "Nothing for you to bring", and nothing asks the carrier to bring',
  includesAll(c, ['dishes', 'fruit salad']) &&
    !/nothing for you to bring/i.test(two.text) &&
    !ASKED_TO_ACT.test(two.text)
);
assert(
  'C',
  'one message for two children: three movements, one link, last',
  includesAll(c, ['dishes', 'fruit salad']) &&
    two.movements.length === 3 &&
    two.text.split(LINK).length === 2 &&
    two.text.trimEnd().endsWith(LINK)
);
assert(
  'C',
  'no pronoun is guessed for either child',
  includesAll(two.text, ['Ollie', 'Mia']) && !GENDERED.test(two.text)
);

// ─────────────────────────────────────────────────────────────────────────────
section("Layer X: a carried item plus two of the carrier's own");
// ─────────────────────────────────────────────────────────────────────────────

const mixed = compose(['pavlova', 'trifle'], [OLLIE]);
const x = systemText(mixed);

assert(
  'X',
  "both of the carrier's items are asked of the carrier, in sentences naming no child",
  x.includes('dishes') &&
    ['pavlova', 'trifle'].every(
      (item) =>
        sentencesWith(x, item).length > 0 &&
        sentencesWith(x, item).every((s) => ASKED_TO_ACT.test(s) && !names(s, 'Ollie'))
    )
);
assert('X', "the child's item reads as the child's", readsAsTheChilds(x, 'Ollie', 'dishes'), x);
assert(
  'X',
  "no sentence mixes the carrier's items with the child's",
  includesAll(x, ['pavlova', 'trifle', 'dishes']) &&
    sentencesOf(x).every((s) => !(/pavlova|trifle/.test(s) && s.includes('dishes')))
);
assert(
  'X',
  'one message: three movements, all three items inside movement 3',
  mixed.movements.length === 3 && includesAll(x, ['pavlova', 'trifle', 'dishes'])
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer W: the carried words, as ruled');
// ─────────────────────────────────────────────────────────────────────────────
//
// Ruled at slice 2 (GTC-189, "Founder answers — the slice 2 words"): would, not could; a
// sentence, not a colon list; on behalf, not "answer for" — "Answering FOR him reads as
// speaking in his voice. She is confirming on his behalf, which is a different thing and the
// true one." One child is NAMED in that question, because a pronoun is captured nowhere (the
// founder's choice); two or more are "their". Beside the carrier's own ask, "also" sits before
// "answer", so it reads "as well as bringing yours" and not "on somebody else's behalf as
// well". No "please": read beside the plain own ask, one question polite and the next plain is
// two voices, and "on behalf" already carries the courtesy.

const SPEAKER = 'Hi - Gather here, helping Kate with this one.';
const TAIL =
  "I'll check back if I haven't heard from you. " +
  `One tap to say yes, no or maybe - the details are on the page: ${LINK}`;
const pin = (label: string, actual: ComposedAsk, middle: string) =>
  assert('W', label, systemText(actual) === `${SPEAKER} ${middle} ${TAIL}`, systemText(actual));

pin(
  "one child, nothing of the carrier's own",
  carriedOnly,
  "Ollie has been asked to bring the dishes. Would you answer on Ollie's behalf?"
);
pin(
  "the carrier's own item and one child's",
  both,
  'Would you bring the pavlova? Ollie has been asked to bring the dishes. ' +
    "Would you also answer on Ollie's behalf?"
);
pin(
  'two children, one with two items',
  two,
  'Ollie has been asked to bring the dishes and the plates. ' +
    'Mia has been asked to bring the fruit salad. Would you answer on their behalf?'
);
pin(
  "one child's item and two of the carrier's own",
  mixed,
  'Would you bring the pavlova and the trifle? Ollie has been asked to bring the dishes. ' +
    "Would you also answer on Ollie's behalf?"
);
assert(
  'W',
  'on behalf, never "answer for" — confirming for the child, not speaking in the child\'s voice',
  [carriedOnly, both, two, mixed].every((a) => /\bon (Ollie's|their) behalf\b/.test(a.text)) &&
    ![carriedOnly, both, two, mixed].some((a) => /\banswer(ing)? for\b/i.test(a.text))
);
assert(
  'W',
  'one child is named in the behalf question and two are "their" — no pronoun guessed for any',
  carriedOnly.text.includes("on Ollie's behalf") &&
    two.text.includes('on their behalf') &&
    ![carriedOnly, both, two, mixed].some((a) => GENDERED.test(a.text))
);

assert(
  'W',
  'no "please" anywhere — one question polite and the next plain is two voices (founder ruling)',
  [carriedOnly, both, two, mixed].every((a) => /\bWould you (also )?answer on\b/.test(a.text)) &&
    ![ownOnly, ownTwo, nothing, carriedOnly, both, two, mixed].some((a) =>
      /\bplease\b/i.test(a.text)
    )
);

// [DEFECT GTC-302] Item names are composed exactly as stored: no casing fix, no article
// stripped. gather_dev holds Title Case generated names and seeded names that already begin
// "The", so the ruled sentence reads "the Berry Trifle" and "the The pavlova" on that data.
// The founder chose to see that rather than have composition hide it. Expected to change only
// if GTC-302 rules that composition should.
assert(
  'W',
  '[DEFECT GTC-302] names are composed as stored — "The pavlova" reads "the The pavlova"',
  systemText(compose(['The pavlova', 'Berry Trifle'], [])).includes(
    'Would you bring the The pavlova and the Berry Trifle?'
  )
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer J: jobs — done, not brought');
// ─────────────────────────────────────────────────────────────────────────────
//
// Founder ruling (GTC-189, "Founder answers — the slice 2 words", answer 6): "A job is DONE, not
// brought — that is the whole ruling and it changes one word." A job is an `Item` row whose
// `kind` is TASK, handed to composition as `jobNames`. One person holding both kinds is asked in
// ONE sentence — "Would you bring the pavlova and do the dishes?" — and with two or more to bring,
// a comma before "and do" (decision 22). A carried child holding both kinds is one sentence the
// same way: the executor's extension of the founder's one-person rule, which the founder agreed
// with and did not rule. The carried half is otherwise unchanged. Jobs are NEVER
// filtered out: a filtered job reaches nobody, and a child's job reaching an adult is what the
// carried ask exists for.
//
// ⚠ RULED BEFORE THE CASE EXISTED. When these were written gather_dev held no TASK rows and a job
// added by hand was stored as a dish; [[GTC-302]] gave the add routes a kind. The preview still
// hands composition no kind until GTC-189 slice 3, so these assertions hold the sentence ready for
// the first job that reaches it.

function verbBefore(text: string, name: string): string | null {
  const at = text.indexOf(name);
  if (at < 0) return null;
  const verbs = [...text.slice(0, at).matchAll(/\b(bring|do)\b/g)];
  return verbs.length > 0 ? verbs[verbs.length - 1][1] : null;
}

const OLLIE_JOB: CarriedChildAsk = deepFreeze({
  childFirstName: 'Ollie',
  itemNames: [],
  jobNames: ['dishes'],
});
const ownJob = compose([], [], null, ['dishes']);
const ownBoth = compose(['pavlova'], [], null, ['dishes']);
const carriedJob = compose([], [OLLIE_JOB]);
const carriedJobBesideOwn = compose(['pavlova'], [OLLIE_JOB]);
const childBoth = compose(
  [],
  [deepFreeze({ childFirstName: 'Ollie', itemNames: ['plates'], jobNames: ['dishes'] })]
);
const jobShapes = [ownJob, ownBoth, carriedJob, carriedJobBesideOwn, childBoth];
const jobPin = (label: string, actual: ComposedAsk, middle: string) =>
  assert('J', label, systemText(actual) === `${SPEAKER} ${middle} ${TAIL}`, systemText(actual));

jobPin('own job: "Would you do the dishes?"', ownJob, 'Would you do the dishes?');
jobPin(
  'own dish and own job, one person: ONE sentence — "Would you bring the pavlova and do the dishes?"',
  ownBoth,
  'Would you bring the pavlova and do the dishes?'
);
jobPin(
  "carried job, nothing of the carrier's own",
  carriedJob,
  "Ollie has been asked to do the dishes. Would you answer on Ollie's behalf?"
);
jobPin(
  "carried job beside the carrier's own dish — the carried half as ruled, one word changed",
  carriedJobBesideOwn,
  'Would you bring the pavlova? Ollie has been asked to do the dishes. ' +
    "Would you also answer on Ollie's behalf?"
);
jobPin(
  'a carried child holding both kinds is one sentence too',
  childBoth,
  "Ollie has been asked to bring the plates and do the dishes. Would you answer on Ollie's behalf?"
);
assert(
  'J',
  'a job is done and never brought; a dish is brought and never done — the verb before each name',
  (
    [
      [ownJob, 'dishes', 'do'],
      [ownBoth, 'pavlova', 'bring'],
      [ownBoth, 'dishes', 'do'],
      [carriedJob, 'dishes', 'do'],
      [carriedJobBesideOwn, 'pavlova', 'bring'],
      [carriedJobBesideOwn, 'dishes', 'do'],
      [childBoth, 'plates', 'bring'],
      [childBoth, 'dishes', 'do'],
    ] as Array<[ComposedAsk, string, string]>
  ).every(([a, name, verb]) => verbBefore(systemText(a), name) === verb)
);
assert(
  'J',
  "NOT FILTERED: a child whose only row is a job is still carried to an adult, as the child's",
  readsAsTheChilds(systemText(carriedJob), 'Ollie', 'dishes') &&
    readsAsTheChilds(systemText(carriedJobBesideOwn), 'Ollie', 'dishes')
);
assert(
  'J',
  'someone holding only a job is not itemless — no "Nothing for you to bring", no attendance ask',
  [ownJob, carriedJob].every(
    (a) =>
      a.text.includes('dishes') &&
      !/nothing for you to bring/i.test(a.text) &&
      !/whether you can make it/.test(a.text) &&
      /yes, no or maybe/.test(a.text)
  )
);
assert(
  'J',
  'one voice in the job sentences: would, never could, never please',
  jobShapes.every(
    (a) =>
      a.text.includes('dishes') &&
      /\bWould you\b/.test(a.text) &&
      !/\bcould\b|\bplease\b/i.test(a.text)
  )
);
assert(
  'J',
  'the job sentences are inside GSM-7 and single-rate',
  jobShapes.every(
    (a) => a.text.includes('dishes') && nonGsm7(a.text).length === 0 && !a.narrowSegments
  )
);

// DECISION 22, ruled: with two or more to bring, a comma before "and do". Without it the list's
// own "and" sits beside the "and" before "do", and "the trifle and do" reads for a beat like a
// third dish. FOUND AT TWO, NOT THREE — the obvious test case is the long one, and the collision
// is worst at the short one — so two is pinned first. One to bring has no list "and" to collide
// with and takes no comma; nor does a list of jobs, which ends the sentence.
jobPin(
  'decision 22: TWO to bring beside a job — a comma before "and do"',
  compose(['pavlova', 'trifle'], [], null, ['dishes']),
  'Would you bring the pavlova and the trifle, and do the dishes?'
);
jobPin(
  'decision 22: three to bring beside a job — the comma still',
  compose(['pavlova', 'trifle', 'ham'], [], null, ['dishes']),
  'Would you bring the pavlova, the trifle and the ham, and do the dishes?'
);
jobPin(
  'decision 22 reaches a carried child holding two to bring and a job',
  compose(
    [],
    [deepFreeze({ childFirstName: 'Ollie', itemNames: ['plates', 'cups'], jobNames: ['dishes'] })]
  ),
  "Ollie has been asked to bring the plates and the cups, and do the dishes. Would you answer on Ollie's behalf?"
);
assert(
  'J',
  'decision 22: no comma where no list "and" can collide — one to bring, or a list of jobs last',
  systemText(ownBoth).includes('Would you bring the pavlova and do the dishes?') &&
    systemText(compose(['pavlova'], [], null, ['dishes', 'bins'])).includes(
      'Would you bring the pavlova and do the dishes and the bins?'
    )
);

// [DEFECT GTC-302] The generator's example job name is a verb phrase — "Wash the dishes" — so a
// job named as the prompt asks reads "do the Wash the dishes". The ruled sentence needs a
// noun-phrase name. A job typed by hand is led by the "Do the ___" label since GTC-302; the
// prompt's naming is GTC-302's still, ordered after GTC-189 slice 3.
assert(
  'J',
  '[DEFECT GTC-302] a job named as the generator is prompted — "Wash the dishes" — reads "do the Wash the dishes"',
  systemText(compose([], [], null, ['Wash the dishes'])).includes(
    'Would you do the Wash the dishes?'
  )
);

// ─────────────────────────────────────────────────────────────────────────────
section("Layer V: voice — the carried ask is Gather's; the host's movements do not move");
// ─────────────────────────────────────────────────────────────────────────────

assert(
  'V',
  'movement 1 and the handover are byte-identical with and without a carried ask',
  [
    [both, ownOnly],
    [carriedOnly, nothing],
  ].every(
    ([withCarry, without]) =>
      systemText(withCarry).includes('dishes') &&
      withCarry.movements[0].text === without.movements[0].text &&
      withCarry.movements[1].text === without.movements[1].text
  )
);

const togs = 'Come early, bring togs.';
const storedWith = compose(['pavlova'], [OLLIE], togs);
const storedWithout = compose(['pavlova'], [], togs);
assert(
  'V',
  "a stored line stays the host's words, unchanged by what the recipient carries",
  systemText(storedWith).includes('dishes') &&
    storedWith.movements[0].text === storedWithout.movements[0].text &&
    storedWith.movements[0].text === `Hi Sarah - ${togs}`
);
assert(
  'V',
  "the carried ask appears only in Gather's movement, voiced SYSTEM (ASK_REGISTER)",
  [carriedOnly, both, two, mixed].every((a) => {
    const holding = a.movements.filter((m) => m.text.includes('dishes'));
    return (
      holding.length === 1 && holding[0].slot === 'systemVoice' && holding[0].voice === 'SYSTEM'
    );
  })
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer G: GSM-7 — the new sentences cost single-rate');
// ─────────────────────────────────────────────────────────────────────────────
//
// The fixtures are ASCII-clean on purpose: a failure here means the REGISTER's new words
// regressed, not the data.

const carriedShapes = [carriedOnly, both, two, mixed];
const allCarry = carriedShapes.every((a) => systemText(a).includes('dishes'));

assert(
  'G',
  'every carried shape is inside GSM-7 — 160-character segments, not 70',
  allCarry && carriedShapes.every((a) => nonGsm7(a.text).length === 0)
);
assert(
  'G',
  'no em dash, en dash, curly quote or ellipsis in the new sentences',
  allCarry && !carriedShapes.some((a) => /[‐-―‘’“”…]/.test(a.text))
);
assert(
  'G',
  "and the repo's own counter agrees the cost is single-rate",
  allCarry && carriedShapes.every((a) => a.narrowSegments === false)
);
const tane = compose([], [{ childFirstName: 'Tāne', itemNames: ['dishes'], jobNames: [] }]);
assert(
  'G',
  'a non-GSM-7 CHILD name still costs double — composition cannot launder the data',
  tane.text.includes('Tāne') && tane.narrowSegments === true
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer D: dark — nothing composes a carried ask yet');
// ─────────────────────────────────────────────────────────────────────────────
//
// A DELIBERATE TEMPORARY STATE. GTC-189 slice 3 routes carried asks into the preview and
// removes this layer; until then a caller carrying something is a slice boundary crossed.

function carriedAtCallSites(src: string) {
  const code = codeOnly(src);
  const calls = (code.match(/\bcomposeAsk\(/g) ?? []).length;
  const empty = (code.match(/\bcarried:\s*\[\s*\]/g) ?? []).length;
  const any = (code.match(/\bcarried:/g) ?? []).length;
  const jobsEmpty = (code.match(/\bjobNames:\s*\[\s*\]/g) ?? []).length;
  const jobsAny = (code.match(/\bjobNames:/g) ?? []).length;
  return { calls, empty, other: any - empty, jobsEmpty, jobsOther: jobsAny - jobsEmpty };
}

const plantedCarry = carriedAtCallSites(
  'composeAsk({ recipient: { jobNames: [job], carried: [ollie] } })'
);
const plantedEmpty = carriedAtCallSites('composeAsk({ recipient: { jobNames: [], carried: [] } })');
const plantedComment = carriedAtCallSites('// composeAsk({ carried: [ollie] })\nconst y = 1;');
assert(
  'D',
  'CONTROL: the matcher sees a carrying call, an empty one, and ignores a comment',
  plantedCarry.calls === 1 &&
    plantedCarry.other === 1 &&
    plantedCarry.jobsOther === 1 &&
    plantedEmpty.calls === 1 &&
    plantedEmpty.empty === 1 &&
    plantedEmpty.other === 0 &&
    plantedEmpty.jobsEmpty === 1 &&
    plantedEmpty.jobsOther === 0 &&
    plantedComment.calls === 0 &&
    plantedComment.other === 0
);

const callers: Array<{ rel: string } & ReturnType<typeof carriedAtCallSites>> = [];
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
    if (rel === MODULE_REL) continue;
    const found = carriedAtCallSites(readFileSync(full, 'utf-8'));
    if (found.calls > 0) callers.push({ rel, ...found });
  }
}
for (const dir of ['src', 'scripts']) walk(join(ROOT, dir));

assert(
  'D',
  'every composeAsk call in src and scripts passes carried: [] — and there is at least one',
  callers.length > 0 && callers.every((f) => f.other === 0 && f.empty >= f.calls),
  JSON.stringify(callers)
);
// NOT A FILTER, AND NOT DARK BY CHOICE. The preview route selects no `Item.kind`, so it has no
// jobs to hand over: every assigned row, a generated TASK included, still arrives in `itemNames`
// and reads "bring" on the pre-flight page. Slice 3 splits them; this assertion goes with it.
assert(
  'D',
  'every composeAsk call in src and scripts passes jobNames: [] — the preview reads no kind yet',
  callers.length > 0 && callers.every((f) => f.jobsOther === 0 && f.jobsEmpty >= f.calls),
  JSON.stringify(callers)
);

// ─────────────────────────────────────────────────────────────────────────────
section('Layer T: types — decision 1 is not widened');
// ─────────────────────────────────────────────────────────────────────────────
//
// "A carried ask is the only thing that travels in someone else's message — an adult's ask
// never does." Composition cannot see roles; the chooser decides who carries. What composition
// CAN hold is its shape: the only other owner a recipient can name is a child, by that name,
// and a required `carried` — because a caller that left it out would compose "Nothing for you
// to bring" to a carrier, silently, which is ruling D item 2 all over again. `jobNames` is
// required for the same reason: a caller with nowhere to put a job puts it among the dishes,
// where it reads "bring".
//
// Adding a field to either interface is allowed. It must be a conscious edit to this layer.

function fieldsOf(src: string, iface: string): string[] | null {
  const m = new RegExp(`export interface ${iface}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(codeOnly(src));
  if (!m) return null;
  return [...m[1].matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gm)].map((f) => f[1]).sort();
}

const moduleSrc = readFileSync(join(ROOT, MODULE_REL), 'utf-8');
assert(
  'T',
  "AskRecipient's fields are exactly firstName, itemNames, jobNames, carried and link",
  JSON.stringify(fieldsOf(moduleSrc, 'AskRecipient')) ===
    JSON.stringify(['carried', 'firstName', 'itemNames', 'jobNames', 'link']),
  JSON.stringify(fieldsOf(moduleSrc, 'AskRecipient'))
);
assert(
  'T',
  "CarriedChildAsk's fields are exactly childFirstName, itemNames and jobNames — a child's",
  JSON.stringify(fieldsOf(moduleSrc, 'CarriedChildAsk')) ===
    JSON.stringify(['childFirstName', 'itemNames', 'jobNames']),
  JSON.stringify(fieldsOf(moduleSrc, 'CarriedChildAsk'))
);

const probeDir = mkdtempSync(join(tmpdir(), 'gtc189-carried-probe-'));
const MODULE_IMPORT = join(ROOT, MODULE_REL).replace(/\.ts$/, '');
const PROBES: Record<string, string> = {
  control:
    `export const r: AskRecipient = { firstName: 'Sarah', itemNames: ['pavlova'], ` +
    `jobNames: ['dishes'], carried: [{ childFirstName: 'Ollie', itemNames: [], ` +
    `jobNames: ['bins'] }], link: 'x' };`,
  'no-carried':
    `export const r: AskRecipient = { firstName: 'Sarah', itemNames: ['pavlova'], ` +
    `jobNames: [], link: 'x' };`,
  'no-child-name':
    `export const r: AskRecipient = { firstName: 'Sarah', itemNames: [], jobNames: [], ` +
    `carried: [{ itemNames: ['dishes'], jobNames: [] }], link: 'x' };`,
  'no-jobs':
    `export const r: AskRecipient = { firstName: 'Sarah', itemNames: ['pavlova'], ` +
    `carried: [], link: 'x' };`,
  'owned-item': `export const n: AskRecipient['itemNames'] = [{ name: 'pavlova', ownerFirstName: 'Mum' }];`,
};

try {
  const files = Object.entries(PROBES).map(([name, body]) => {
    const file = join(probeDir, `probe-${name}.ts`);
    writeFileSync(file, `import type { AskRecipient } from '${MODULE_IMPORT}';\n${body}\n`);
    return file;
  });
  const config = join(probeDir, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      extends: join(ROOT, 'tsconfig.json'),
      compilerOptions: { incremental: false, plugins: [] },
      files,
      include: [],
    })
  );

  let output = '';
  try {
    execFileSync('npx', ['tsc', '-p', config, '--pretty', 'false'], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }

  // One error entry per `file(line,col): error` line, with its indented continuation lines.
  const entries = output.split(/\n(?=\S[^\n]*\.ts\(\d+,\d+\): error)/);
  const errorsFor = (name: string) =>
    entries.filter((e) => e.includes(`probe-${name}.ts(`)).join('\n');

  assert(
    'T',
    "CONTROL: a complete recipient carrying a child's ask typechecks",
    errorsFor('control') === '',
    errorsFor('control') || undefined
  );
  assert(
    'T',
    'a recipient without carried does not typecheck, and the error names it',
    /\bcarried\b/.test(errorsFor('no-carried')) && /is missing/.test(errorsFor('no-carried')),
    errorsFor('no-carried') || 'no error'
  );
  assert(
    'T',
    'a recipient without jobNames does not typecheck, and the error names it',
    /\bjobNames\b/.test(errorsFor('no-jobs')) && /is missing/.test(errorsFor('no-jobs')),
    errorsFor('no-jobs') || 'no error'
  );
  assert(
    'T',
    "a carried ask without the child's name does not typecheck, and the error names it",
    /\bchildFirstName\b/.test(errorsFor('no-child-name')),
    errorsFor('no-child-name') || 'no error'
  );
  assert(
    'T',
    "the recipient's own items stay names only — no owner can be attached to them (decision 1)",
    /not assignable to type 'string'/.test(errorsFor('owned-item')),
    errorsFor('owned-item') || 'no error'
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
