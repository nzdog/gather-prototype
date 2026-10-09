/**
 * GTC-374 — walkthrough batch 7: invites only, an event with no plan.
 *
 * The founder walked the Moment flow himself and sorted what he found (GTC-189's Fourth ruling).
 * Item 14 is an "invites only" option: no meal plan, nobody asked to bring anything. This suite pins
 * batch 7 to his rulings at scoping (she chooses it at the start of Moment 2; she can change her
 * mind either way until the invitations go; the strip shows Moments 2 and 3 as not needed) and to
 * the PLAN RULINGS of 2026-10-09 (GTC-374): the split (a plan already made is GTC-375), W1 "Skip the
 * plan: invites only", W2 to W11 and W13 to W18 as proposed, W12 and not W12b, the column
 * `EventSetup.invitesOnly`, and Q2 and Q4 to Q16 as recommended.
 *
 *   P  the pure rules: the entry rule, the strip, the invitation, the search, the pre-flight's steps
 *   R  what the screens render: Moment 2's opening, the strip, the board, the guest page's words
 *   S  the source: Send untouched, the gate's lift, the fences
 *   D  the dev server over HTTP, and the preview in process, on fixtures of its own
 *   C  headless Chrome, behind the three safeguards and the send wall: the choice, the pre-flight,
 *      changing her mind, the board
 *   Z  every fixture row removed by id; the InviteEvent and OutboundMessage totals as found
 *
 * NOTHING SENDS. Send is never pressed and no pre-flight box is ticked. W1 holds the event, so it is
 * pressed only on this suite's own fixture, through `clickGuarded`. The hold mints that fixture's
 * guest links (AccessToken rows), counted and removed by id with it. Never pressed: Send, "Send it
 * again", "Generate plan →", "↻ Regenerate this category", Moment 3's "Move on →", New Event. The
 * browser fails every plan-making request and every request to a door that sends before it leaves
 * the page (both proven on probe URLs first); every click is `clickGuarded`; a "leave site?" dialog
 * is the only kind answered, and every dialog is logged. `installProviderTrap` walls this process;
 * headless Chrome resolves nothing but localhost. Fixtures: example.com addresses, no phones,
 * nothing queued.
 *
 * Before the migration exists the flag is read and written with raw SQL inside a try, so the suite
 * runs (red) at HEAD rather than crashing. A check of something absent always carries a presence
 * clause, so it cannot pass before the build.
 *
 * Needs the dev server on :3000 with the AI and provider keys blanked, and a global WebSocket
 * (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';
import GlanceBoard from '../src/components/glance/GlanceBoard';
import MomentArc from '../src/components/plan/MomentArc';
import Moment2Opening from '../src/components/plan/Moment2Opening';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  (${detail})` : ''}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

/** Source with comments removed, so a sentence quoted in a comment is never mistaken for code. */
function codeOnly(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

/** A render that never throws: an empty string when the component cannot render. */
function render(el: any): string {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    console.error('    render threw:', (e as Error).message.split('\n')[0]);
    return '';
  }
}

/** The text a reader sees: tags out, React's escapes back. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

function gitDiff(...paths: string[]): string {
  try {
    return execFileSync('git', ['diff', 'HEAD', '--', ...paths], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return 'git diff failed';
  }
}

// ── The ruled words, verbatim (GTC-374, PLAN RULINGS 2026-10-09) ─────────────
const W1 = 'Skip the plan: invites only';
const W2 =
  'Nobody’s asked to bring anything. Guests are only asked whether they can come. You can still make a plan any time before you send.';
const W3 = 'Getting the invitations ready…';
const W4 = 'That didn’t work. Try again.';
const W5 = 'Only the host can choose this, and send the invitations.';
const W6 = 'not needed';
const W8 = 'The invitations have gone as invites only, so there’s no plan to make.';
const W9 = '← Back to “What’s the plan?”';
const W10 = 'Invites only: nobody’s asked to bring anything, just whether they can come.';
const W11 = 'Not needed: this event is invites only.';
const W12 = (host: string, link: string) =>
  `Hi - Gather here, helping ${host} with this one. I'll check back if I haven't heard from you. One tap to say whether you can make it: ${link}`;
const W13 = 'Just let us know if you’ll be there.';
const W14 = 'Yes, I’ll be there';
const W15 = 'Find someone';
const W16 = 'A name';
const W17 = { CONFIRMED: 'Confirmed', NO_ANSWER_YET: 'No answer yet', NOT_COMING: 'Not coming' };
const W18 = (typed: string) => `Nobody on this event matches “${typed}”.`;

/** As they stand at HEAD, for the controls. */
const NOTHING_TO_BRING = 'Nothing for you to bring.';
const SEARCH_BUTTON_AT_HEAD = 'Find someone or something';
const LETS_DO_THIS = 'Let’s do this →';
const BACK_TO_PEOPLE = '← Back to the people';
const GO_TO_STEP_3 = 'Go to step 3: Who Gather talks to ↑';

/** Send's element exactly as it stands at `4c7381b` (GTC-366 Q1: "Send stays exactly as it is"). */
const SEND_AT_HEAD = `<button
            type="button"
            disabled={!allChecked || pressing || pressed !== null}
            onClick={press}
            className={\`w-full py-3 rounded-lg font-medium \${
              !allChecked || pressing || pressed !== null
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }\`}
          >
            {pressed !== null
              ? 'Sent'
              : pressing
                ? 'Sending…'
                : \`Send\${allChecked ? '' : ' — finish the five checks first'}\`}
          </button>`;

