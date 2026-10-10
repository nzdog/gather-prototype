/**
 * GTC-378 — the 10 Oct walkthrough, batch 1: the words.
 *
 * The founder walked the launch code on 2026-10-10 and sorted what he found into five batches
 * (GTC-189's Ninth ruling). This suite pins the first to the words and placements he ruled at
 * GTC-378's plan (W1 to W37; rulings 1 to 6):
 *
 *   49      one word for Gather following people up, on what a host reads: nudge, in place of
 *           remind and chase (W1 to W37); the messages guests receive keep their own words
 *   39, 45  each Moment's "When it’s done" directly under its "What this does", on Moments 1, 2
 *           and 3, and nowhere else (Moment 2's on its opening only; Moment 3's always)
 *   47      step 3's line as ruled, and its shorter form on an invites-only event (W7, W8)
 *   38      "{N} people added." bigger, bolder and darker, in the same words and the same place
 *
 * In memory only (Q6): the words byte for byte, in each file's own characters; the screens rendered
 * with renderToStaticMarkup; and a fence over the host's files that finds any remind or chase word
 * left in a string or JSX text, read with the TypeScript parser so a comment never counts. No
 * server, no database row, nothing sent.
 */

// W25 pins a date, so the zone is fixed before any Date is formatted (as test:after-the-press does).
process.env.TZ = 'Pacific/Auckland';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

import { installProviderTrap } from './helpers/provider-trap';
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment1Summary from '../src/components/plan/Moment1Summary';
import Moment1InputForm from '../src/components/plan/Moment1InputForm';
import Moment2Opening from '../src/components/plan/Moment2Opening';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';

installProviderTrap();

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
    return readFileSync(join(process.cwd(), rel), 'utf8');
  } catch {
    return '';
  }
};

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

/** Markup as words: React's text separators dropped, entities read back. */
const words = (h: string) =>
  h
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** Every string and JSX text in a file, as a host could read it: comments are never seen. */
function textsOf(rel: string): string[] {
  const src = read(rel);
  if (!src) return [];
  const file = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    // A module's name is code, never words (`@/lib/eligibility/chase-when-no-mobile`).
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isTemplateExpression(n))
      out.push([n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' '));
    else if (ts.isJsxText(n)) {
      const t = n.text.replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    ts.forEachChild(n, visit);
  };
  visit(file);
  return out;
}

// ── The ruled words, typed here rather than imported, in each file's own characters ─────────────
const M = {
  1: {
    does: 'Gets everyone who’s coming out of your head and into one list. Names, how to reach them, and who’s in each household.',
    done: 'You won’t need to remember who you’ve asked. I’ve got the list, and I’ll handle the invites and nudges from here.', // W1
  },
  2: {
    does: 'Gets the plan out of your head and onto the page. Tell me about the event and any dietary needs, and I’ll draft the full list of what’s needed: food, drinks and everything else. You decide what stays.',
    done: 'You won’t need to worry you’ve forgotten something. The whole plan is in one place, it’s yours, and it’s ready to hand out.',
  },
  3: {
    does: 'Puts a name next to every job. You decide who’s on what, and I keep track of it all.',
    done: 'Every job has an owner, and you’re not carrying the plan anymore. I’ll ask each person and follow up, so you don’t have to.',
  },
  4: {
    does: 'Shows you where everything stands on one screen: who’s said yes, what’s covered, and what’s still open. I nudge anyone who hasn’t replied and flag anything that needs you.', // W2
    done: 'You stop wondering. Every job is confirmed, and you know your event is sorted.',
  },
} as const;
const W3 =
  'Gather talks to one person per household, and for yours that’s you. Leave this off and it won’t nudge you about the people at your own table.';
const W4 =
  'There’s nobody in your household for Gather to nudge yet, so it won’t message you about it. Add someone above and you can choose.';
const W5 = 'Invites, people and nudges →';
const W6 = 'Invites, people and nudges';
const W7 =
  'Everyone with an email or mobile hears from me. Pick who takes the kids’ asks, and how hard I nudge.';
const W8 = 'Everyone with an email or mobile hears from me. Pick how hard I nudge.';
const W9 = "Don't nudge";
const W10 = "Exactly what each person will receive, and who I'll nudge.";
const W11 =
  'Replies to an email come to kate@example.com. A text reply usually comes to your board, and I stop nudging whoever sent it.';
