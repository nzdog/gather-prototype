/**
 * GTC-449 S2.6 (ruling 76) — the pre-flight area's test file. For now it holds the W8 part of item
 * 13 of "The tests" in docs/tickets/GTC-449.md: the card marker. Step S2.5 adds its own checks
 * (W5, W6, W7 and the two-line row, items 6 and 13) to this same file.
 *
 * W8 (ruling 14), exactly: "Josh (decide later)" beside the kid's name on the saved household
 * card. The name, one space, then "(decide later)" in lower case with round brackets. It is the
 * only new sentence here; there is no other, and none may be added without a ruling.
 *
 * What this file pins:
 *   - the words: the code's words are the ticket's W8 words, so a word changed on one side only
 *     is red (W.1);
 *   - where it shows: on the kid line of a SAVED household card, only for a kid saved as decide
 *     later, once per such kid, with the name before it and a space between (W8.1 to W8.7). That
 *     includes her own household's card (W8.5), a flagged kid with no name (W8.6, the founder's
 *     answer in S2.6: the words are a warning, so they are never hidden) and the whole chain from a stored
 *     marker through the setup page's own mapper to the drawn card (W8.7);
 *   - where it must NOT show, and what must not change: an unflagged kid draws exactly the old
 *     markup (W8.8, W8.9); an adult row never shows it (W8.10); the typed "not saved yet" card
 *     and the "Editing" card never show it (W8.11, W8.12);
 *   - that it is display only: no button, link or count changes (W8.13), the card file gains no
 *     fetch, router, link or click handler (W8.14), and W9's quiet line is unaffected (W8.15).
 *
 * HOW IT IS RUN WITHOUT A BROWSER. The real card (`HouseholdCardList`) is drawn to markup with
 * React's server renderer and the markup is read as text; the way decide-later-form-test.ts
 * already reads W9 off the same card. The setup page's `apiHouseholdToSaved` lives inside the
 * page's component, so it is read out of the page's live source with the TypeScript parser and
 * run on its own, as that test does. Nothing here reads a database, calls the network, or can
 * send anything.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/decide-later-preflight-test.ts
 * Writes nothing: no rows, no files.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import * as ReactAll from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import * as ts from 'typescript';

import HouseholdCardList from '../src/components/plan/HouseholdCardList';
import * as CardModule from '../src/components/plan/HouseholdCardList';

const ROOT = path.join(__dirname, '..');
const CARD = 'src/components/plan/HouseholdCardList.tsx';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const TICKET = 'docs/tickets/GTC-449.md';
/** The commit before S2.6 (S2.4's): the card file is as S2.3 left it. */
const BEFORE_S26 = '87f9c3a';

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function assert(id: string, label: string, condition: boolean, got?: unknown) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 300)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const readAt = (commit: string, rel: string) => {
  try {
    return execFileSync('git', ['show', `${commit}:${rel}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
};

// ── The words (W8, as ruled) ─────────────────────────────────────────────────
/** What the card file says, read from its exported words (undefined until the card has them). */
const codeMarker: unknown = (CardModule as any).DECIDE_LATER_WORDS?.marker;
const MARKER = '(decide later)';
const W8 = (name: string) => `${name} ${MARKER}`;

// ── Small helpers over the card's markup ─────────────────────────────────────
const draw = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    ReactAll.createElement(HouseholdCardList as any, { onEdit: () => {}, ...props })
  );
const drawList = (households: any[], more: Record<string, unknown> = {}) =>
  draw({ households, ...more });
/** Tags removed with nothing put in their place, so a missing space between name and words shows. */
const flat = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
/** One chunk of markup per household card, in order. */
const cardsOf = (html: string) =>
  html
    .split(/(?=<div[^>]*class="border rounded-lg)/)
    .filter((c) => /^<div[^>]*class="border rounded-lg/.test(c));
/** The kid lines of a card (each starts with the kid emoji), as text. */
const kidLines = (card: string): string[] => {
  const m = card.match(/<div class="flex flex-wrap[^"]*text-sm text-gray-500">([\s\S]*?)<\/div>/);
  if (!m) return [];
  return flat(m[1])
    .split(/(?=👫|👦|🧒|👤)/)
    .map((p) => p.trim())
    .filter((p) => p.startsWith('👦'));
};
const notesIn = (html: string) =>
  [...html.matchAll(/<(\w+)[^>]*data-decide-later-note[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => ({
    tag: m[1],
    text: flat(m[2]),
  }));
const buttons = (html: string) => (html.match(/<button\b/g) || []).length;

// ── Households as the card receives them ─────────────────────────────────────
const kid = (name: string, extra: Record<string, unknown> = {}) => ({
  personEventId: `pe-${name || 'nameless'}`,
  name,
  adultRoled: false,
  ...extra,
});
const hh = (id: string, primary: string, over: Record<string, unknown> = {}) => ({
  id,
  primaryContact: { name: primary },
  helpers: [] as any[],
  littleCount: 0,
  guests: [] as any[],
  ...over,
});

// ── The setup page's apiHouseholdToSaved, read out of its live source ────────
function loadApiHouseholdToSaved(): ((h: any) => any) | null {
  const src = read(SETUP);
  const sf = ts.createSourceFile('page.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text: string | null = null;
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'apiHouseholdToSaved' &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.arguments[0]
    ) {
      text = n.initializer.arguments[0].getText(sf);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!text) return null;
  const js = transformSync(`exports.f = ${text};`, { loader: 'ts', format: 'cjs' }).code;
  const m: { exports: any } = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  return m.exports.f;
}

async function main() {
  // ══ W — THE WORDS ARE THE RULED WORDS ═══════════════════════════════════════
  section('W — the words are the founder’s W8');
  const ticket = read(TICKET).replace(/\s+/g, ' ');
  assert(
    'W.1',
    'the card’s words are "(decide later)" and the ticket’s W8 has "Josh" followed by exactly them',
    codeMarker === MARKER && ticket.includes(`*"Josh ${String(codeMarker)}"*`),
    { codeMarker, ticketHasW8: ticket.includes(`*"${W8('Josh')}"*`) }
  );

  // ══ 8 — W8 ON THE SAVED CARD ════════════════════════════════════════════════
  section('8 — W8 on the saved household card (item 13)');

  const one = drawList([hh('h1', 'Aroha', { helpers: [kid('Josh', { decideLater: true })] })]);
  assert(
    'W8.1',
    'a kid saved as decide later shows "Josh (decide later)" on the kid line, once, name first',
    JSON.stringify(kidLines(cardsOf(one)[0] ?? '')) === JSON.stringify([`👦 ${W8('Josh')}`]) &&
      count(flat(one), MARKER) === 1 &&
      notesIn(one).length === 1 &&
      notesIn(one)[0].tag === 'span' &&
      notesIn(one)[0].text === MARKER,
    { lines: kidLines(cardsOf(one)[0] ?? ''), notes: notesIn(one) }
  );

  const mixed = drawList([
    hh('h1', 'Aroha', {
      helpers: [kid('Josh', { decideLater: true }), kid('Mere', { decideLater: false })],
    }),
  ]);
  assert(
    'W8.2',
    'two kids, one flagged: the words are on the flagged kid only, and once',
    JSON.stringify(kidLines(cardsOf(mixed)[0] ?? '')) ===
      JSON.stringify([`👦 ${W8('Josh')}`, '👦 Mere']) && count(flat(mixed), MARKER) === 1,
    kidLines(cardsOf(mixed)[0] ?? '')
  );

  const both = drawList([
    hh('h1', 'Aroha', {
      helpers: [kid('Josh', { decideLater: true }), kid('Mere', { decideLater: true })],
    }),
  ]);
  assert(
    'W8.3',
    'two flagged kids: each shows the words once, and nobody shows them twice',
    JSON.stringify(kidLines(cardsOf(both)[0] ?? '')) ===
      JSON.stringify([`👦 ${W8('Josh')}`, `👦 ${W8('Mere')}`]) && count(flat(both), MARKER) === 2,
    kidLines(cardsOf(both)[0] ?? '')
  );

  const twoHh = drawList([
    hh('h1', 'Aroha', { helpers: [kid('Josh', { decideLater: true })] }),
    hh('h2', 'Tama', { helpers: [kid('Hine')] }),
  ]);
  const twoCards = cardsOf(twoHh);
  assert(
    'W8.4',
    'two households: only the household with a flagged kid shows the words',
    twoCards.length === 2 &&
      JSON.stringify(kidLines(twoCards[0])) === JSON.stringify([`👦 ${W8('Josh')}`]) &&
      JSON.stringify(kidLines(twoCards[1])) === JSON.stringify(['👦 Hine']) &&
      count(flat(twoHh), MARKER) === 1,
    twoCards.map(kidLines)
  );

  const hostCard = drawList([
    hh('h1', 'Aroha', { isHostHousehold: true, helpers: [kid('Josh', { decideLater: true })] }),
  ]);
  assert(
    'W8.5',
    'her own household’s card (the host look, with the "You" pill) shows the words too',
    hostCard.includes('data-host-pill') &&
      JSON.stringify(kidLines(cardsOf(hostCard)[0] ?? '')) === JSON.stringify([`👦 ${W8('Josh')}`]),
    kidLines(cardsOf(hostCard)[0] ?? '')
  );

  const nameless = drawList([hh('h1', 'Aroha', { helpers: [kid('', { decideLater: true })] })]);
  assert(
    'W8.6',
    'a flagged kid with no name still shows the words (they are a warning, never hidden)',
    count(flat(nameless), MARKER) === 1 &&
      JSON.stringify(kidLines(cardsOf(nameless)[0] ?? '')) === JSON.stringify([`👦 ${MARKER}`]),
    kidLines(cardsOf(nameless)[0] ?? '')
  );

  // The chain: a stored marker, through the page's own mapper, to the drawn card.
  const toSaved = loadApiHouseholdToSaved();
  const serverHousehold = {
    id: 'h1',
    littleCount: 0,
    contactPersonEventId: null,
    members: [
      { id: 'pe0', role: 'GUEST', householdRole: 'PRIMARY_CONTACT', person: { name: 'Aroha' } },
      {
        id: 'pe1',
        role: 'CHILD',
        householdRole: 'CHILD',
        isYoungPerson: true,
        messagingUndecided: true,
        person: { name: 'Josh' },
      },
      {
        id: 'pe2',
        role: 'CHILD',
        householdRole: 'CHILD',
        isYoungPerson: true,
        messagingUndecided: false,
        person: { name: 'Mere' },
      },
      // A young person the host roled as an adult (stored GUEST) must never read as decide later,
      // even with a stray yes on the row.
      {
        id: 'pe3',
        role: 'GUEST',
        householdRole: 'GUEST',
        isYoungPerson: true,
        messagingUndecided: true,
        person: { name: 'Tane' },
      },
      {
        id: 'pe4',
        role: 'GUEST',
        householdRole: 'GUEST',
        isYoungPerson: false,
        messagingUndecided: true,
        person: { name: 'Rua' },
      },
    ],
  };
  let chainCard = '';
  let chainErr: unknown = null;
  try {
    chainCard = toSaved ? drawList([toSaved(serverHousehold)]) : '';
  } catch (e) {
    chainErr = String(e);
  }
  assert(
    'W8.7',
    'from a stored household: the kid with the marker "yes" shows the words; the other kid, the adult-roled youth and the guest do not',
    !!toSaved &&
      !chainErr &&
      JSON.stringify(kidLines(cardsOf(chainCard)[0] ?? '')) ===
        JSON.stringify([`👦 ${W8('Josh')}`, '👦 Mere', '👦 Tane']) &&
      count(flat(chainCard), MARKER) === 1,
    { mapper: !!toSaved, chainErr, lines: kidLines(cardsOf(chainCard)[0] ?? '') }
  );

  // ══ 8 — WHERE IT MUST NOT SHOW, AND WHAT MUST NOT CHANGE ════════════════════
  section('8 — where it must not show, and what must not change');

  const oldKid = '<span>👦 Josh</span>';
  const variants: Array<[string, any]> = [
    ['false', kid('Josh', { decideLater: false })],
    ['undefined', kid('Josh', { decideLater: undefined })],
    ['absent', kid('Josh')],
  ];
  const variantMarkup = variants.map(([, k]) => drawList([hh('h1', 'Aroha', { helpers: [k] })]));
  assert(
    'W8.8',
    'a kid who is not flagged (false, undefined or absent) draws exactly the old markup',
    variantMarkup.every((m) => m.includes(oldKid) && !m.includes('data-decide-later-note')),
    variantMarkup.map((m) => m.slice(m.indexOf('👦') - 8, m.indexOf('👦') + 24))
  );

  const twoKids = (flag: Record<string, unknown>) =>
    drawList([
      hh('h1', 'Aroha', {
        littleCount: 1,
        helpers: [kid('Josh', flag), kid('Mere', flag)],
        guests: [{ personEventId: 'pe-g', name: 'Tama' }],
      }),
    ]);
  assert(
    'W8.9',
    'false, undefined and absent give the very same card, and the people line is unchanged',
    twoKids({ decideLater: false }) === twoKids({}) &&
      twoKids({ decideLater: undefined }) === twoKids({}) &&
      twoKids({ decideLater: true }).match(/\d+ people in 1 household/)?.[0] ===
        twoKids({}).match(/\d+ people in 1 household/)?.[0]
  );

  const stray = { decideLater: true };
  const adults = (withStray: boolean) =>
    drawList([
      hh('h1', 'Aroha', {
        primaryContact: { name: 'Aroha', ...(withStray ? stray : {}) },
        partner: { personEventId: 'pe-p', name: 'Rua', ...(withStray ? stray : {}) },
        guests: [{ personEventId: 'pe-g', name: 'Tama', ...(withStray ? stray : {}) }],
      }),
    ]);
  assert(
    'W8.10',
    'a partner, a guest and the primary contact never show the words, even given a stray flag',
    !adults(true).includes('data-decide-later-note') &&
      count(flat(adults(true)), MARKER) === 0 &&
      adults(true) === adults(false)
  );

  const flaggedHh = hh('h1', 'Aroha', { helpers: [kid('Josh', { decideLater: true })] });
  const typedNew = draw({ households: [], draft: flaggedHh });
  assert(
    'W8.11',
    'the typed "not saved yet" card never shows the words, even if its draft carries the flag',
    typedNew.includes('data-draft-card') &&
      typedNew.includes('Josh') &&
      !typedNew.includes('data-decide-later-note') &&
      count(flat(typedNew), MARKER) === 0
  );

  const saved = hh('h1', 'Aroha', { helpers: [kid('Josh', { decideLater: true })] });
  const editing = draw({
    households: [saved],
    editingHouseholdId: 'h1',
    draft: { ...saved, id: 'typed' },
  });
  assert(
    'W8.12',
    'the "Editing" card, which shows what is typed, never shows the words either',
    editing.includes('data-draft-card') &&
      editing.includes('Josh') &&
      !editing.includes('data-decide-later-note') &&
      count(flat(editing), MARKER) === 0
  );

  // ══ 8 — DISPLAY ONLY ════════════════════════════════════════════════════════
  section('8 — display only');

  const withFlag = twoKids({ decideLater: true });
  const noFlag = twoKids({});
  assert(
    'W8.13',
    'the flag adds no button, link, field or count: same buttons, no link or input',
    buttons(withFlag) === buttons(noFlag) &&
      !/<(a|input|select|textarea)\b/.test(withFlag) &&
      !/href=/.test(withFlag),
    { withFlag: buttons(withFlag), noFlag: buttons(noFlag) }
  );

  const cardNow = read(CARD);
  const cardThen = readAt(BEFORE_S26, CARD);
  const clicks = (s: string) => (s.match(/onClick/g) || []).length;
  assert(
    'W8.14',
    `the card file gains no fetch, router, link or click handler (compared with the file at ${BEFORE_S26})`,
    cardThen.length > 0 &&
      cardNow.length > 0 &&
      !/\bfetch\(/.test(cardNow) &&
      !/useRouter/.test(cardNow) &&
      !/href=/.test(cardNow) &&
      !/<a[\s>]/.test(cardNow) &&
      clicks(cardNow) === clicks(cardThen),
    { now: clicks(cardNow), then: clicks(cardThen), thenLength: cardThen.length }
  );

  const bothNotes = drawList([
    hh('h1', 'Aroha', {
      helpers: [kid('Josh', { decideLater: true }), kid('Mere')],
      keptEmailNames: ['Mere'],
    }),
  ]);
  assert(
    'W8.15',
    'W9’s quiet line is unaffected beside a flagged kid: both show, each once, W9 in its own words',
    count(flat(bothNotes), "We kept Mere's email address on file") === 1 &&
      count(flat(bothNotes), MARKER) === 1 &&
      (bothNotes.match(/data-kept-email-note/g) || []).length === 1,
    flat(bothNotes)
  );

  console.log(`\n\x1b[33m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\x1b[31mtest crashed:\x1b[0m', err);
  process.exit(2);
});