// ══ IN MEMORY — the pure rules, the renders, the source ═════════════════════════
async function runInMemory() {
  const ES = await load('../src/lib/setup/entry-stage');
  const S = await load('../src/lib/moments/strip');
  const IO = await load('../src/lib/setup/invites-only');
  const AR = await load('../src/lib/messages/ask-register');
  const APC = await load('../src/lib/preflight/ask-preview-compose');
  const OL = await load('../src/lib/sms/opt-out-line');
  const SR = await load('../src/lib/search/event-search');
  const NC = await load('../src/lib/preflight/next-check');

  // ── P — the entry rule ──────────────────────────────────────────────────────
  const stage = (input: any) => ES.resolveSetupStage(input);
  assert(
    'P',
    'P1 the entry rule: an invites-only event with its EventSetup → "invites-only"',
    ok(
      () =>
        stage({ items: [], hasSetup: true, householdCount: 0, invitesOnly: true }) ===
          'invites-only' &&
        stage({
          items: [],
          hasSetup: true,
          householdCount: 3,
          planApproved: false,
          invitesOnly: true,
        }) === 'invites-only'
    )
  );
  assert(
    'P',
    'P2 CONTROL: without the flag (absent or false), the entry rule’s five answers are today’s',
    ok(() =>
      [undefined, false].every(
        (flag) =>
          stage({ items: [], hasSetup: false, householdCount: 0, invitesOnly: flag }) ===
            'opening' &&
          stage({ items: [], hasSetup: false, householdCount: 3, invitesOnly: flag }) ===
            'moment1' &&
          stage({ items: [], hasSetup: true, householdCount: 0, invitesOnly: flag }) ===
            'moment2-step1' &&
          stage({
            items: [{ source: 'GENERATED' }],
            hasSetup: true,
            householdCount: 0,
            invitesOnly: flag,
          }) === 'plan' &&
          stage({
            items: [],
            hasSetup: true,
            householdCount: 0,
            planApproved: true,
            invitesOnly: flag,
          }) === 'moment3'
      )
    )
  );
  assert(
    'P',
    'P3 CONTROL: the flag with no EventSetup (a V1 shape) changes nothing — EventSetup is read first',
    ok(
      () =>
        stage({ items: [], hasSetup: false, householdCount: 2, invitesOnly: true }) === 'moment1' &&
        stage({ items: [], hasSetup: false, householdCount: 0, invitesOnly: true }) === 'opening'
    )
  );

  // ── P — the strip ───────────────────────────────────────────────────────────
  assert(
    'P',
    'P4 a new address, ?at=opening, opens Moment 2’s opening — only while there is no plan',
    ok(
      () =>
        S.AT_OPENING === 'opening' &&
        S.requestedStage('opening', { hasPlan: false }) === 'moment2-opening' &&
        S.requestedStage('opening', { hasPlan: true }) === null &&
        S.setupHref('e1', S.AT_OPENING) === '/plan/e1/setup?at=opening'
    )
  );
  assert(
    'P',
    'P5 CONTROL: batch5 P8’s addresses answer as they did',
    ok(
      () =>
        S.requestedStage('people', { hasPlan: false }) === 'moment1' &&
        S.requestedStage('plan', { hasPlan: true }) === 'plan' &&
        S.requestedStage('plan', { hasPlan: false }) === null &&
        S.requestedStage('moment3', { hasPlan: true }) === null &&
        S.requestedStage(null, { hasPlan: true }) === null
    )
  );
  const doors = (f: Record<string, boolean>) =>
    S.stripDoors({
      hostSaved: false,
      hasPlan: false,
      planApproved: false,
      held: false,
      sent: false,
      ...f,
    });
  const go = (d: any, target: string) => d?.kind === 'go' && d.target === target;
  assert(
    'P',
    'P6 invites only, held: 2 and 3 are not needed and open Moment 2’s opening; 4 opens the pre-flight',
    ok(() => {
      const d = doors({ hostSaved: true, held: true, invitesOnly: true });
      return (
        go(d[1], 'moment1') &&
        same(d[2], { kind: 'not-needed', target: 'moment2-opening' }) &&
        same(d[3], { kind: 'not-needed', target: 'moment2-opening' }) &&
        go(d[4], 'preflight')
      );
    })
  );
  assert(
    'P',
    'P7 invites only, sent: 2 and 3 are not needed and say W8 (fixed after the press); 4 opens the board',
    ok(() => {
      const d = doors({ hostSaved: true, held: true, sent: true, invitesOnly: true });
      return (
        go(d[1], 'moment1') &&
        same(d[2], { kind: 'not-needed', line: W8 }) &&
        same(d[3], { kind: 'not-needed', line: W8 }) &&
        go(d[4], 'board')
      );
    })
  );
  assert(
    'P',
    'P8 CONTROL: across all 64 combinations of the facts with the flag, 1 is never locked and no door opens the questions',
    ok(() => {
      const keys = ['hostSaved', 'hasPlan', 'planApproved', 'held', 'sent', 'invitesOnly'];
      for (let m = 0; m < 64; m++) {
        const f: Record<string, boolean> = {};
        keys.forEach((k, i) => (f[k] = Boolean(m & (1 << i))));
        const d = doors(f);
        if (d[1]?.kind !== 'go') return false;
        for (const n of [1, 2, 3, 4]) {
          const t = d[n]?.target;
          if (typeof t === 'string' && /step1|question/i.test(t)) return false;
        }
      }
      return true;
    })
  );
  assert(
    'P',
    'P9 the words, exactly: W1 to W5, W10, W11, W13 and W14; the strip’s W6, W8 and W9; the search’s W15 to W18',
    ok(() => {
      const w = IO.INVITES_ONLY_WORDS;
      const e = SR.EVENT_WORDS;
      return (
        w.CHOOSE === W1 &&
        w.EXPLAIN === W2 &&
        w.WORKING === W3 &&
        w.FAILED === W4 &&
        w.NOT_HOST === W5 &&
        w.PREFLIGHT_LINE === W10 &&
        w.STEP_NOT_NEEDED === W11 &&
        w.GUEST_LINE === W13 &&
        w.GUEST_YES === W14 &&
        S.STRIP_WORDS.NOT_NEEDED === W6 &&
        S.STRIP_WORDS.NOT_NEEDED_AFTER_PRESS === W8 &&
        S.STRIP_WORDS.BACK_TO_WHATS_THE_PLAN === W9 &&
        e.BUTTON_INVITES_ONLY === W15 &&
        e.LABEL_INVITES_ONLY === W16 &&
        e.CONFIRMED === W17.CONFIRMED &&
        e.NO_ANSWER_YET === W17.NO_ANSWER_YET &&
        e.NOT_COMING === W17.NOT_COMING &&
        e.nothingInvitesOnly('zz') === W18('zz')
      );
    })
  );

  // ── P — the invitation ──────────────────────────────────────────────────────
  const jo = {
    firstName: 'Jo',
    itemNames: [],
    jobNames: [],
    carried: [],
    household: [],
    link: 'https://x.test/p/tok',
  };
  assert(
    'P',
    'P10 W12: Gather’s part for an invites-only guest leaves "Nothing for you to bring." out',
    ok(() => AR.askSystemVoice(jo, 'Kate', true) === W12('Kate', 'https://x.test/p/tok'))
  );
  assert(
    'P',
    'P11 CONTROL: without the flag, an empty-handed guest still reads "Nothing for you to bring."',
    ok(
      () =>
        AR.askSystemVoice(jo, 'Kate') ===
        `Hi - Gather here, helping Kate with this one. ${NOTHING_TO_BRING} I'll check back if I haven't heard from you. One tap to say whether you can make it: https://x.test/p/tok`
    )
  );
  const pav = { ...jo, itemNames: ['pavlova'] };
  assert(
    'P',
    'P12 CONTROL: the flag on someone holding something leaves their ask exactly as it is',
    ok(() => {
      const plain = AR.askSystemVoice(pav, 'Kate');
      return AR.askSystemVoice(pav, 'Kate', true) === plain && plain.includes('the pavlova');
    })
  );
  // Sunday 8 November 2026, noon in Auckland (NZDT, UTC+13).
  const facts = {
    name: 'Birthday drinks',
    startDate: new Date('2026-11-07T23:00:00Z'),
    venueName: 'Kate’s place',
    occasionDescription: null,
  };
  const M1 =
    "Hi Jo - We're doing Birthday drinks on Sunday, 8 November, at Kate’s place. Would love to have you there.";
  const M2 = "I've got Gather helping me put it together - I'll let it take it from here.";
  const BODY = `${M1}\n\n${M2}\n\n${W12('Kate', 'https://x.test/p/tok')}`;
  const composed = (() => {
    try {
      return AR.composeAsk({
        event: facts,
        hostName: 'Kate Lowe',
        recipient: jo,
        storedAuthorLine: null,
        invitesOnly: true,
      });
    } catch {
      return null;
    }
  })();
  assert(
    'P',
    'P13 by email: the subject, then her line, the handover and W12, exactly',
    !!composed && composed.subject === 'Birthday drinks — from Kate' && composed.text === BODY,
    composed ? JSON.stringify(composed.text) : 'no composition'
  );
  assert(
    'P',
    'P14 by text: the same body, then "Reply STOP to opt out"',
    !!composed &&
      composed.text === BODY &&
      ok(() => OL.withOptOutLine(composed.text) === `${BODY}\nReply STOP to opt out`)
  );
  const previewOf = (invitesOnly: boolean | undefined) => ({
    event: { ...facts, ...(invitesOnly === undefined ? {} : { invitesOnly }) },
    hostName: 'Kate Lowe',
    storedAuthorLine: null,
    replyTo: 'kate@example.com',
    recipients: [
      {
        name: 'Jo Lowe',
        hostAsCarrier: false,
        itemNames: [],
        jobNames: [],
        carried: [],
        household: [],
        linkState: 'READY',
        link: 'https://x.test/p/tok',
        channel: 'EMAIL',
      },
    ],
  });
  const previewText = (invitesOnly: boolean | undefined): string => {
    try {
      return APC.composePreview(previewOf(invitesOnly), null).rows[0].ask.text;
    } catch {
      return '';
    }
  };
  assert(
    'P',
    'P15 the pre-flight’s composition carries event.invitesOnly through to the message (and so the send)',
    previewText(true) === BODY && previewText(undefined).includes(NOTHING_TO_BRING),
    JSON.stringify(previewText(true))
  );

  // ── P — the board's search ──────────────────────────────────────────────────
  const person = (name: string, state: string) => ({
    personEventId: `pe-${name}`,
    personId: `p-${name}`,
    name,
    state,
    justAttending: false,
  });
  const people = [
    person('Kate Lowe', 'GREEN'),
    person('Jo Lowe', 'GREEN'),
    person('Ross Lowe', 'AMBER'),
    person('Gus Henderson', 'OUT'),
    person('Aroha Henderson', 'RED'),
    person('Mere Tane', 'NOT_CHASED'),
  ];
  const lines = (q: string, opts?: any) => {
    try {
      return SR.findInEvent(people, [], q, opts).map((h: any) => SR.hitLine(h));
    } catch {
      return [];
    }
  };
  assert(
    'P',
    'P16 W17 with the flag: a yes reads "Confirmed", no answer "No answer yet", a no "Not coming"',
    same(lines('lowe', { invitesOnly: true }), [
      'Kate Lowe: Confirmed',
      'Jo Lowe: Confirmed',
      'Ross Lowe: No answer yet',
    ]) &&
      same(lines('henderson', { invitesOnly: true }), [
        'Gus Henderson: Not coming',
        'Aroha Henderson: No answer yet',
      ]) &&
      same(lines('mere', { invitesOnly: true }), ['Mere Tane: No answer yet']),
    JSON.stringify(lines('lowe', { invitesOnly: true }))
  );
  assert(
    'P',
    'P17 CONTROL: without the flag, batch6’s words — "Nothing yet" and "Not coming"',
    same(lines('ross'), ['Ross Lowe: Nothing yet']) &&
      same(lines('gus'), ['Gus Henderson: Not coming'])
  );
  assert(
    'P',
    'P18 W18 when nothing on an invites-only event matches',
    ok(() => SR.EVENT_WORDS.nothingInvitesOnly('zz') === W18('zz'))
  );

  // ── P — the pre-flight's steps ──────────────────────────────────────────────
  assert(
    'P',
    'P19 Q8: steps 1 and 2 are settled for her; the line starts at "Go to step 3: Who Gather talks to ↑"',
    ok(
      () =>
        same(NC.settledSteps(true), { 1: true, 2: true }) &&
        same(NC.settledSteps(false), {}) &&
        NC.firstUnticked(NC.settledSteps(true)) === 3 &&
        NC.goToStepLine(3) === GO_TO_STEP_3
    )
  );
  assert(
    'P',
    'P20 CONTROL: firstUnticked and goToStepLine as batch4 pins them',
    ok(
      () =>
        NC.firstUnticked({}) === 1 &&
        NC.goToStepLine(2) === 'Go to step 2: Dietary needs ↑' &&
        NC.PREFLIGHT_STEP_TITLES.length === 5
    )
  );

  // ── R — Moment 2's opening ─────────────────────────────────────────────────
  const opening = (extra: Record<string, unknown>) =>
    render(
      createElement(Moment2Opening as any, {
        eventName: 'Birthday drinks',
        onStart: () => {},
        onBack: () => {},
        ...extra,
      })
    );
  const withChoice = opening({ onInvitesOnly: () => {} });
  const at1 = withChoice.indexOf(`>${W1}</button>`);
  assert(
    'R',
    'R1 with the choice: W1 a button after "Let’s do this →" and before "← Back to the people", W2 under it',
    at1 > withChoice.indexOf(LETS_DO_THIS) &&
      withChoice.indexOf(LETS_DO_THIS) > 0 &&
      at1 < withChoice.indexOf(BACK_TO_PEOPLE) &&
      withChoice.indexOf(W2) > at1
  );
  const without = opening({});
  assert(
    'R',
    'R2 CONTROL: without the choice (a co-host’s screen is not this; an event with an item is), no W1 and no W2',
    without.includes(LETS_DO_THIS) && !without.includes(W1) && !without.includes(W2)
  );

  // ── R — the strip ──────────────────────────────────────────────────────────
  const arc = textOf(
    render(
      createElement(MomentArc as any, {
        currentMoment: 4,
        completedMoments: [1, 2, 3],
        notNeeded: [2, 3],
      })
    )
  );
  assert(
    'R',
    'R3 the strip with 2 and 3 not needed: "· not needed" after each, and no ✓ on either, over completed',
    /What's the plan\?\s*·\s*not needed/.test(arc) &&
      /Who's on what\?\s*·\s*not needed/.test(arc) &&
      !arc.includes("What's the plan? ✓") &&
      !arc.includes("Who's on what? ✓") &&
      arc.includes("Who's coming? ✓"),
    arc
  );
  const arcPlain = textOf(
    render(createElement(MomentArc as any, { currentMoment: 4, completedMoments: [1, 2, 3] }))
  );
  assert(
    'R',
    'R4 CONTROL: without notNeeded the strip is as it was — ✓ on 1 to 3, no "not needed"',
    arcPlain.includes("What's the plan? ✓") &&
      arcPlain.includes("Who's on what? ✓") &&
      !arcPlain.includes(W6)
  );

  // ── R — the board ──────────────────────────────────────────────────────────
  const strip = (name: string, pe: string, over: Record<string, unknown> = {}) => ({
    personEventId: pe,
    personId: `p-${pe}`,
    name,
    isHost: false,
    householdRole: 'PRIMARY_CONTACT',
    role: 'PARTICIPANT',
    teamId: null,
    nudgeMark: null,
    state: 'GREEN',
    reasons: ['ACCEPTED'],
    nextNudgeAt: null,
    items: [],
    emailNote: null,
    textNote: null,
    textable: false,
    chase: null,
    chaseNote: null,
    ...over,
  });
  const board = (extra: Record<string, unknown>) =>
    render(
      createElement(GlanceBoard as any, {
        glance: {
          eventId: 'e-374',
          hostPersonId: 'p-pe-kate',
          asOf: new Date('2026-11-01T00:00:00Z').toISOString(),
          summary: { needYou: 0, withGather: 0, settled: 2 },
          households: [
            {
              householdId: 'h1',
              primaryContactName: 'Kate Lowe',
              isHostHousehold: true,
              members: [strip('Kate Lowe', 'pe-kate', { isHost: true, role: 'HOST' })],
            },
            {
              householdId: 'h2',
              primaryContactName: 'Jo Lowe',
              isHostHousehold: false,
              members: [strip('Jo Lowe', 'pe-jo')],
            },
          ],
          unhoused: [],
          unassignedCritical: [],
          unassignedOrdinaryCount: 0,
        },
        eventName: 'Birthday drinks',
        actorRole: 'HOST',
        eventDate: 'Sunday, 8 November',
        stickyReversals: [],
        now: new Date('2026-11-01T00:00:00Z'),
        afterPress: true,
        ...extra,
      })
    );
  const io = board({ invitesOnly: true });
  assert(
    'R',
    'R5 an invites-only board: W15 once, never W13; no "Print the list" and no "Change who’s on what"',
    io.length > 0 &&
      new RegExp(`<button[^>]*>${W15}</button>`).test(io) &&
      count(io, SEARCH_BUTTON_AT_HEAD) === 0 &&
      !io.includes('data-print-door') &&
      !io.includes('data-plan-door') &&
      io.includes('data-back-room-door')
  );
  const planned = board({});
  assert(
    'R',
    'R6 CONTROL: a planned board as it was — W13 once, the print door and "Change who’s on what"',
    count(planned, SEARCH_BUTTON_AT_HEAD) === 1 &&
      planned.includes('data-print-door') &&
      planned.includes('data-plan-door')
  );

  // ── R — the guest page ─────────────────────────────────────────────────────
  const guest = codeOnly(read('src/app/p/[token]/page.tsx'));
  assert(
    'R',
    'R7 the guest page: W13 and W14 behind the flag, and the planned event’s words kept',
    /data\.invitesOnly/.test(guest) &&
      /INVITES_ONLY_WORDS\.GUEST_LINE/.test(guest) &&
      /INVITES_ONLY_WORDS\.GUEST_YES/.test(guest) &&
      guest.includes('Yes, still coming') &&
      guest.includes("There's nothing for you to bring — just let us know if you'll be there.")
  );

  // ── S — the source ─────────────────────────────────────────────────────────
  const preflightRaw = read('src/app/plan/[eventId]/pre-flight/page.tsx');
  assert(
    'S',
    'S1 CONTROL: Send’s element is byte for byte as it was (its greying, its press, its words)',
    preflightRaw.includes(SEND_AT_HEAD)
  );
  const preflight = codeOnly(preflightRaw);
  assert(
    'S',
    'S2 the pre-flight hands the strip notNeeded, after the literal batch5 R11 reads',
    /<MomentArc\s+currentMoment=\{4\}\s+completedMoments=\{\[1, 2, 3\]\}\s+notNeeded=\{/.test(
      preflight
    )
  );
  assert(
    'S',
    'S3 CONTROL: `<MomentArc currentMoment={4} completedMoments={[1, 2, 3]}` is still literal (batch5 R11)',
    /<MomentArc\s+currentMoment=\{4\}\s+completedMoments=\{\[1, 2, 3\]\}/.test(preflight)
  );
  const wf = codeOnly(read('src/lib/workflow.ts'));
  const gate = wf.slice(
    wf.indexOf('export async function runGateCheck'),
    wf.indexOf('export interface TransitionResult')
  );
  const lifted = gate.slice(
    gate.indexOf("code: 'CRITICAL_PLACEHOLDER_UNACKNOWLEDGED'"),
    gate.indexOf("code: 'UNSAVED_DRAFT_CHANGES'")
  );
  const kept = gate.replace(lifted, '');
  assert(
    'S',
    'S4 the gate reads the flag only around its two structural checks; the other three are untouched',
    gate.length > 0 &&
      /invitesOnly/.test(lifted) &&
      /STRUCTURAL_MINIMUM_TEAMS/.test(lifted) &&
      /STRUCTURAL_MINIMUM_ITEMS/.test(lifted) &&
      !/invitesOnly/.test(kept) &&
      /CRITICAL_CONFLICT_UNACKNOWLEDGED/.test(kept) &&
      /UNSAVED_DRAFT_CHANGES/.test(kept)
  );
  assert(
    'S',
    'S5 CONTROL: the transition route has no diff against HEAD',
    gitDiff('src/app/api/events/[id]/transition/route.ts') === ''
  );
  assert(
    'S',
    'S6 CONTROL: nothing under src/app/api/auth/, the token code (Zone 3), or Zones 7 and 9 changed',
    gitDiff(
      'src/app/api/auth',
      'src/lib/tokens.ts',
      'src/lib/auth.ts',
      'src/lib/sms/opt-out-service.ts',
      'src/lib/sms/opt-out-keywords.ts',
      'src/lib/eligibility/email-opt-out.ts',
      'src/lib/eligibility/email-block.ts'
    ) === ''
  );
  const routesOnDisk: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${f}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (f === 'route.ts') routesOnDisk.push(rel);
    }
  };
  let routesAtHead: string[] = [];
  try {
    walk('src/app/api');
    routesAtHead = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'src/app/api'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => f.endsWith('/route.ts'));
  } catch {
    // an empty list fails the assertion below
  }
  assert(
    'S',
    `S7 CONTROL: no new API route (Zone 6): ${routesOnDisk.length} route files, as at HEAD`,
    routesOnDisk.length > 0 && same([...routesOnDisk].sort(), [...routesAtHead].sort())
  );
}