const W12 = "I'll ask, but won't nudge";
const W13 = "When someone hasn't answered and has no mobile I can text, I'll nudge them by email.";
const W14 = 'Nudge them by email';
const W15 = 'Nudge by email';
const W16 = 'Nudges by';
const W17 = 'No nudges — yours';
const W18 = "[can't be nudged — opted out]";
const W19 = "Sarah gets it, but I won't nudge Sarah.";
const W20: Record<string, string> = {
  SMS_OPTED_OUT: "They've opted out of texts — so I won't nudge them at all.", // a
  HANDED_TO_HOST: "You're handling them yourself, so I won't nudge them.", // b
  EMAIL_OPTED_OUT:
    "They unsubscribed from email for this event, so I won't nudge them on any channel.", // c
  MARKED_DONT_CHASE: "You marked them don't-nudge.", // d
  PHONE_UNUSABLE: "I can't text their number and have no email to nudge them by.", // e
  NO_CHANNEL: 'I have no way to nudge them.', // f
  HOST_AS_CARRIER: "It's with you — I don't nudge you.", // g
  HOST_OWN_ASK: "Your own — I don't nudge you.", // h
  HOST_HOUSEHOLD_CHILD: "They're in your own household, so I won't nudge them.", // i
  NO_CARRIER: 'No one to nudge on their behalf.', // j
  HOUSEHOLD_MUTED: "Messages to their household are switched off, so I won't nudge them.", // k
  CHILD_WITHOUT_ITEM: "They hold nothing, so there's nothing to nudge them about.", // l
  EMAIL_REPORTED: "Their email reported your invitation as spam, so I won't nudge them.", // m
  EMAIL_BLOCKED: "I can't email them anymore and have no mobile to nudge them by.", // n
};
const W21 =
  "They chose not to receive email about this event, so I won't nudge them on any channel.";
const W22 =
  'This person has opted out of texts, so they are not nudged at all and the exception is not offered (GTC-189 ruling AI).';
const W23 =
  "The exception applies only to someone I can't text who has an email. This person is nudged by text, marked don't-nudge, the host, or carried by someone else.";
const W24 = 'Who I nudge';
const W25 =
  "The invitations went out on 27 September. Changes here apply to nudges I haven't sent yet.";
const W26 = 'Change who I nudge';
const W27 = 'Opens the page where you can change who I nudge. You will need to be signed in.';
const W28 =
  "This person is marked don't-nudge and will not be nudged. Change the mark under “Who I nudge” first.";
const W29 = 'Nudge them';
const W30 = 'Nudging…';
const W31 = 'Nudged. Nothing here changes until they reply.';
const W32 = ['1 more nudge', '2 more nudges', '3 more nudges'];
const W33 = 'Want me to carry on nudging them?';
const W34 = 'Choose 1, 2 or 3 more nudges.';
const W35 = "Nudges are off for this event, so I won't follow them up.";
const W36 = "I've already asked them once to decide, so I won't nudge them again.";
const W37 = 'No nudges. I won’t follow them up.';
const DONE = 'When it’s done';
const DOES = 'What this does';
const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';

/**
 * The host's files: every screen the ticket names, and the modules whose words they show. The old
 * dashboard's own files are GTC-381's and are not here; the guests' messages are not here.
 */
const HOST_FILES = [
  'src/lib/moments/moment-words.ts',
  'src/components/plan/MomentWords.tsx',
  'src/components/plan/Moment1InputForm.tsx',
  'src/components/plan/Moment1Summary.tsx',
  'src/components/plan/Moment2Opening.tsx',
  'src/components/plan/Moment2PlanView.tsx',
  'src/components/plan/Moment3AssignView.tsx',
  'src/app/plan/[eventId]/setup/page.tsx',
  'src/app/plan/events/page.tsx',
  PAGE,
  'src/components/preflight/PreflightStep.tsx',
  'src/components/preflight/mark-rows.tsx',
  'src/components/preflight/AfterThePress.tsx',
  'src/lib/preflight/ask-preview-compose.ts',
  'src/lib/preflight/after-press-words.ts',
  'src/lib/preflight/chase-choice.ts',
  'src/lib/eligibility/email-block-words.ts',
  'src/lib/eligibility/nudge-mark.ts',
  'src/app/h/[token]/page.tsx',
  'src/app/plan/[eventId]/glance/page.tsx',
  'src/components/glance/GlanceBoard.tsx',
  'src/components/glance/PersonSurface.tsx',
  'src/components/glance/GlancePersonReading.tsx',
  'src/components/glance/reading.ts',
  'src/components/glance/strip.ts',
  'src/lib/glance/actions.ts',
  'src/lib/glance/chase-fact.ts',
  'src/lib/chase-hand-back.ts',
];
const REMIND_OR_CHASE = /\b(remind\w*|chas(e|ed|es|ing)|chase-ups?)\b/i;
/**
 * Strings in those files that are code, not words a host reads — each named, so a new one has to
 * be argued for here. ⚠ NEVER A HOST'S SENTENCE.
 */
