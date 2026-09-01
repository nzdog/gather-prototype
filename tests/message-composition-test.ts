/**
 * GTC-187 (H2) — the three-movement ask.
 *
 * Hinge §5 gives the architecture (three movements, seam visible) and Hinge §3 gives the
 * contents. Eight founder rulings (2026-08-23) close the construction questions. This file
 * proves the four of them that are cheap to break silently — one message per person, items
 * named without their logistics, no length cap, and the itemless guest keeping all three
 * movements — plus the one thing that is not a behaviour at all: the register that was
 * deliberately NOT written.
 *
 * TWO LAYERS, no database:
 *  1. Pure — `src/lib/messages/compose.ts` and `ask-register.ts` against fixed inputs. The
 *     composer touches no database by design, so there is nothing to seed and no clock to
 *     fix. `formatEventDay` pins its own timezone, so the dates below are deterministic.
 *  2. Structural — source assertions with comments stripped, for the properties that are
 *     absences: no THANK_YOU_REGISTER, no server import, no logistics field, no host
 *     pronoun. An absence cannot be asserted by calling something.
 *
 * NO SEND, AND NO ROUTE. `/api/events/[id]/pre-flight/message` returns ingredients and
 * composes nothing; its auth is covered by the route-classification gate in the security
 * suite. Dispatch is GTC-189 and does not exist.
 *
 * Run: npx tsx tests/message-composition-test.ts
 * Reads no database and writes nothing.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ASK_REGISTER,
  MOVEMENT_ORDER,
  composeMessage,
  composedCost,
  movementsOf,
} from '../src/lib/messages/compose';
import {
  HOST_NAME_FALLBACK,
  askHandover,
  askSubject,
  askSystemVoice,
  composeAsk,
  draftAuthorLine,
  firstNameOf,
  formatEventDay,
  type AskEventFacts,
} from '../src/lib/messages/ask-register';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

/** Source with comments stripped — naming a thing you excluded must not read as using it. */
function code(rel: string): string {
  return readFileSync(join(__dirname, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const EVENT: AskEventFacts = {
  name: 'Henderson Family Christmas 2026',
  startDate: new Date('2026-12-23T00:00:00.000Z'),
  venueName: "Uncle Rob's place, Mangawhai",
  occasionDescription: null,
};

const HOST = 'Sarah Henderson';

function ask(itemNames: string[], firstName = 'Finn', storedAuthorLine: string | null = null) {
  return composeAsk({
    event: EVENT,
    hostName: HOST,
    recipient: { firstName, itemNames, link: 'https://gather.test/p/tok123' },
    storedAuthorLine,
  });
}

/**
 * The GSM 03.38 default alphabet, plus the escape-table characters. A message made only of
 * these encodes as 7-bit septets at 160 characters a segment; one character outside them
 * puts the WHOLE message on UCS-2 at 70.
 */
const GSM7_BASIC =
  '@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5' +
  '\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9' +
  ' !"#\u00a4%&\'()*+,-./0123456789:;<=>?' +
  '\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7' +
  '\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0';
const GSM7_EXTENSION = '\f^{}\\[~]|\u20ac';
const GSM7 = new Set([...GSM7_BASIC, ...GSM7_EXTENSION]);

/** The characters outside GSM-7 in a string, deduplicated. Empty means the body is clean. */
function nonGsm7(text: string): string[] {
  return [...new Set([...text].filter((c) => !GSM7.has(c)))];
}

function itemlessEndsWithLink(): boolean {
  return composeAsk({
    event: EVENT,
    hostName: HOST,
    recipient: { firstName: 'Grandma', itemNames: [], link: 'https://gather.test/p/tok123' },
  })
    .text.trimEnd()
    .endsWith('https://gather.test/p/tok123');
}

function main() {
  // ══ LAYER 1 — the architecture (compose.ts) ═════════════════════════════

  assert(
    'architecture',
    'ASK_REGISTER is HOST / HOST / SYSTEM — decision 7, verbatim',
    ASK_REGISTER.authorLine === 'HOST' &&
      ASK_REGISTER.handover === 'HOST' &&
      ASK_REGISTER.systemVoice === 'SYSTEM'
  );

  assert(
    'architecture',
    'the movements read in Hinge §5 order: her line, the handover, then Gather',
    JSON.stringify(MOVEMENT_ORDER) === JSON.stringify(['authorLine', 'handover', 'systemVoice'])
  );

  const three = composeMessage(
    { authorLine: 'ONE', handover: 'TWO', systemVoice: 'THREE' },
    ASK_REGISTER
  );
  assert('architecture', 'all three movements join in order', three === 'ONE\n\nTWO\n\nTHREE');

  const noLine = composeMessage(
    { authorLine: null, handover: 'TWO', systemVoice: 'THREE' },
    ASK_REGISTER
  );
  assert(
    'architecture',
    'a null movement 1 is dropped, not rendered as a leading gap',
    noLine === 'TWO\n\nTHREE'
  );

  const blank = composeMessage(
    { authorLine: '   \n  ', handover: 'TWO', systemVoice: 'THREE' },
    ASK_REGISTER
  );
  assert('architecture', 'a whitespace-only movement is dropped too', blank === 'TWO\n\nTHREE');

  const voices = movementsOf(
    { authorLine: 'ONE', handover: 'TWO', systemVoice: 'THREE' },
    ASK_REGISTER
  );
  assert(
    'architecture',
    'each movement carries its voice, so the seam can be rendered (Hinge §5)',
    voices.length === 3 &&
      voices[0].voice === 'HOST' &&
      voices[1].voice === 'HOST' &&
      voices[2].voice === 'SYSTEM'
  );

  // ══ LAYER 1b — decision 1: one message per person, items NAMED ══════════

  const one = ask(['Pavlova']);
  const four = ask(['Pavlova', 'Trifle', 'Whole glazed ham', 'Corn on the cob']);

  assert(
    'decision 1',
    'four items produce ONE message, not four',
    typeof four.text === 'string' && four.movements.length === 3
  );

  assert(
    'decision 1',
    'and every item is named in it',
    ['Pavlova', 'Trifle', 'Whole glazed ham', 'Corn on the cob'].every((n) => four.text.includes(n))
  );

  assert('decision 1', 'a single item is named the same way', one.text.includes('Pavlova'));

  assert(
    'decision 1',
    'the message carries no logistics — no quantity, drop-off or time reaches it',
    !/\b(2 large|8kg|drop.?off|Large bowl|by \d)\b/i.test(four.text)
  );

  // ══ LAYER 1c — decision 3: movement 1 drafted from event data ═══════════

  const draft = draftAuthorLine(EVENT);
  assert(
    'decision 3',
    'the draft names the event, its date and its venue',
    draft.includes('Henderson Family Christmas 2026') &&
      draft.includes('23 December') &&
      draft.includes("Uncle Rob's place")
  );

  assert(
    'decision 3',
    'the date is NZ-local — a midnight-UTC start is still the 23rd to the guest',
    formatEventDay(EVENT.startDate) === 'Wednesday, 23 December'
  );

  assert(
    'decision 3',
    'no venue clause when the event has no venue',
    !draftAuthorLine({ ...EVENT, venueName: null }).includes(' at ')
  );

  assert(
    'decision 3',
    "the host's own occasion words are carried when the event has them",
    draftAuthorLine({ ...EVENT, occasionDescription: 'Third year at the bach.' }).includes(
      'Third year at the bach.'
    )
  );

  assert(
    'decision 3',
    'the draft holds no guest name — decision 2 makes it stored and reused across sends',
    !draft.includes('Finn')
  );

  assert(
    'decision 3',
    "but the composed message greets the guest by name in the host's movement",
    one.movements[0].text.startsWith('Hi Finn') && one.movements[0].voice === 'HOST'
  );

  assert(
    'decision 3',
    'a stored line replaces the draft rather than joining it',
    ask(['Pavlova'], 'Finn', 'Come early, bring togs.').text.includes('Come early, bring togs.') &&
      !ask(['Pavlova'], 'Finn', 'Come early, bring togs.').text.includes('Would love to have you')
  );

  // ══ LAYER 1d — decision 5: one text, two channels ═══════════════════════

  assert(
    'decision 5',
    'email adds a subject and nothing else — the body is the SMS body',
    one.subject.length > 0 && !one.text.includes(one.subject)
  );

  assert(
    'decision 5',
    'the subject names the event and the host',
    one.subject.includes('Henderson Family Christmas 2026') && one.subject.includes('Sarah')
  );

  // ══ LAYER 1e — decision 6: no cap, cost made visible ════════════════════

  const long = ask(['Pavlova'], 'Finn', 'x'.repeat(2000));
  assert(
    'decision 6',
    'a 2000-character line is not truncated',
    long.text.includes('x'.repeat(2000))
  );
  assert('decision 6', 'and its segment count is reported instead', long.segments > 10);
  assert(
    'decision 6',
    'the counter is the one the SMS path already uses (160 GSM-7 / 70 unicode)',
    composedCost('a'.repeat(160)).segments === 1 &&
      composedCost('a'.repeat(161)).segments === 2 &&
      composedCost('é'.repeat(71)).segments === 2
  );

  assert(
    'decision 6',
    'and it says WHEN it is counting at 70 — an em dash halves the budget silently otherwise',
    composedCost('plain ascii').narrowSegments === false &&
      composedCost('an em — dash').narrowSegments === true
  );

  assert(
    'decision 6',
    'a composed ask now reports the wide count — the register carries no em dash (layer 1i)',
    one.narrowSegments === false
  );

  // ══ LAYER 1f — decision 8: the itemless guest ═══════════════════════════

  const itemless = ask([], 'Grandma');

  assert(
    'decision 8',
    'an itemless guest gets all three movements — the handover is NOT dropped',
    itemless.movements.length === 3 &&
      itemless.movements[1].text === askHandover() &&
      itemless.movements[2].voice === 'SYSTEM'
  );

  assert(
    'decision 8',
    'movement 3 is thinner: no item ask',
    !itemless.movements[2].text.includes('Could you bring') &&
      itemless.movements[2].text.length < one.movements[2].text.length
  );

  assert(
    'decision 8',
    'and it still promises to check back — the nudge must not arrive cold (Hinge §5)',
    itemless.movements[2].text.includes('check back')
  );

  assert(
    'decision 8',
    'the itemless guest still gets a link — same page, zero rows',
    itemless.text.includes('https://gather.test/p/tok123')
  );

  // ══ LAYER 1g — Hinge §3 and §5 contents ════════════════════════════════

  assert(
    'hinge',
    'the one decision is stated as yes / no / maybe, one tap',
    /yes, no or maybe/.test(one.text) && /one tap/i.test(one.text)
  );

  assert(
    'hinge',
    'the handover vouches, names Gather once, and says what happens next',
    /Gather/.test(askHandover()) && askHandover().split('Gather').length === 2
  );

  assert(
    'hinge',
    'the message never says what Gather IS — no product description',
    !/\b(app|platform|service|software|tool)\b/i.test(one.text)
  );

  assert(
    'hinge',
    'logistics are pointed at, not carried — the details live on the page',
    /details are on the page/i.test(one.text)
  );

  assert(
    'hinge',
    'the link ENDS the message — nothing follows the one thing being asked for',
    one.text.trimEnd().endsWith('https://gather.test/p/tok123') && itemlessEndsWithLink()
  );

  // ══ LAYER 1h — GTC-256: the host's name ════════════════════════════════

  const nameless = composeAsk({
    event: EVENT,
    hostName: '',
    recipient: { firstName: 'Finn', itemNames: ['Pavlova'], link: 'https://gather.test/p/t' },
  });
  assert(
    'GTC-256',
    'a blank host name falls back rather than composing an empty from-whom',
    nameless.text.includes(firstNameOf(HOST_NAME_FALLBACK))
  );

  assert(
    'GTC-256',
    'the host is addressed by first name, matching the wrap-up and decide-by paths',
    one.text.includes('Sarah') && !one.text.includes('Sarah Henderson')
  );

  // ══ LAYER 1i — GSM-7: the register's words cost single-rate ════════════
  //
  // The body must stay inside GSM-7 so it bills at 160 characters a segment, not 70. This
  // is a COST assertion, not a typography one: measured on Henderson Family Christmas 2026,
  // a single em dash was the only non-ASCII character in a 510-character ask and it took
  // that ask from 4 segments to 8 — double the send cost of every message on the event.
  //
  // ONLY THE BODY, and only the REGISTER'S half of it. `askSubject` is exempt by design
  // (email-only, no segments — see its own comment, and do not "fix" it). Item, venue and
  // person names come from the database and can carry anything; the fixtures below are
  // ASCII-clean on purpose so a failure here means the REGISTER regressed, not the data.

  const bodies = [
    one.text,
    four.text,
    itemless.text,
    ask(['Pavlova'], 'Finn', 'Come early, bring togs.').text,
    nameless.text,
  ];

  assert(
    'GSM-7',
    'every composed body is inside GSM-7 — 160-character segments, not 70',
    bodies.every((b) => nonGsm7(b).length === 0)
  );

  assert(
    'GSM-7',
    'no em dash, en dash, curly quote or ellipsis — the characters that creep back in',
    !bodies.some((b) => /[\u2010-\u2015\u2018\u2019\u201c\u201d\u2026]/.test(b))
  );

  assert(
    'GSM-7',
    "and the repo's own counter agrees the cost is single-rate",
    bodies.every((b) => composedCost(b).narrowSegments === false)
  );

  assert(
    'GSM-7',
    'the subject is deliberately NOT held to this — email has no segments',
    typeof askSubject('X', 'Y') === 'string'
  );

  assert(
    'GSM-7',
    'a non-GSM-7 ITEM NAME still costs double — composition cannot launder the data',
    composedCost(ask(['Roasted k\u016bmara salad']).text).narrowSegments === true
  );

  // ══ LAYER 2 — structural: the absences ═════════════════════════════════

  const composeSrc = code('src/lib/messages/compose.ts');
  const askSrc = code('src/lib/messages/ask-register.ts');
  const routeSrc = code('src/app/api/events/[id]/pre-flight/message/route.ts');

  assert(
    'structural',
    'THANK_YOU_REGISTER exists nowhere — decision 7 left the mapping to a founder ruling',
    !/THANK_YOU_REGISTER/.test(composeSrc + askSrc + routeSrc)
  );

  assert(
    'structural',
    'the composer is client-safe: no Prisma, no next/server',
    !/@prisma\/client|next\/server|from '\.\.?\/prisma'/.test(composeSrc + askSrc)
  );

  assert(
    'structural',
    'no logistics field is even reachable from the composer',
    !/quantity|dropOff|neededBy|decideBy/i.test(composeSrc + askSrc)
  );

  assert(
    'structural',
    'the route selects item names only — it cannot hand logistics to the composer',
    !/quantity|dropOffLocation|dropOffAt/i.test(routeSrc)
  );

  assert(
    'structural',
    'no pronoun is guessed for the host — pronouns are captured nowhere',
    ![one, four, itemless, nameless].some((a) => /\b(she|her|hers|he|him|his)\b/i.test(a.text))
  );

  /*
   * GTC-260 replaced the anchor assertions. Until GTC-259 there was no column, so the test
   * could only pin that the gap was MARKED — `ANCHOR(GTC-187)` in the composer and the route.
   * The column exists and is wired now, so that assertion would pass on a file that had
   * simply kept a stale comment. These pin the wiring itself, which is the fact worth
   * protecting; deleting the old one without a replacement would have been coverage lost.
   */
  assert(
    'structural',
    'the stored line is READ from the column, never hardcoded null again (GTC-260)',
    /storedAuthorLine:\s*event\.askAuthorLine/.test(routeSrc) &&
      !/storedAuthorLine:\s*null/.test(routeSrc)
  );

  assert(
    'structural',
    'the route has a write path, it trims, and it does NOT collapse empty to null (GTC-260)',
    /export async function PATCH/.test(routeSrc) &&
      /raw === null \? null : raw\.trim\(\)/.test(routeSrc) &&
      !/length === 0 \? null/.test(routeSrc)
  );

  /*
   * THE THREE STATES OF Event.askAuthorLine, pinned as behaviour (founder ruling 2026-08-29).
   *
   *   null   never authored        → the generated draft
   *   ''     deliberately no line  → the bare greeting, and NOT the draft
   *   value  her words             → her words
   *
   * The whole ruling lives in one `??` in `composeAsk`, which catches null and not `''`. That
   * is easy to "tidy" into a `||` by someone who reads `''` as a bug, and the tidy would put
   * Gather's draft in the mouth of a host who chose not to speak. These assertions are the
   * reason it must stay as it is. A superseded rule the same day required the write path to
   * normalise `''` to null; it is kept in prisma/schema.prisma and GTC-259 with its reason.
   */
  const nullStored = ask(['pavlova'], 'Finn', null);
  const emptyStored = ask(['pavlova'], 'Finn', '');
  const valueStored = ask(['pavlova'], 'Finn', 'Come hungry, bring nothing but yourself.');

  assert(
    'behaviour',
    'state 1 — NULL falls through to the generated draft (GTC-260)',
    nullStored.movements[0].text.includes(draftAuthorLine(EVENT)) &&
      nullStored.movements[0].text.startsWith('Hi Finn - ')
  );

  assert(
    'behaviour',
    "state 2 — '' is the bare greeting, and does NOT fall through to the draft (GTC-260)",
    emptyStored.movements[0].text === 'Hi Finn,' &&
      !emptyStored.movements[0].text.includes(draftAuthorLine(EVENT))
  );

  assert(
    'behaviour',
    'state 3 — a value is her words, and not the draft (GTC-260)',
    valueStored.movements[0].text === 'Hi Finn - Come hungry, bring nothing but yourself.' &&
      !valueStored.movements[0].text.includes(draftAuthorLine(EVENT))
  );

  assert(
    'behaviour',
    "the three states are mutually distinct — null is not the same message as '' (GTC-260)",
    new Set([
      nullStored.movements[0].text,
      emptyStored.movements[0].text,
      valueStored.movements[0].text,
    ]).size === 3
  );

  assert(
    'behaviour',
    "the handover survives in ALL THREE — §5's load-bearing beat is never the one cut",
    [nullStored, emptyStored, valueStored].every(
      (a) => a.movements.length === 3 && a.movements[1].text === askHandover()
    )
  );

  assert(
    'behaviour',
    "whitespace-only composes as '' — which is why the write stores it as '', not as null",
    ask(['pavlova'], 'Finn', '   ').movements[0].text === emptyStored.movements[0].text
  );

  assert(
    'structural',
    'nothing in the composition path sends — no sendSms, no resend, no fetch',
    !/sendSms|sendNudgeEmail|resend|dispatch/i.test(composeSrc + askSrc + routeSrc)
  );

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log('\x1b[32mGREEN — three movements, one message per person, seam visible.\x1b[0m');
}

main();