// ══ LIVE — the dev server and headless Chrome, on fixtures of this suite's own ════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
};

/** The flag, read with raw SQL so the suite runs before the column exists (null then). */
async function flagOf(eventId: string): Promise<boolean | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ invitesOnly: boolean }[]>(
      'SELECT "invitesOnly" FROM "EventSetup" WHERE "eventId" = $1',
      eventId
    );
    return rows.length === 1 ? rows[0].invitesOnly : null;
  } catch {
    return null;
  }
}

/** Writes the flag on this suite's own fixture directly (the board's sent event). */
async function setFlagDirectly(eventId: string): Promise<boolean> {
  try {
    const n = await prisma.$executeRawUnsafe(
      'UPDATE "EventSetup" SET "invitesOnly" = true WHERE "eventId" = $1',
      eventId
    );
    return n === 1;
  } catch {
    return false;
  }
}

async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  assert('D', 'D0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc374-${l}-${stamp}@example.com`;
  const mkUser = async (label: string, name: string) => {
    const user = await prisma.user.create({ data: { email: mail(label) } });
    created.users.push(user.id);
    const person = await prisma.person.create({
      data: { name, email: user.email, userId: user.id },
    });
    created.people.push(person.id);
    const token = randomBytes(32).toString('hex');
    await prisma.session.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
    });
    return { userId: user.id, personId: person.id, token };
  };
  const kate = await mkUser('kate', 'Kate Lowe');
  const cara = await mkUser('cara', 'Cara Lowe');
  const guests: Record<string, string> = {};
  for (const name of ['Jo Lowe', 'Ross Lowe', 'Gus Henderson', 'Aroha Henderson']) {
    const p = await prisma.person.create({
      data: { name, email: mail(name.split(' ')[0].toLowerCase()) },
    });
    created.people.push(p.id);
    guests[name] = p.id;
  }
  const start = new Date(Date.now() + 30 * 864e5);
  /** An event of Kate's: her household and two others, no phones. */
  const mk = async (
    label: string,
    opts: {
      setup?: boolean;
      sentAt?: Date;
      cohost?: boolean;
      item?: boolean;
      answers?: boolean;
    } = {}
  ) => {
    const ev = await prisma.event.create({
      data: {
        name: `GTC-374 b7 — ${label}`,
        startDate: start,
        endDate: start,
        hostId: kate.personId,
        status: opts.sentAt ? 'CONFIRMING' : 'DRAFT',
        sentAt: opts.sentAt ?? null,
        venueName: 'Kate’s place',
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: kate.userId, role: 'HOST' } });
    if (opts.cohost)
      await prisma.eventRole.create({
        data: { eventId: ev.id, userId: cara.userId, role: 'COHOST' },
      });
    if (opts.setup) await prisma.eventSetup.create({ data: { eventId: ev.id } });
    const hk = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: kate.personId,
        eventId: ev.id,
        role: 'HOST',
        householdId: hk.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    const sent = opts.sentAt ? { sentAt: opts.sentAt } : {};
    const h1 = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: guests['Jo Lowe'],
        eventId: ev.id,
        householdId: h1.id,
        householdRole: 'PRIMARY_CONTACT',
        ...sent,
        ...(opts.answers ? { attendanceAnswer: 'YES', attendanceAnsweredAt: new Date() } : {}),
      },
    });
    await prisma.personEvent.create({
      data: {
        personId: guests['Ross Lowe'],
        eventId: ev.id,
        householdId: h1.id,
        householdRole: 'PARTNER',
        ...sent,
      },
    });
    const h2 = await prisma.household.create({ data: { eventId: ev.id } });
    await prisma.personEvent.create({
      data: {
        personId: guests['Gus Henderson'],
        eventId: ev.id,
        householdId: h2.id,
        householdRole: 'PRIMARY_CONTACT',
        ...sent,
        ...(opts.answers ? { attendanceAnswer: 'NO', attendanceAnsweredAt: new Date() } : {}),
      },
    });
    await prisma.personEvent.create({
      data: {
        personId: guests['Aroha Henderson'],
        eventId: ev.id,
        householdId: h2.id,
        householdRole: 'PARTNER',
        ...sent,
      },
    });
    if (opts.item) {
      const team = await prisma.team.create({ data: { name: 'Drinks', eventId: ev.id } });
      await prisma.item.create({
        data: { name: 'Ice', teamId: team.id, source: 'MANUAL', kind: 'ITEM' } as any,
      });
    }
    return ev.id;
  };

  const http = (path: string, token: string, init: RequestInit = {}) =>
    realFetch(`${BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', cookie: `session=${token}` },
    });
  const setFlag = (eventId: string, token: string, value: boolean) =>
    http(`/api/events/${eventId}/setup`, token, {
      method: 'POST',
      body: JSON.stringify({ invitesOnly: value }),
    });
  const hold = (eventId: string) =>
    http(`/api/events/${eventId}/transition`, kate.token, { method: 'POST' });
  const statusOf = async (id: string) =>
    (await prisma.event.findUnique({ where: { id }, select: { status: true } }))?.status;
  const snapshots = (id: string) => prisma.planSnapshot.count({ where: { eventId: id } });
  const codesOf = async (res: Response) => {
    const body = await res.json().catch(() => ({}));
    return ((body.blocks ?? []) as { code: string }[]).map((b) => b.code).sort();
  };

  // ── D — over HTTP and in process ────────────────────────────────────────────
  const dA = await mk('D, the choice and the hold', { setup: true });
  const dB = await mk('D, a co-host', { setup: true, cohost: true });
  const dC = await mk('D, an item', { setup: true, item: true });
  const dD = await mk('D, sent', { setup: true, sentAt: new Date(Date.now() - 864e5) });
  const dE = await mk('D, no flag', { setup: true });
  const dF = await mk('D, a clash', { setup: true });
  const dG = await mk('D, the preview', { setup: true });

  const r1 = await setFlag(dA, kate.token, true);
  assert(
    'D',
    'D1 the host sets the flag on an event with no item: 200, and the column is true',
    r1.status === 200 && (await flagOf(dA)) === true,
    String(r1.status)
  );
  const r2 = await setFlag(dB, cara.token, true);
  assert(
    'D',
    'D2 Q4: a co-host is refused 403, and the column stays false',
    r2.status === 403 && (await flagOf(dB)) === false,
    String(r2.status)
  );
  const r3 = await setFlag(dC, kate.token, true);
  assert(
    'D',
    'D3 Q13: an event with an item is refused 409 until GTC-375, and the column stays false',
    r3.status === 409 && (await flagOf(dC)) === false,
    String(r3.status)
  );
  const r4 = await setFlag(dD, kate.token, true);
  assert(
    'D',
    'D4 after the press it is fixed: 409, and the column stays false',
    r4.status === 409 && (await flagOf(dD)) === false,
    String(r4.status)
  );
  const r5 = await hold(dA);
  assert(
    'D',
    'D5 the host holds an invites-only event with no team and no item: 200, CONFIRMING, one snapshot',
    r5.status === 200 && (await statusOf(dA)) === 'CONFIRMING' && (await snapshots(dA)) === 1,
    String(r5.status)
  );
  const r6 = await hold(dE);
  const codes6 = await codesOf(r6);
  assert(
    'D',
    'D6 CONTROL: without the flag the same event is refused 400 with both STRUCTURAL codes, and stays DRAFT',
    r6.status === 400 &&
      same(codes6, ['STRUCTURAL_MINIMUM_ITEMS', 'STRUCTURAL_MINIMUM_TEAMS']) &&
      (await statusOf(dE)) === 'DRAFT',
    `${r6.status} ${codes6}`
  );
  await prisma.conflict.create({
    data: {
      eventId: dF,
      fingerprint: `gtc374-${dF}`,
      type: 'COVERAGE_GAP',
      severity: 'CRITICAL',
      claimType: 'RISK',
      resolutionClass: 'INFORMATIONAL',
      title: 'GTC-374 fixture clash',
      description: 'Exists so the gate has a critical clash to refuse.',
    },
  });
  await setFlag(dF, kate.token, true);
  const r7 = await hold(dF);
  const codes7 = await codesOf(r7);
  assert(
    'D',
    'D7 only the two structural checks are lifted: a flagged event with a critical clash is refused 400, CLASH alone',
    (await flagOf(dF)) === true &&
      r7.status === 400 &&
      same(codes7, ['CRITICAL_CONFLICT_UNACKNOWLEDGED']) &&
      (await statusOf(dF)) === 'DRAFT',
    `${r7.status} ${codes7}`
  );
  const r8 = await setFlag(dA, kate.token, false);
  assert(
    'D',
    'D8 changing her mind on a held invites-only event: 200, the flag false, still CONFIRMING',
    r8.status === 200 && (await flagOf(dA)) === false && (await statusOf(dA)) === 'CONFIRMING',
    String(r8.status)
  );
  const preview = await load('../src/lib/preflight/ask-preview');
  const APC = await load('../src/lib/preflight/ask-preview-compose');
  const textsFor = async (eventId: string): Promise<string[]> => {
    try {
      const pv: any = await preview.readAskPreview(prisma as any, eventId, BASE);
      return APC.composePreview(pv, pv.storedAuthorLine)
        .rows.filter((r: any) => r.ask)
        .map((r: any) => r.ask.text as string);
    } catch (e) {
      console.error('    preview threw:', (e as Error).message.split('\n')[0]);
      return [];
    }
  };
  await setFlag(dG, kate.token, true);
  const textsG = await textsFor(dG);
  assert(
    'D',
    'D9 the preview of an invites-only event: every message has W12 and none says "Nothing for you to bring."',
    (await flagOf(dG)) === true &&
      textsG.length === 4 &&
      textsG.every(
        (t) =>
          t.includes(
            "Hi - Gather here, helping Kate with this one. I'll check back if I haven't heard from you. One tap to say whether you can make it: "
          ) && !t.includes(NOTHING_TO_BRING)
      ),
    `${textsG.length} messages`
  );
  const textsE = await textsFor(dE);
  assert(
    'D',
    'D10 CONTROL: a planned event with nothing given out yet still says "Nothing for you to bring."',
    textsE.length === 4 && textsE.every((t) => t.includes(NOTHING_TO_BRING)),
    `${textsE.length} messages`
  );
  const pf = await http(`/api/events/${dG}/pre-flight`, kate.token);
  const pfBody = await pf.json().catch(() => ({}));
  assert(
    'D',
    'D11 GET …/pre-flight carries event.invitesOnly',
    pf.status === 200 && pfBody?.event?.invitesOnly === true,
    String(pf.status)
  );

  // ── C — headless Chrome ─────────────────────────────────────────────────────
  const cA = await mk('C, the walk');
  const cB = await mk('C, the board', {
    setup: true,
    sentAt: new Date(Date.now() - 864e5),
    answers: true,
  });
  const cC = await mk('C, an item', { item: true });
  const boardFlagged = await setFlagDirectly(cB);

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventSetup.count({ where: evIn }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.household.count({ where: evIn }),
      await prisma.personEvent.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { userId: { in: created.users } } }),
      await prisma.team.count({ where: evIn }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.conflict.count({ where: evIn }),
      await prisma.planSnapshot.count({ where: evIn }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  const refusals: string[] = [];
  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9474 });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    // The dialog rule: only a "leave site?" is answered (by leaving); every dialog is logged.
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc374-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc374-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    await c.setSessionCookie(kate.token);
    await c.setViewport(1280, 900, false);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /** Tag what `js` finds, then click it — guarded. 'absent' (not a refusal) when not found. */
    const tap = async (js: string, settleMs = 900) => {
      const found = await ev<boolean>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`
      );
      if (!found) return 'absent';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    const byWords = (words: string, sel = 'button, a') =>
      `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.trim() === ${JSON.stringify(words)})`;
    const stripDoor = (label: string) =>
      `[...document.querySelectorAll('[data-moment-strip] button, [data-moment-strip] a')].find(b => b.innerText.includes(${JSON.stringify(label)}))`;
    const body = () => ev<string>(`document.body.innerText`);
    const path = () => ev<string>(`location.pathname + location.search`);
    const onOpening = async () => (await body()).includes(LETS_DO_THIS);

    // C1 — Moment 2's opening, reached by the strip from Moment 1 (a strip tap writes nothing).
    await c.navigate(`/plan/${cA}/setup`, 8000);
    const toOpening = await tap(stripDoor("What's the plan?"), 2500);
    const shown = (await onOpening()) && (await body());
    r.C1 = toOpening === null && !!shown && shown.includes(W1) && shown.includes(W2);
    detail.C1 = `strip tap ${toOpening}`;

    // C2 — W1, pressed through clickGuarded, on this suite's own fixture only.
    const pressed = r.C1 ? await tap(byWords(W1, 'button'), 7000) : 'not reached';
    r.C2 =
      pressed === null &&
      (await path()) === `/plan/${cA}/pre-flight` &&
      (await statusOf(cA)) === 'CONFIRMING' &&
      (await flagOf(cA)) === true;
    detail.C2 = `tap ${pressed}, at ${await path()}`;

    // C3, C4 — the pre-flight of an invites-only event. Nothing is ticked; Send is never pressed.
    if ((await path()) !== `/plan/${cA}/pre-flight`)
      await c.navigate(`/plan/${cA}/pre-flight`, 9000);
    const steps = await ev<any>(`(() => {
      const s = (n) => { const el = document.getElementById('step-' + n); const box = el?.querySelector('header input[type="checkbox"]');
        return { text: el ? el.innerText : '', checked: !!box?.checked, disabled: !!box?.disabled }; };
      return { one: s(1), two: s(2), three: s(3), line: document.querySelector('[data-go-to-step]')?.innerText.trim() ?? '' };
    })()`);
    r.C3 =
      [steps.one, steps.two].every((s: any) => s.text.includes(W11) && s.checked && s.disabled) &&
      !steps.three.checked &&
      steps.line === GO_TO_STEP_3;
    detail.C3 = JSON.stringify(steps).slice(0, 300);
    const top = await ev<any>(`(() => {
      const back = [...document.querySelectorAll('a')].find(a => a.innerText.trim() === ${JSON.stringify(W9)});
      const strip = document.querySelector('[data-moment-strip]');
      return { back: back ? back.getAttribute('href') : null, line: document.body.innerText.includes(${JSON.stringify(W10)}),
        notNeeded: strip ? (strip.innerText.match(/not needed/g) || []).length : -1 };
    })()`);
    r.C4 = top.line && top.back === `/plan/${cA}/setup?at=opening` && top.notNeeded === 2;
    detail.C4 = JSON.stringify(top);

    // C5 — changing her mind: the strip's Moment 2 opens Moment 2's opening, and writes nothing.
    const t5 = await tap(stripDoor("What's the plan?"), 7000);
    r.C5 =
      t5 === null &&
      (await onOpening()) &&
      (await flagOf(cA)) === true &&
      (await statusOf(cA)) === 'CONFIRMING';
    detail.C5 = `tap ${t5}, at ${await path()}`;

    // C6 — "Let’s do this →" starts a plan: the questions; the flag off; still held; no AI.
    const t6 = (await onOpening()) ? await tap(byWords(LETS_DO_THIS, 'button'), 3500) : 'absent';
    const ai6 = (
      await prisma.event.findUnique({ where: { id: cA }, select: { aiCallsUsed: true } })
    )?.aiCallsUsed;
    r.C6 =
      t6 === null &&
      (await body()).includes('What kind of event are you planning?') &&
      (await flagOf(cA)) === false &&
      (await statusOf(cA)) === 'CONFIRMING' &&
      ai6 === 0;
    detail.C6 = `tap ${t6}, ai ${ai6}`;

    // C7 — the board of a sent invites-only event, and its search.
    await c.navigate(`/plan/${cB}/glance`, 9000);
    const doorsSeen = await ev<any>(`({ print: !!document.querySelector('[data-print-door]'),
      plan: !!document.querySelector('[data-plan-door]'), head: [...document.querySelectorAll('button')].some(b => b.innerText.trim() === ${JSON.stringify(SEARCH_BUTTON_AT_HEAD)}) })`);
    const t7 = await tap(byWords(W15, 'button'), 1500);
    if (t7 === null) {
      await ev(`document.querySelector('input[type="search"]')?.focus()`);
      await c.insertText('lowe');
      await sleep(1500);
    }
    const hits = await ev<string[]>(
      `[...document.querySelectorAll('[data-event-hit]')].map(e => e.innerText.replace(/\\s+/g, ' ').trim())`
    );
    r.C7 =
      boardFlagged &&
      t7 === null &&
      !doorsSeen.print &&
      !doorsSeen.plan &&
      !doorsSeen.head &&
      same(hits, ['Kate Lowe: Confirmed', 'Jo Lowe: Confirmed', 'Ross Lowe: No answer yet']);
    detail.C7 = `flagged ${boardFlagged}, tap ${t7}, doors ${JSON.stringify(doorsSeen)}, hits ${JSON.stringify(hits)}`;

    // C11 — an event with an item: Moment 2's opening shows, without W1 and W2 (until GTC-375).
    await c.navigate(`/plan/${cC}/setup`, 8000);
    const t11 = await tap(stripDoor("What's the plan?"), 2500);
    const b11 = await body();
    r.C11 = t11 === null && b11.includes(LETS_DO_THIS) && !b11.includes(W1) && !b11.includes(W2);
    detail.C11 = `tap ${t11}`;

    // C8 — the pre-flight at 390.
    await c.setViewport(390, 844, true);
    await c.navigate(`/plan/${cA}/pre-flight`, 9000);
    const sw = await ev<number>('document.documentElement.scrollWidth');
    r.C8 = sw === 390;
    detail.C8 = `${sw}px`;
  } catch (e) {
    console.error('    the walk threw:', (e as Error).message.split('\n')[0]);
  } finally {
    chrome?.close();
  }

  const labels: [string, string][] = [
    ['C1', 'C1 Moment 2’s opening offers W1, with W2 under it'],
    [
      'C2',
      'C2 W1, through clickGuarded on its own fixture: the pre-flight opens; CONFIRMING; the flag true',
    ],
    ['C3', 'C3 steps 1 and 2 read W11, ticked and greyed; step 3 is not; the line names step 3'],
    ['C4', 'C4 W10 under the intro; W9 goes to ?at=opening; the strip says "not needed" twice'],
    [
      'C5',
      'C5 the strip’s Moment 2 opens Moment 2’s opening, and writes nothing (flag true, still held)',
    ],
    [
      'C6',
      'C6 "Let’s do this →" opens the questions; the flag false; still CONFIRMING; aiCallsUsed 0',
    ],
    [
      'C7',
      'C7 a sent invites-only board: W15; no print door, no "Change who’s on what"; W17 in the search',
    ],
  ];
  for (const [k, label] of labels) assert('C', label, r[k] === true, detail[k]);
  assert(
    'C',
    'C0 CONTROL: both probes failed in the browser (plan-making and sending blocked)',
    probes.plan === 'failed' && probes.send === 'failed',
    JSON.stringify(probes)
  );
  assert('C', `C8 CONTROL: the pre-flight is 390px wide at 390 (${detail.C8})`, r.C8 === true);
  const hosts = chrome ? chrome.hostsRequested() : [];
  const blocked = chrome ? chrome.planMakingBlocked() : ['no chrome'];
  assert(
    'C',
    'C9 CONTROL: the browser reached localhost:3000 only, and nothing but the two probes was blocked',
    hosts.length > 0 &&
      hosts.every((h) => h === 'localhost:3000') &&
      blocked.length === 2 &&
      blocked.every((b) => /gtc374-probe/.test(b)),
    `${hosts.join(',')} | ${blocked.join(' | ')} | refused: ${refusals.join(' | ')}`
  );
  const dialogs = chrome ? chrome.dialogs() : ['no chrome'];
  assert(
    'C',
    `C10 CONTROL: no dialog but "leave site?" (${dialogs.length} logged)`,
    dialogs.every((d) => d === 'beforeunload'),
    dialogs.join(',')
  );
  assert(
    'C',
    'C11 CONTROL: an event with an item — Moment 2’s opening shows, without W1 and W2',
    r.C11 === true,
    detail.C11
  );

  // ── Z — the fixture, counted while it exists, then removed by id ────────────
  const ai = await prisma.event.findMany({
    where: { id: { in: created.events } },
    select: { aiCallsUsed: true },
  });
  const whileExists = await rows();
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'Z',
    `Z1 CONTROL: counted while it existed (${whileExists}), every row removed by id (${left}), aiCallsUsed 0, totals as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    whileExists.startsWith('10,') &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      ai.length === 10 &&
      ai.every((e) => e.aiCallsUsed === 0) &&
      after.invite === before.invite &&
      after.outbound === before.outbound
  );
}

async function cleanup() {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  const evIds = created.events;
  // Every row below was made by this suite: its events and what hangs off them (the guest links its
  // own holds minted, its snapshots and its one clash), its people, its two users and their sessions.
  const tokenIds = (
    await prisma.accessToken.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((t) => t.id);
  await del(() => prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: evIds } } }));
  const sessionIds = (
    await prisma.session.findMany({
      where: { userId: { in: created.users } },
      select: { id: true },
    })
  ).map((s) => s.id);
  await del(() => prisma.session.deleteMany({ where: { id: { in: sessionIds } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  await runInMemory();
  await runLive();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const r of redAssertions) console.log(`  ${r}`);
  }
}

main()
  .catch(async (e) => {
    console.error(e);
    failed++;
    await cleanup();
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