const NOT_WORDS = new Set([
  'chase', // AfterThePress: patch('chase', …) — the route's name, and its type
  'remind', // PersonSurface: the busy key, run('remind', …)
  '/api/events/ /pre-flight/chase', // the pre-flight's PATCH address, `${eventId}` read as a space
  "Host marked don't-chase (Moment 4 §10.3)", // nudge-mark: the log-only skip reason (C3)
]);

async function main() {
  const MW = await load('../src/lib/moments/moment-words');
  const APC = await load('../src/lib/preflight/ask-preview-compose');
  const EBW = await load('../src/lib/eligibility/email-block-words');
  const APW = await load('../src/lib/preflight/after-press-words');
  const NM = await load('../src/lib/eligibility/nudge-mark');
  const MR = await load('../src/components/preflight/mark-rows');
  const AC = await load('../src/lib/glance/actions');
  const CF = await load('../src/lib/glance/chase-fact');
  const SP = await load('../src/components/glance/strip');
  const HB = await load('../src/lib/chase-hand-back');

  // ── W — the words, byte for byte ───────────────────────────────────────────────────────────────
  assert(
    'W',
    'W1 Moment 1’s "When it’s done"',
    ok(() => MW.MOMENT_WORDS[1].done === M[1].done)
  );
  assert(
    'W',
    'W2 Moment 4’s "What this does"',
    ok(() => MW.MOMENT_WORDS[4].does === M[4].does)
  );
  assert(
    'W',
    'W1 W2 the other six Moment lines are as they were',
    ok(
      () =>
        MW.MOMENT_WORDS[1].does === M[1].does &&
        MW.MOMENT_WORDS[2].does === M[2].does &&
        MW.MOMENT_WORDS[2].done === M[2].done &&
        MW.MOMENT_WORDS[3].does === M[3].does &&
        MW.MOMENT_WORDS[3].done === M[3].done &&
        MW.MOMENT_WORDS[4].done === M[4].done
    )
  );
  assert(
    'W',
    'W9 the mark pill',
    ok(() => MR.MARK_LABELS.DONT_CHASE === W9)
  );
  assert(
    'W',
    'W11 the reply line',
    ok(() => APC.replyToLine('kate@example.com') === W11)
  );
  assert(
    'W',
    'W12 group B’s heading',
    ok(() => APC.HOST_LIST_NOT_CHASED_HEADING === W12)
  );
  assert(
    'W',
    'W13 the default’s sentence',
    ok(() => APC.CHASE_DEFAULT_SENTENCE.BY_EMAIL === W13)
  );
  assert(
    'W',
    'W14 the switch pill',
    ok(() => APC.CHASE_DEFAULT_PILLS.BY_EMAIL === W14)
  );
  assert(
    'W',
    'W15 the per-person pill',
    ok(() => APC.CHASE_PERSON_PILLS.BY_EMAIL === W15)
  );
  assert(
    'W',
    'W16 the row label',
    ok(() => APC.CHASED_BY_LABEL === W16)
  );
  assert(
    'W',
    'W17 its empty value',
    ok(() => APC.CHASED_BY_VALUE.NONE === W17)
  );
  assert(
    'W',
    'W18 the opted-out placeholder',
    ok(() => APC.CHASE_OPTED_OUT_PLACEHOLDER === W18)
  );
  assert(
    'W',
    'W19 a carried child',
    ok(
      () =>
        APC.notChasedReason({ why: 'HANDED_TO_HOST', child: true, carrierName: 'Sarah Jones' }) ===
        W19
    )
  );
  const why = (APC?.CHASE_NONE_WHY ?? {}) as Record<string, string>;
  const W20_MISSED = Object.keys(W20).filter((k) => why[k] !== W20[k]);
  assert(
    'W',
    'W20 a to n, why a person is not nudged, every one',
    Object.keys(why).length === 14 && W20_MISSED.length === 0,
    W20_MISSED.join(', ')
  );
  assert(
    'W',
    'W20 m and n are email-block-words’ own',
    ok(
      () =>
        EBW.EMAIL_REPORTED_CHASE_WORDS === W20.EMAIL_REPORTED &&
        EBW.EMAIL_BLOCKED_CHASE_WORDS === W20.EMAIL_BLOCKED
    )
  );
  assert(
    'W',
    'W21 group A’s reason for an email opt-out',
    ok(
      () => APC.hostListReason({ why: 'EMAIL_OPTED_OUT', child: false, carrierName: null }) === W21
    )
  );
  // The two 409s are built from string pieces; join the pieces and read the sentence.
  const choice = read('src/lib/preflight/chase-choice.ts').replace(/['"]\s*\+\s*['"]/g, '');
  assert('W', 'W22 the opted-out 409', choice.includes(W22));
  assert('W', 'W23 the not-offered 409', choice.includes(W23));
  assert(
    'W',
    'W24 the heading after Send',
    ok(() => APW.AFTER_PRESS_HEADING === W24)
  );
  assert(
    'W',
    'W25 the lead after Send',
    ok(() => APW.afterPressLead(new Date('2026-09-27T00:00:00Z')) === W25)
  );
  assert(
    'W',
    'W26 the link',
    ok(() => APW.CHASE_DOOR_LINK === W26)
  );
  assert(
    'W',
    'W27 the host link page’s note',
    ok(() => APW.CHASE_DOOR_HOST_VIEW_NOTE === W27)
  );
  assert(
    'W',
    'W28 the refusal',
    ok(() => NM.DONT_CHASE_NOT_ADDRESSABLE_MESSAGE === W28)
  );
  const surface = textsOf('src/components/glance/PersonSurface.tsx');
  assert(
    'W',
    'W29 W30 the board’s button and its busy words',
    surface.includes(W29) && surface.includes(W30)
  );
  assert('W', 'W31 after a nudge', textsOf('src/lib/glance/actions.ts').includes(W31));
  assert(
    'W',
    'W32 the hand-back choices',
    ok(() => JSON.stringify(AC.HAND_BACK_CHOICES.map((c: any) => c.label)) === JSON.stringify(W32))
  );
  assert(
    'W',
    'W33 the hand-back lead for a reply',
    ok(() => AC.HAND_BACK_LEAD_REPLIED === W33)
  );
  const badCount = HB
    ? await HB.handBackPerson(null, { eventId: 'e1', personId: 'p1', reminders: 7 }).catch(
        () => null
      )
    : null;
  assert(
    'W',
    'W34 the hand-back’s 400 (refused before any read)',
    badCount?.ok === false && badCount.status === 400 && badCount.error === W34
  );
  assert(
    'W',
    'W35 the pace is off',
    ok(() => CF.PACE_OFF_CHASE_NOTE === W35)
  );
  assert(
    'W',
    'W36 the follow-up is spent',
    ok(() => CF.FOLLOW_UP_SPENT_CHASE_NOTE === W36)
  );
  assert(
    'W',
    'W37 the colour key’s grey row',
    ok(() => SP.COLOUR_KEY.find((r: any) => r.state === 'NOT_CHASED').words === W37)
  );
  assert('W', 'W6 Your Events’ hover title', textsOf('src/app/plan/events/page.tsx').includes(W6));
  const pageTexts = textsOf(PAGE);
  assert('W', 'W10 step 4’s line', pageTexts.includes(W10));
  const pageSrc = read(PAGE);
  assert(
    'W',
    'W7 W8 step 3’s line: the shorter one on an invites-only event, the ruled one otherwise',
    new RegExp(
      `blurb=\\{\\s*invitesOnly\\s*\\?\\s*(['"])${W8.replace(/\./g, '\\.')}\\1\\s*:\\s*(['"])${W7.replace(/\./g, '\\.')}\\2\\s*\\}`
    ).test(pageSrc)
  );

  // ── R — the screens, rendered ──────────────────────────────────────────────────────────────────
  const formProps = {
    eventId: 'e1',
    eventName: 'Boxing Day',
    onComplete: () => {},
    onAddPerson: async () => {},
    channelCandidates: [],
  };
  const guestForm = render(createElement(Moment1InputForm as any, formProps));
  const hostForm = render(
    createElement(Moment1InputForm as any, {
      ...formProps,
      hostMode: { name: 'Kate', email: 'kate@example.com', phone: null },
      onSaveHostHousehold: async () => {},
    })
  );
  const pair = (n: 1 | 2 | 3) => `${M[n].does}</p></div><div data-moment-words="${n}-done"`;
  const once = (h: string, s: string) => h.split(s).length - 1 === 1;
  assert(
    'R',
    'R1 Moment 1’s form, both steps: "When it’s done" directly under "What this does", once each, before her line',
    [guestForm, hostForm].every(
      (h) =>
        h.includes(pair(1)) &&
        h.includes(M[1].done) &&
        once(h, 'data-moment-words="1-does"') &&
        once(h, 'data-moment-words="1-done"') &&
        h.indexOf(M[1].done) <
          Math.max(h.indexOf('Who’s coming to'), h.indexOf('First — you’re at'))
    )
  );
  const households = [
    {
      id: 'hk',
      primaryContact: { name: 'Kate', email: 'k@example.com' },
      partner: null,
      helpers: [],
      littleCount: 0,
      guests: [],
      isHostHousehold: true,
    },
    {
      id: 'h1',
      primaryContact: { name: 'Josie', email: 'j@example.com' },
      partner: { name: 'Ross', email: 'r@example.com' },
      helpers: [],
      littleCount: 0,
      guests: [],
    },
  ];
  const summary = render(
    createElement(Moment1Summary as any, {
      eventId: 'e1',
      eventName: 'Boxing Day',
      households,
      onContinue: () => {},
      onBackToEditing: () => {},
    })
  );
  assert(
    'R',
    'R2 Moment 1’s summary: no Moment words left (moved, not both), the headline still there',
    words(summary).includes('3 people coming to Boxing Day.') &&
      !summary.includes('data-moment-words') &&
      !summary.includes(DONE)
  );
  const m2open = render(
    createElement(Moment2Opening as any, {
      eventName: 'Boxing Day',
      onStart: () => {},
      onBack: () => {},
    })
  );
  assert(
    'R',
    'R3 Moment 2’s opening: "When it’s done" directly under "What this does", before "Let’s do this →"',
    m2open.includes(pair(2)) && m2open.indexOf(M[2].done) < m2open.indexOf('Let’s do this')
  );
  const planView = render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment2PlanView as any, {
        eventId: 'e1',
        eventName: 'Boxing Day',
        guestCount: 10,
        categories: [],
        onUpdateItem: async () => {},
        onRemoveItem: async () => {},
        onAddItem: async () => {},
        onAddCategory: async () => {},
        onApprove: () => {},
        onBack: () => {},
        onRegeneratePlan: () => {},
        onRegenerateCategory: () => {},
        regeneratingScope: null,
        onEditGuests: () => {},
        onGoToDashboard: () => {},
      })
    )
  );
  assert(
    'R',
    'R4 Moment 2’s plan: no Moment words (the opening only, ruling 5), "+ Add category" still there',
    planView.includes('+ Add category') &&
      !planView.includes('data-moment-words') &&
      !planView.includes(DONE)
  );
  assert(
    'R',
    'R5 W5 the plan’s exit button',
    new RegExp(`<button[^>]*>${W5}</button>`).test(planView)
  );
  const m3 = (categories: unknown[]) =>
    render(
      createElement(
        ToastProvider as any,
        null,
        createElement(Moment3AssignView as any, {
          eventId: 'e1',
          event: { id: 'e1', status: 'DRAFT', sentAt: null },
          hostPersonId: 'p-kate',
          headcount: 4,
          categories,
          initialHolders: {},
          households: [],
          askForReason: async () => ({ proceed: true }),
          askForBatchReason: async () => ({ proceed: true }),
          onBack: () => {},
          onMoveOn: () => {},
        })
      )
    );
  const m3Open = m3([
    {
      id: 'c1',
      name: 'Mains',
      emoji: '🍖',
      items: [{ id: 'i1', name: 'Ham', kind: 'ITEM', detail: '' }],
    },
  ]);
  const sentenceAt = (h: string) => h.indexOf('Now. Who&#x27;s on what.');
  assert(
    'R',
    'R6 Moment 3, a job still unassigned: "When it’s done" directly under "What this does", always (ruling 6), before "Now. Who’s on what."',
    m3Open.includes(pair(3)) &&
      sentenceAt(m3Open) > m3Open.indexOf(M[3].done) &&
      m3Open.indexOf(M[3].done) > 0
  );
  const m3Src = read('src/components/plan/Moment3AssignView.tsx');
  const panelAt = m3Src.indexOf('The completion panel');
  const panelSrc = m3Src.slice(panelAt);
  assert(
    'R',
    'R7 Moment 3’s panel after "All sorted →" carries no Moment words, and MomentWords has no compact size left',
    m3Src.length > 0 &&
      panelAt > 0 &&
      !/MomentWords|doneWords/.test(panelSrc) &&
      !/compact/.test(read('src/components/plan/MomentWords.tsx'))
  );
  assert('R', 'R8 W4 her own household of one', words(hostForm).includes(W4));
  assert(
    'R',
    'R9 W3 her own household’s choice (shown once someone is added)',
    textsOf('src/components/plan/Moment1InputForm.tsx')
      .map((t) => t.replace(/&rsquo;/g, '’'))
      .includes(W3)
  );

  // ── T — the running total (item 38) ────────────────────────────────────────────────────────────
  const counted = render(
    createElement(Moment1InputForm as any, { ...formProps, totalPeopleCount: 5 })
  ).replace(/<!-- -->/g, '');
  const totalEl = counted.match(/<p class="([^"]*)">5 people added\.<\/p>/);
  const cls = totalEl ? totalEl[1].split(/\s+/) : [];
  assert(
    'T',
    'T1 "5 people added." in its words, bigger, bolder and darker: text-base font-semibold text-gray-800',
    !!totalEl &&
      ['text-base', 'font-semibold', 'text-gray-800'].every((c) => cls.includes(c)) &&
      !cls.includes('text-sm') &&
      !cls.includes('text-gray-400'),
    totalEl ? totalEl[1] : 'not found'
  );
  assert(
    'T',
    'T2 CONTROL: in the same place — after her line, before the form',
    !!totalEl &&
      counted.indexOf('5 people added.') > counted.indexOf('Who’s coming to') &&
      counted.indexOf('5 people added.') < counted.indexOf('e.g. Sarah Mitchell')
  );
  assert(
    'T',
    'T3 CONTROL: her own household’s step still shows no total',
    !/people added\./.test(hostForm) && hostForm.length > 0
  );

  // ── F — no remind or chase word left on the host's screens ─────────────────────────────────────
  const left: string[] = [];
  const missing: string[] = [];
  for (const f of HOST_FILES) {
    const texts = textsOf(f);
    if (texts.length === 0) missing.push(f);
    for (const t of texts) {
      const flat = t.replace(/\s+/g, ' ').trim();
      if (REMIND_OR_CHASE.test(flat) && !NOT_WORDS.has(flat)) left.push(`${f}: ${flat}`);
    }
  }
  assert(
    'F',
    `F1 all ${HOST_FILES.length} host files read`,
    missing.length === 0,
    missing.join(', ')
  );
  assert(
    'F',
    'F2 no string or JSX text in them says remind or chase, but the named code strings',
    left.length === 0,
    left.length ? `\n      ${left.join('\n      ')}` : undefined
  );
  assert(
    'F',
    'F3 CONTROL: the fence finds a word — "Remind them" in a probe source is caught',
    (() => {
      const probe = ts.createSourceFile(
        'p.tsx',
        "const a = <b>{x ? 'Reminding…' : 'Remind them'}</b>; // chase",
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      const found: string[] = [];
      const v = (n: ts.Node) => {
        if (ts.isStringLiteral(n) && REMIND_OR_CHASE.test(n.text)) found.push(n.text);
        ts.forEachChild(n, v);
      };
      v(probe);
      return found.length === 2;
    })()
  );
  const guest = textsOf('src/lib/sms/nudge-templates.ts').join(' | ');
  assert(
    'F',
    'F4 CONTROL: the guests keep their own words — "Just a gentle reminder" is still sent',
    guest.includes('Just a gentle reminder')
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const r of redAssertions) console.log(`  ${r}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(() => {
    process.exit(failed > 0 ? 1 : 0);
  });
