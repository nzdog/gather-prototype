/**
 * GTC-381 — walkthrough batch 12: getting around (the 10 Oct walk's fourth batch).
 *
 * The founder walked the launch code on 2026-10-10 and ruled five batches (GTC-378). This suite
 * pins the fourth to his rulings (GTC-381: scoping rulings 1 to 4, plan rulings Q1 to Q14 and
 * addendum rulings Q15 to Q19, all 2026-10-12):
 *
 *   35  every new event is made with its empty EventSetup record, inside the event's own create
 *       (ruling 1, Q2); "Moment 2 has begun" means a kind, invites only or an approval (Q1), so a
 *       new event opens where an event with no record opens today, and the strip waits for her own
 *       household; finalize-plan and regenerate-plan refuse an empty record as they refuse none
 *       (Q3); the welcome email lands on the Moment flow (Q4)
 *   36  the trimmed menu bar on every screen of the flow (ruling 2): Your Events and New Event,
 *       full page loads (Q5), Billing and Sign Out under the email (Q6); the five Moment screens
 *       start below the bar (Q7)
 *   52  the old dashboard on a Moment-flow event: no raw status, no "View as Host", no "Save as
 *       Template", the date and occasion as Event Details writes them, "1 host, 6 guests" (Q8,
 *       Q19), and a way back to the event's Moment at the top (Q10, Q11); an old-style event is
 *       unchanged
 *   the doors into Teams: a loose item on the pre-flight opens Moment 3 at that item, the note
 *       reads W11 with "Refresh this list" on its own (Q12, Q16, Q17); the board's "and N more
 *       unassigned" opens Moment 3
 *   Moment 3: "← Back to “What’s the plan?”" (W10) at the left of its top row before the press,
 *       never after it; the bottom bar byte for byte (Q15, C21)
 *   Your Events rows: no raw status and no empty guests line on a Moment-flow event (Q18)
 *
 * What the build is asked for, beyond the words: `src/lib/setup/entry-stage.ts` exports
 * `momentTwoBegun(setup)` and `resolveSetupStage` takes an optional `momentTwoBegun`, read after the
 * plan checks; `src/lib/moments/way-back.ts` exports `wayBack(facts)` → `{ href, words } | null` and
 * `hostsAndGuests(people)`; `unassignedDoorHref` (src/components/glance/strip.ts) opens Moment 3.
 *
 * Layers P, R and S run in memory. Layer C drives the dev server in the walled-off headless Chrome
 * (port 9479) at 1280 and 390, on a fixture of its own (example.com addresses, no phones, the sent
 * event's `sentAt` written directly, nothing queued), behind the three safeguards of
 * GATHER-BUILD-CONSTANTS.md and the send wall: the browser fails every plan-making request and every
 * request to a door that sends before it leaves the page (both proven on probe URLs first); every
 * click is `clickGuarded`, after a check that the target is on top at its middle (a covered target
 * is reported as 'covered', never pressed); a "leave site?" dialog is the only kind answered, and
 * every dialog is logged. C7 raises one on purpose. Never pressed: Send, Generate, Regenerate,
 * "Move on →", "Plan looks good →", New Event, Sign Out, a print dialog. The fixture's
 * `aiCallsUsed` is read while it exists, its rows counted, then removed by id; the totals are
 * asserted as found.
 *
 * Every new assertion carries a presence clause, so a check of something absent cannot pass before
 * the build.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const PORT = 9479;
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

/** JSX text with its entities read as the characters a host sees. */
const decode = (s: string) =>
  s
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rarr;/g, '→')
    .replace(/&larr;/g, '←');

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

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

// ── The ruled words, verbatim ────────────────────────────────────────────────
/** W1 — the old dashboard's People card on a Moment-flow event (Q9 as superseded by Q19). */
const W1 = '1 host, 6 guests';
/** W2 — the card's date, as Event Details writes it (`whenLine`, GTC-368). */
const W2 = 'Mon 9 Nov 2026, 12:00 to 16:00';
/** W4 to W8 — the old dashboard's way back (Q11). W5 and W8 are STRIP_WORDS, reused. */
const W4 = '← Back to “Who’s coming?”';
const W5 = '← Back to “What’s the plan?”';
const W6 = '← Back to “Who’s on what?”';
const W7 = '← Back to “Is everyone sorted?”';
const W8 = '← Back to the board';
/** W10 — Moment 3's top row before the press (Q15): W5's words, `STRIP_WORDS.BACK_TO_WHATS_THE_PLAN`. */
const W10 = W5;
/** W11 — the pre-flight's note under the loose items (Q16), and W12, the link on its own (Q17). */
const W11 =
  'Each one opens “Who’s on what?” at that item. Come back here with “Is everyone sorted?” at the top.';
const W12 = 'Refresh this list';
const OLD_NOTE = 'Teams section in a new tab';
/** GTC-367's W6, the strip's line on Moment 2 before her own household is saved. */
const LOCKED_PLAN = 'You’ll get to “What’s the plan?” once your own household is saved.';
const BACK_TO_PLAN = '← Back to the plan';
const M3_SENTENCE = "Now. Who's on what.";
const QUESTIONS = 'What kind of event are you planning?';
const GONE_FROM_BAR = ['Home', 'Past Events', 'Billing', 'Sign Out'];

const OVERLAY = 'fixed inset-0 top-[65px] z-50';
const OVERLAY_SITES: [string, number][] = [
  ['src/components/plan/SetupOpeningScreen.tsx', 1],
  ['src/components/plan/Moment1Summary.tsx', 1],
  ['src/components/plan/Moment2Opening.tsx', 1],
  ['src/components/plan/Moment2Step1Modal.tsx', 2],
  ['src/app/plan/[eventId]/setup/page.tsx', 3],
];

// ══ IN MEMORY — the pure layer, the render and the source ══════════════════════
async function runInMemory() {
  const ES = await load('../src/lib/setup/entry-stage');
  const WB = await load('../src/lib/moments/way-back');
  const GS = await load('../src/components/glance/strip');

  // ── P — the rules ──────────────────────────────────────────────────────────
  const begun = (s: unknown) => ES.momentTwoBegun(s);
  assert(
    'P',
    'P1 momentTwoBegun: an empty record has not begun; a kind, invites only or an approval each has; no record has not (Q1)',
    ok(
      () =>
        typeof ES?.momentTwoBegun === 'function' &&
        begun(null) === false &&
        begun({ eventType: null, invitesOnly: false, planApprovedAt: null }) === false &&
        begun({ eventType: 'Christmas', invitesOnly: false, planApprovedAt: null }) === true &&
        begun({ eventType: null, invitesOnly: true, planApprovedAt: null }) === true &&
        begun({ eventType: null, invitesOnly: false, planApprovedAt: new Date() }) === true
    )
  );
  const stage = (input: any) => ES.resolveSetupStage(input);
  const empty = { items: [], hasSetup: true, householdCount: 0, momentTwoBegun: false };
  assert(
    'P',
    'P2 the entry rule with Moment 2 not begun: no households → opening, households → moment1; a plan, an approval and invites only still win (Q1)',
    ok(
      () =>
        stage(empty) === 'opening' &&
        stage({ ...empty, householdCount: 3 }) === 'moment1' &&
        stage({ ...empty, householdCount: 3, items: [{ source: 'GENERATED' }] }) === 'plan' &&
        stage({ ...empty, householdCount: 3, planApproved: true }) === 'moment3' &&
        stage({ ...empty, householdCount: 3, invitesOnly: true }) === 'invites-only'
    )
  );
  assert(
    'P',
    'P3 CONTROL: without the new input, today’s answers (a record → the questions; none → Moment 1 or the opening)',
    ok(
      () =>
        stage({ items: [], hasSetup: true, householdCount: 3 }) === 'moment2-step1' &&
        stage({ items: [], hasSetup: true, householdCount: 3, momentTwoBegun: true }) ===
          'moment2-step1' &&
        stage({ items: [], hasSetup: false, householdCount: 3 }) === 'moment1' &&
        stage({ items: [], hasSetup: false, householdCount: 0 }) === 'opening'
    )
  );
  const facts = (over: Record<string, unknown>) => ({
    id: 'e1',
    setup: { eventType: null, invitesOnly: false, planApprovedAt: null },
    status: 'DRAFT',
    sentAt: null,
    items: [],
    ...over,
  });
  const back = (over: Record<string, unknown>) => {
    const b = WB.wayBack(facts(over));
    return b ? `${b.href} ${b.words}` : 'null';
  };
  const when = '2026-10-01T00:00:00.000Z';
  const typed = { eventType: 'Christmas', invitesOnly: false, planApprovedAt: null };
  const approved = { ...typed, planApprovedAt: when };
  const people = (roles: string[]) => roles.map((role) => ({ role }));
  assert(
    'P',
    'P4 the way back names the event’s Moment: sent → W8 to the board; held → W7 to the pre-flight; approved → W6; begun, a plan or invites only → W5; else W4 (Q10, Q11); W1’s forms (Q19)',
    ok(
      () =>
        typeof WB?.wayBack === 'function' &&
        back({ setup: approved, status: 'CONFIRMING', sentAt: when }) === `/plan/e1/glance ${W8}` &&
        back({ setup: approved, status: 'CONFIRMING' }) === `/plan/e1/pre-flight ${W7}` &&
        back({ setup: approved }) === `/plan/e1/setup ${W6}` &&
        back({ setup: typed }) === `/plan/e1/setup ${W5}` &&
        back({ items: [{ source: 'GENERATED' }] }) === `/plan/e1/setup ${W5}` &&
        back({ setup: { eventType: null, invitesOnly: true, planApprovedAt: null } }) ===
          `/plan/e1/setup ${W5}` &&
        back({}) === `/plan/e1/setup ${W4}` &&
        WB.hostsAndGuests(people(['HOST', ...Array(6).fill('PARTICIPANT')])) === W1 &&
        WB.hostsAndGuests(people(['HOST', 'HOST', 'COORDINATOR'])) === '2 hosts, 1 guest' &&
        WB.hostsAndGuests([]) === '0 hosts, 0 guests'
    )
  );
  assert(
    'P',
    'P5 an old-style event (no record) has no Moment to go back to: no way back (Q10)',
    ok(
      () =>
        typeof WB?.wayBack === 'function' &&
        WB.wayBack(facts({ setup: null })) === null &&
        WB.wayBack(facts({ setup: null, status: 'CONFIRMING', sentAt: when })) === null
    )
  );
  assert(
    'P',
    'P6 "and N more unassigned" opens Moment 3: unassignedDoorHref("e1") is "/plan/e1/setup" (ruling 4)',
    ok(() => GS.unassignedDoorHref('e1') === '/plan/e1/setup')
  );

  // ── R — what renders ───────────────────────────────────────────────────────
  // Imported statically, as batch9 and batch11 do, so the toast provider reaches Moment 3.
  const m3 = (sentAt: string | null) =>
    render(
      createElement(
        ToastProvider as any,
        null,
        createElement(Moment3AssignView as any, {
          eventId: 'e1',
          event: { id: 'e1', status: 'DRAFT', sentAt },
          hostPersonId: 'p-kate',
          headcount: 4,
          categories: [
            {
              id: 'c1',
              name: 'Mains',
              emoji: '🍖',
              items: [{ id: 'i1', name: 'Ham', kind: 'ITEM', detail: '' }],
            },
          ],
          initialHolders: {},
          households: [],
          askForReason: async () => ({ proceed: true }),
          askForBatchReason: async () => ({ proceed: true }),
          onBack: () => {},
          onMoveOn: () => {},
          stripDoors: {},
        })
      )
    );
  const barAt = (h: string) => h.indexOf('<div class="fixed bottom-0');
  const before = m3(null);
  assert(
    'R',
    'R13 Moment 3 before the press: W10 is a button at the top, before the strip and outside the bottom bar (Q15)',
    ok(() => {
      const at = before.indexOf(`>${W10}</button>`);
      const strip = before.indexOf('data-moment-strip');
      return before.length > 0 && at > 0 && strip > at && barAt(before) > at;
    }),
    `render ${before.length} chars`
  );
  const after = m3(when);
  assert(
    'R',
    'R14 CONTROL: after the press there is no W10, and the bar has "← Back to the board" (C21)',
    after.length > 0 &&
      !after.includes(W10) &&
      after.slice(Math.max(0, barAt(after))).includes(`>${W8}</a>`)
  );

  // ── S — the sources ────────────────────────────────────────────────────────
  const eventsRoute = codeOnly(read('src/app/api/events/route.ts'));
  assert(
    'S',
    'S1 POST /api/events makes the empty record inside the event’s own create, in the same transaction (ruling 1, Q2)',
    /tx\.event\.create\(\{\s*data:\s*\{\s*\.\.\.eventData,\s*hostId:\s*person\.id,\s*setup:\s*\{\s*create:\s*\{\s*\}\s*\}\s*\}\s*,?\s*\}\)/.test(
      eventsRoute
    )
  );
  assert(
    'S',
    'S2 CONTROL: GTC-280’s invariant on that file — no session cookie set and no Session row created anywhere in it',
    eventsRoute.length > 0 &&
      !/cookies\s*\.\s*set\s*\(\s*['"`]session['"`]/.test(eventsRoute) &&
      !/\.set\(\s*['"`]session['"`]/.test(eventsRoute) &&
      !/session\s*\.\s*create\s*\(/.test(eventsRoute) &&
      /stripe\.checkout\.sessions\.retrieve/.test(eventsRoute)
  );
  const setup = codeOnly(read('src/app/plan/[eventId]/setup/page.tsx'));
  assert(
    'S',
    'S3 the setup page fetches households and passes momentTwoBegun when Moment 2 has not begun, and the strip’s hostSaved reads the same fact (Q1)',
    /import\s*\{[^}]*\bmomentTwoBegun\b[^}]*\}\s*from\s*'@\/lib\/setup\/entry-stage'/.test(setup) &&
      /if \(!momentTwoBegun\(loadedEvent\.setup\)\)/.test(setup) &&
      /momentTwoBegun:\s*momentTwoBegun\(loadedEvent\.setup\)/.test(setup) &&
      /const hostSaved\s*=\s*momentTwoBegun\(event\?\.setup\)\s*\|\|/.test(setup)
  );
  const refuses = (rel: string) =>
    /if \(!setup \|\| !setup\.eventType\)\s*\{[\s\S]{0,400}?'No event setup found'[\s\S]{0,80}?status: 404/.test(
      codeOnly(read(rel))
    );
  assert(
    'S',
    'S4 finalize-plan and regenerate-plan refuse a record with no event type exactly as they refuse no record (404, the same words) (Q3)',
    refuses('src/app/api/events/[id]/finalize-plan/route.ts') &&
      refuses('src/app/api/events/[id]/regenerate-plan/route.ts')
  );
  const nav = codeOnly(read('src/components/shared/Navigation.tsx'));
  const navItemsAt = nav.indexOf('const navItems = [');
  const navItems = navItemsAt < 0 ? '' : nav.slice(navItemsAt, nav.indexOf('];', navItemsAt));
  assert(
    'S',
    'S5 the bar: its list is Your Events and New Event, plain links (full page loads) and a plain logo link; no Home, no Past Events; the account panel under the email; both panels at z-[60]; Sign Out still calls the logout route (Q5, Q6)',
    navItems.length > 0 &&
      [...navItems.matchAll(/href:\s*'([^']*)'/g)].map((m) => m[1]).join() ===
        '/plan/events,/plan/new' &&
      !nav.includes('/plan/templates') &&
      !/label:\s*'Home'/.test(nav) &&
      !/<Link\b/.test(nav) &&
      !/from 'next\/link'/.test(nav) &&
      /<a\s+href="\/"/.test(nav) &&
      /aria-controls="account-menu"/.test(nav) &&
      /id="account-menu"/.test(nav) &&
      count(nav, /z-\[60\]/g) >= 2 &&
      !/\bz-40\b/.test(nav) &&
      count(nav, /fetch\('\/api\/auth\/logout'/g) === 1
  );
  const overlaysOk = OVERLAY_SITES.every(([rel, n]) => {
    const src = codeOnly(read(rel));
    return (
      src.length > 0 &&
      src.split(OVERLAY).length - 1 === n &&
      !src.includes('fixed inset-0 z-50') &&
      !new RegExp(`fixed inset-0 top-\\[65px\\] z-50[^"\`]*bottom-0`).test(src)
    );
  });
  assert(
    'S',
    'S6 the eight Moment-screen sites start below the bar (inset-0 top-[65px], never bottom-0); Moment 2’s opening has no min-h-screen; Moment 1’s card column takes 65px off; the opening screen scrolls (Q7)',
    overlaysOk &&
      !codeOnly(read('src/components/plan/Moment2Opening.tsx')).includes('min-h-screen') &&
      setup.includes('max-h-[calc(100vh-4rem-65px)]') &&
      /fixed inset-0 top-\[65px\] z-50[^`]*overflow-y-auto/.test(
        codeOnly(read('src/components/plan/SetupOpeningScreen.tsx'))
      )
  );
  assert(
    'S',
    'S7 CONTROL: Moment 2’s fixed bottom bar keeps its class string verbatim (batch10 L6, L7, R3)',
    read('src/components/plan/Moment2Step1Modal.tsx').includes(
      'fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4'
    )
  );
  const dash = codeOnly(read('src/app/plan/[eventId]/page.tsx'));
  assert(
    'S',
    'S8 the old dashboard: each Moment-flow change behind event.setup, each old fragment kept verbatim for an old-style event; the way back from wayBack (Q8, Q10, Q14, Q19)',
    /\{!event\.setup && \(\s*<span className="px-2 py-1 bg-sage-100 text-sage-800 rounded">\s*\{event\.status\}\s*<\/span>\s*\)\}/.test(
      dash
    ) &&
      /\{!event\.setup && \(\s*<button[\s\S]{0,1400}?View as Host\s*<\/button>\s*\)\}/.test(dash) &&
      /\{!event\.setup && inviteLinksError && \(/.test(dash) &&
      /\{!event\.setup &&\s*\(event\.status === 'CONFIRMING' \|\| isSentJson\(event\)\) && \(/.test(
        dash
      ) &&
      /\{\(!event\.setup \|\| event\.guestCount != null\) && \(\s*<p className="text-sm text-gray-600">\{event\.guestCount\} guests<\/p>/.test(
        dash
      ) &&
      /\{event\.setup\s*\?\s*whenLine\(\s*event\.startDate,\s*event\.endDate,\s*event\.venueTimingStart,\s*event\.venueTimingEnd\s*\)\s*:\s*new Date\(event\.startDate\)\.toLocaleDateString\(\)\}/.test(
        dash
      ) &&
      /\{event\.setup\s*\?\s*occasionLabel\(event\.setup\.eventType, event\.setup\.eventTypeOther\)\s*:\s*event\.occasionType\}/.test(
        dash
      ) &&
      /\{event\.setup\s*\?\s*\(\s*hostsAndGuests\(people\)\s*\)\s*:\s*\(\s*<>\s*\{people\.filter\(\(p\) => p\.role === 'COORDINATOR'\)\.length\} coordinators,\{' '\}\s*\{people\.filter\(\(p\) => p\.role === 'PARTICIPANT'\)\.length\} participants\s*<\/>\s*\)\}/.test(
        dash
      ) &&
      /const back\s*=\s*wayBack\(/.test(dash) &&
      /href=\{back\.href\}/.test(dash) &&
      /\{back\.words\}/.test(dash) &&
      /import\s*\{[^}]*\bwhenLine\b[^}]*\}\s*from\s*'@\/components\/shared\/EventDetails'/.test(
        dash
      ) &&
      /import\s*\{[^}]*\boccasionLabel\b[^}]*\}\s*from\s*'@\/components\/shared\/EventDetails'/.test(
        dash
      ) &&
      /import\s*\{[^}]*\bwayBack\b[^}]*\}\s*from\s*'@\/lib\/moments\/way-back'/.test(dash) &&
      /import\s*\{[^}]*\bhostsAndGuests\b[^}]*\}\s*from\s*'@\/lib\/moments\/way-back'/.test(dash)
  );
  assert(
    'S',
    'S9 CONTROL: the old dashboard never says "glance" (glance-grid "V1 untouched", board-door F5)',
    read('src/app/plan/[eventId]/page.tsx').length > 0 &&
      !/glance/i.test(read('src/app/plan/[eventId]/page.tsx'))
  );
  const pf = decode(codeOnly(read('src/app/plan/[eventId]/pre-flight/page.tsx')));
  const w11At = pf.replace(/\s+/g, ' ').indexOf(W11);
  assert(
    'S',
    'S10 the pre-flight: each loose item opens Moment 3 at that item in the same tab; no new tab, no ?expand=teams; the note is W11, then "Refresh this list" on its own (ruling 4, Q16, Q17)',
    /href=\{itemDoorHref\(eventId, i\.id\)\}/.test(pf) &&
      /import\s*\{[^}]*\bitemDoorHref\b[^}]*\}\s*from\s*'@\/lib\/events\/home-href'/.test(pf) &&
      !pf.includes('_blank') &&
      !pf.includes('expand=teams') &&
      !pf.includes(OLD_NOTE) &&
      w11At > 0 &&
      pf.replace(/\s+/g, ' ').indexOf(W12) > w11At
  );
  assert(
    'S',
    'S11 the welcome email’s sign-in link lands on the Moment flow, /plan/<id>/setup (Q4)',
    /returnUrl=\$\{encodeURIComponent\(`\/plan\/\$\{eventId\}\/setup`\)\}/.test(
      codeOnly(read('src/lib/email.ts'))
    )
  );
  const view = codeOnly(read('src/components/plan/Moment3AssignView.tsx'));
  const viewAtHead =
    spawnSync('git', ['show', 'HEAD:src/components/plan/Moment3AssignView.tsx'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout ?? '';
  const topBackAt = view.indexOf('const topBack');
  const mainReturn = view.indexOf('\n  return (\n    <div className="min-h-screen');
  assert(
    'S',
    'S12 Moment 3: W10 is worked out above the return as topBack (null once sent), calls the existing onBack, sits before the strip; no new fetch, no useRouter (Q15, C21)',
    topBackAt > 0 &&
      mainReturn > topBackAt &&
      /const topBack\s*=\s*event\.sentAt\s*\?\s*null\s*:\s*\(\s*<button[\s\S]{0,400}?onClick=\{onBack\}[\s\S]{0,400}?\{STRIP_WORDS\.BACK_TO_WHATS_THE_PLAN\}/.test(
        view
      ) &&
      view.indexOf('{topBack}') > mainReturn &&
      view.indexOf('{topBack}') < view.indexOf('<MomentArc') &&
      count(view, /\bfetch\(/g) === count(codeOnly(viewAtHead), /\bfetch\(/g) &&
      !/useRouter/.test(read('src/components/plan/Moment3AssignView.tsx'))
  );
  const list = codeOnly(read('src/app/plan/events/page.tsx'));
  assert(
    'S',
    'S13 Your Events rows: on a Moment-flow event no raw status and no empty guests line; an old-style row as it was (Q18)',
    /\{!event\.setup && \(\s*<span\s+className=\{`px-3 py-1 text-xs font-medium rounded-full \$\{getStatusBadge\(\s*event\.status\s*\)\}`\}\s*>\s*\{event\.status\}\s*<\/span>\s*\)\}/.test(
      list
    ) &&
      /\{\(!event\.setup \|\| event\.guestCount != null\) && \(\s*<div className="flex items-center gap-2">\s*<Users className="w-4 h-4" \/>\s*<span>\{event\.guestCount\} guests<\/span>/.test(
        list
      )
  );
}

// ══ LIVE — the dev server, in the walled-off headless Chrome ═══════════════════
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  // ── the fixture: Kate's seven events, example.com addresses, no phones, nothing queued ──
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc381-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Lowe', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  // Mon 9 Nov 2026 in New Zealand (W2).
  const start = new Date('2026-11-08T23:00:00.000Z');
  let n = 0;
  const mkEvent = async (name: string, extra: Record<string, unknown> = {}) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        venueName: 'Kate’s place',
        venueTimingStart: '12:00',
        venueTimingEnd: '16:00',
        ...extra,
      } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    return ev.id;
  };
  /** A record made as POST /api/events will make it: empty, in the event's own create. */
  const mkMade = async (name: string) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        setup: { create: {} },
      } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    return ev.id;
  };
  const household = async (
    eventId: string,
    members: [string, string][],
    sent: Date | null,
    host = false
  ) => {
    const h = await prisma.household.create({ data: { eventId } });
    for (const [i, [nm, role]] of members.entries()) {
      let personId = kate.id;
      if (!(host && i === 0)) {
        const p = await prisma.person.create({
          data: {
            name: nm,
            email: role === 'CHILD' ? null : mail(`${nm.toLowerCase().replace(/\W/g, '')}-${n++}`),
          },
        });
        created.people.push(p.id);
        personId = p.id;
      }
      await prisma.personEvent.create({
        data: {
          personId,
          eventId,
          role: host && i === 0 ? 'HOST' : 'PARTICIPANT',
          householdId: h.id,
          householdRole: role,
          ...(sent ? { sentAt: sent } : {}),
        } as any,
      });
    }
  };
  /** Kate and six others: Gus, Aroha and Mia; Josie and Ross; Ted (W1: 1 host, 6 guests). */
  const everyone = async (eventId: string, sent: Date | null = null) => {
    await household(eventId, [['Kate Lowe', 'PRIMARY_CONTACT']], sent, true);
    await household(
      eventId,
      [
        ['Gus Henderson', 'PRIMARY_CONTACT'],
        ['Aroha Henderson', 'PARTNER'],
        ['Mia Henderson', 'CHILD'],
      ],
      sent
    );
    await household(
      eventId,
      [
        ['Josie Walker', 'PRIMARY_CONTACT'],
        ['Ross Walker', 'PARTNER'],
      ],
      sent
    );
    await household(eventId, [['Ted Parata', 'PRIMARY_CONTACT']], sent);
  };
  const itemIds: Record<string, string> = {};
  const plan = async (eventId: string, rows: [string, string, boolean, boolean][]) => {
    const teams: Record<string, string> = {};
    for (const [i, t] of ['Mains', 'Desserts'].entries()) {
      teams[t] = (
        await prisma.team.create({
          data: { name: t, eventId, displayOrder: i, source: 'GENERATED', coordinatorId: kate.id },
        } as any)
      ).id;
    }
    for (const [i, [name, team, held, critical]] of rows.entries()) {
      const item = await prisma.item.create({
        data: {
          name,
          teamId: teams[team],
          source: 'GENERATED',
          aiGenerated: true,
          critical,
          kind: 'ITEM',
          status: held ? 'ASSIGNED' : 'UNASSIGNED',
          displayOrder: i,
        } as any,
      });
      itemIds[`${eventId}:${name}`] = item.id;
      if (held) await prisma.assignment.create({ data: { itemId: item.id, personId: kate.id } });
    }
  };

  // Made as New Event will make them (an empty record): nothing yet; her household and two more;
  // a household that is not hers.
  const evOpen = await mkMade('GTC-381 b12 — opening');
  const evM1 = await mkMade('GTC-381 b12 — Moment 1');
  await household(evM1, [['Kate Lowe', 'PRIMARY_CONTACT']], null, true);
  await household(evM1, [['Gus Henderson', 'PRIMARY_CONTACT']], null);
  await household(evM1, [['Josie Walker', 'PRIMARY_CONTACT']], null);
  const evOwn = await mkMade('GTC-381 b12 — own household');
  await household(evOwn, [['Gus Henderson', 'PRIMARY_CONTACT']], null);
  // Moment 2 begun: a kind chosen, no plan.
  const evQ = await mkEvent('GTC-381 b12 — questions');
  await everyone(evQ);
  await prisma.eventSetup.create({ data: { eventId: evQ, eventType: 'Christmas' } });
  // Held, not sent: Moment 3, the pre-flight's loose items, the old dashboard.
  const evHeld = await mkEvent('GTC-381 b12 — held', { status: 'CONFIRMING' });
  await everyone(evHeld);
  await prisma.eventSetup.create({
    data: { eventId: evHeld, eventType: 'Christmas', planApprovedAt: new Date() },
  });
  await plan(evHeld, [
    ['Glazed ham', 'Mains', true, true],
    ['Roast lamb', 'Mains', false, false],
    ['Bread rolls', 'Mains', false, false],
    ['Classic pavlova', 'Desserts', true, false],
    ['Trifle', 'Desserts', false, false],
  ]);
  // Sent (sentAt written directly: nothing sent, nothing queued): the board and Moment 3 after.
  const sentAt = new Date(Date.now() - 2 * 864e5);
  const evSent = await mkEvent('GTC-381 b12 — sent', { status: 'CONFIRMING', sentAt });
  await everyone(evSent, sentAt);
  await prisma.eventSetup.create({
    data: { eventId: evSent, eventType: 'Christmas', planApprovedAt: new Date() },
  });
  await plan(evSent, [
    ['Glazed ham', 'Mains', true, true],
    ['Roast turkey', 'Mains', false, true],
    ['Bread rolls', 'Mains', false, false],
    ['Trifle', 'Desserts', false, false],
  ]);
  // Old-style: no record, a team and items, a guest count.
  const evV1 = await mkEvent('GTC-381 b12 — old style', { guestCount: 12 });
  await everyone(evV1);
  await plan(evV1, [
    ['Glazed ham', 'Mains', true, false],
    ['Pavlova', 'Desserts', false, false],
  ]);
  const heldFacts = async () =>
    JSON.stringify(
      await prisma.event.findUnique({
        where: { id: evHeld },
        select: { status: true, sentAt: true, setup: { select: { planApprovedAt: true } } },
      })
    );
  const heldBefore = await heldFacts();

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
      await prisma.team.count({ where: { eventId: { in: created.events } } }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.assignment.count({ where: { item: { team: evIn } } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  const refusals: string[] = [];
  const covered: string[] = [];
  let probes = { plan: '', send: '' };
  let hosts: string[] = [];
  let blocked: string[] = [];
  let dialogs: string[] = [];
  let nonGet: string[] = ['(never read)'];
  let chrome: Headless | null = null;
  try {
    if (!up) throw new Error('no dev server');
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    c.answerLeaveDialogs(true);
    // Every request the page makes that is not a GET, kept across navigations in this tab.
    await c.addInitScript(`(() => { const f = window.fetch.bind(window);
      window.fetch = (input, init) => { const m = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') { try { const k = '__gtc381_nonget'; const l = JSON.parse(sessionStorage.getItem(k) || '[]');
          l.push(m + ' ' + (typeof input === 'string' ? input : (input && input.url) || '')); sessionStorage.setItem(k, JSON.stringify(l)); } catch {} }
        return f(input, init); }; })();`);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc381-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc381-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    // The probes are the only writes the page is meant to try: start the record after them.
    await c.evaluate(`sessionStorage.removeItem('__gtc381_nonget')`);
    await c.setSessionCookie(token);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /**
     * Tag what `js` finds, check it is on top at its middle, then click it — guarded. 'absent' when
     * not found, 'covered' when something else is on top (never pressed; neither is a refusal).
     */
    const tap = async (js: string, settleMs = 700) => {
      const state = await ev<string>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return 'absent';
          el.setAttribute('data-t', 'x'); el.scrollIntoView({ block: 'center', inline: 'nearest' }); const b = el.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return hit && el.contains(hit) ? 'ok' : 'covered'; })()`
      );
      if (state !== 'ok') {
        if (state === 'covered') covered.push(js.slice(0, 80));
        return state;
      }
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    const text = () => ev<string>(`document.body.innerText`);
    const current = () =>
      ev<string>(
        `document.querySelector('[data-moment-strip] [aria-current="step"]')?.textContent.trim() ?? ''`
      );
    /** The Moment screen on view: fixed, at z-index 50, the width of the window. */
    const overlay = () =>
      ev<any>(`(() => { const nav = document.querySelector('nav');
        const o = [...document.querySelectorAll('body *')].find(e => { const s = getComputedStyle(e);
          return s.position === 'fixed' && s.zIndex === '50' && e.getBoundingClientRect().width >= innerWidth - 1; });
        const nb = nav ? nav.getBoundingClientRect() : null;
        const hit = nb ? document.elementFromPoint(nb.left + 30, nb.top + nb.height / 2) : null;
        return { top: o ? Math.round(o.getBoundingClientRect().top) : null, navBottom: nb ? Math.round(nb.bottom) : null,
          navOnTop: !!nav && !!hit && nav.contains(hit), sw: document.documentElement.scrollWidth }; })()`);
    const arrival = async (itemId: string) => {
      let seen = false;
      for (let i = 0; i < 60 && !seen; i++) {
        await sleep(200);
        seen =
          (await ev<boolean>(
            `(() => { const li = document.querySelector('[data-m3-item="${itemId}"]'); return !!li && li.style.outline !== ''; })()`
          )) === true;
      }
      await sleep(700);
      const mid =
        await ev<any>(`(() => { const li = document.querySelector('[data-m3-item="${itemId}"]'); if (!li) return null;
        const b = li.getBoundingClientRect(); const cy = b.top + b.height / 2; const h = window.innerHeight;
        return { path: location.pathname, search: location.search, centred: cy > h * 0.2 && cy < h * 0.8, outlined: li.style.outline !== '',
          picked: !!document.querySelector('[data-m3-row][aria-pressed="true"]') }; })()`);
      return { seen, mid };
    };
    const W10_BUTTON = `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(W10)})`;
    /** Moment 3's W10: where it sits, then a tap, and where she lands. */
    const backToPlan = async () => {
      const at =
        await ev<any>(`(() => { const b = ${W10_BUTTON}; const s = document.querySelector('[data-moment-strip]');
        if (!b || !s) return null; return { above: b.getBoundingClientRect().bottom <= s.getBoundingClientRect().top + 1,
          inBar: !!b.closest('.fixed'), sw: document.documentElement.scrollWidth }; })()`);
      const t = at ? await tap(W10_BUTTON, 3000) : 'absent';
      await sleep(1500);
      const landed =
        await ev<any>(`({ path: location.pathname, plan: document.body.innerText.includes('Plan looks good'),
        m3: document.body.innerText.includes(${JSON.stringify(M3_SENTENCE)}) })`);
      return { at, t, landed };
    };
    const FIVE: [string, string, string][] = [
      [
        'opening',
        `/plan/${evOpen}/setup`,
        `document.body.innerText.includes('Ready to start herding')`,
      ],
      ['own household', `/plan/${evOwn}/setup`, `!!document.getElementById('m1-host-email')`],
      [
        'Moment 1',
        `/plan/${evM1}/setup`,
        `!!document.getElementById('m1-name') && !document.getElementById('m1-host-email')`,
      ],
      [
        'Moment 2’s opening',
        `/plan/${evQ}/setup?at=opening`,
        `document.body.innerText.includes('Let’s do this')`,
      ],
      [
        'the questions',
        `/plan/${evQ}/setup`,
        `document.body.innerText.includes(${JSON.stringify(QUESTIONS)})`,
      ],
    ];

    for (const [w, h, mobile] of [
      [1280, 900, false],
      [390, 844, true],
    ] as [number, number, boolean][]) {
      const k = w === 1280 ? '' : 'p';
      await c.setViewport(w, h, mobile);

      // C1 — a new event, nothing yet: the opening screen, not the questions.
      await c.navigate(`/plan/${evOpen}/setup`, 8000);
      const t1 = await text();
      r[`C1${k}`] = t1.includes('Ready to start herding') && !t1.includes(QUESTIONS);
      detail[`C1${k}`] = t1.slice(0, 120).replace(/\n/g, ' | ');

      // C2 — a new event with her household and two more: Moment 1.
      await c.navigate(`/plan/${evM1}/setup`, 8000);
      const t2 = await text();
      const cur2 = await current();
      const name2 = await ev<boolean>(`!!document.getElementById('m1-name')`);
      r[`C2${k}`] = cur2.includes("Who's coming?") && name2 && !t2.includes(QUESTIONS);
      detail[`C2${k}`] = JSON.stringify({ cur2, name2 });

      // C4 — the five Moment screens start below the bar, which is on top.
      const five: any[] = [];
      for (const [label, path, is] of FIVE) {
        await c.navigate(path, 8000);
        five.push({ label, is: await ev<boolean>(is), ...(await overlay()) });
      }
      r[`C4${k}`] = five.every(
        (s) => s.is && s.top === 65 && s.navBottom === 65 && s.navOnTop && (!mobile || s.sw <= 390)
      );
      detail[`C4${k}`] = JSON.stringify(five);
      if (mobile) {
        // C14 — CONTROL: nothing scrolls sideways on the five screens at 390.
        r.C14 = five.length === 5 && five.every((s) => typeof s.sw === 'number' && s.sw <= 390);
        detail.C14 = JSON.stringify(five.map((s) => [s.label, s.sw]));
      }

      if (!mobile) {
        // C3 — her own household's step: the strip's Moment 2 waits, and says so (W6 of GTC-367).
        await c.navigate(`/plan/${evOwn}/setup`, 8000);
        const own = await ev<boolean>(`!!document.getElementById('m1-host-email')`);
        const t3 = await tap(
          `[...document.querySelectorAll('[data-moment-strip] button[aria-disabled="true"]')].find(b => b.textContent.includes("What's the plan?"))`,
          500
        );
        const note3 = await ev<string>(
          `document.querySelector('[data-strip-note]')?.textContent.trim() ?? ''`
        );
        r.C3 = own && t3 === null && note3 === LOCKED_PLAN;
        detail.C3 = JSON.stringify({ own, t3, note3 });

        // C5 — the bar on a computer: Your Events and New Event; the email opens Billing and Sign Out.
        await c.navigate('/plan/events', 6000);
        const bar5 = await ev<any>(`(() => { const nav = document.querySelector('nav');
          const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
          const panels = [...nav.querySelectorAll('#site-menu, #account-menu')];
          const inBar = [...nav.querySelectorAll('a, button')].filter(e => vis(e) && !panels.some(p => p.contains(e))).map(e => e.innerText.trim()).filter(Boolean);
          const b = nav.querySelector('button[aria-controls="account-menu"]');
          return { inBar, account: vis(b) ? b.innerText.trim() : null, expanded: b ? b.getAttribute('aria-expanded') : null }; })()`);
        const t5 = bar5?.account
          ? await tap(`document.querySelector('nav button[aria-controls="account-menu"]')`, 500)
          : 'absent';
        const open5 =
          await ev<any>(`(() => { const p = document.getElementById('account-menu'); const b = document.querySelector('nav button[aria-controls="account-menu"]');
          const vis = !!p && p.getClientRects().length > 0; return { vis, text: vis ? p.innerText : '', expanded: b ? b.getAttribute('aria-expanded') : null }; })()`);
        if (t5 === null) await c.pressKey('Escape');
        const shut5 =
          await ev<any>(`(() => { const p = document.getElementById('account-menu'); const b = document.querySelector('nav button[aria-controls="account-menu"]');
          return { vis: !!p && p.getClientRects().length > 0, focused: !!b && document.activeElement === b }; })()`);
        r.C5 =
          Array.isArray(bar5?.inBar) &&
          bar5.inBar.includes('Your Events') &&
          bar5.inBar.includes('New Event') &&
          !bar5.inBar.some((x: string) => GONE_FROM_BAR.includes(x)) &&
          bar5.account === user.email &&
          bar5.expanded === 'false' &&
          t5 === null &&
          open5.vis &&
          open5.expanded === 'true' &&
          open5.text.includes('Billing') &&
          open5.text.includes('Sign Out') &&
          !shut5.vis &&
          shut5.focused;
        detail.C5 = JSON.stringify({ bar5, t5, open5, shut5 });

        // C7 — Moment 1 with a name typed: the bar's Your Events raises "Leave site?" (answered: leave).
        await c.navigate(`/plan/${evM1}/setup`, 8000);
        const field7 = await ev<boolean>(
          `!!document.getElementById('m1-name') && !document.getElementById('m1-host-email')`
        );
        const typed7 = field7 ? await tap(`document.getElementById('m1-name')`, 200) : 'absent';
        if (typed7 === null) await c.insertText('Hamish Lowe');
        const dialogsBefore7 = c.dialogs().length;
        const link7 = `document.querySelector('nav a[href="/plan/events"]')`;
        const t7 = typed7 === null ? await tap(link7, 6000) : 'absent';
        const path7 = await ev<string>(`location.pathname`);
        const new7 = c.dialogs().slice(dialogsBefore7);
        r.C7 =
          typed7 === null &&
          t7 === null &&
          path7 === '/plan/events' &&
          new7.length === 1 &&
          new7[0] === 'beforeunload';
        detail.C7 = JSON.stringify({ field7, typed7, t7, path7, new7 });
        await ev(
          `Object.keys(localStorage).filter((k) => k.startsWith('gather:household-draft:')).forEach((k) => localStorage.removeItem(k))`
        );
      } else {
        // C6 — the phone menu, opened on Moment 1, lies on top of it, in the new order.
        await c.navigate(`/plan/${evM1}/setup`, 8000);
        const t6 = await tap(
          `document.querySelector('nav button[aria-controls="site-menu"]')`,
          500
        );
        const m6 =
          await ev<any>(`(() => { const p = document.getElementById('site-menu'); if (!p || !p.getClientRects().length) return null;
          const a = p.querySelector('a'); const b = a.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return { onTop: !!hit && p.contains(hit), text: p.innerText }; })()`);
        const order = ['Your Events', 'New Event', user.email, 'Billing', 'Sign Out'].map((x) =>
          (m6?.text ?? '').indexOf(x)
        );
        r.C6 =
          t6 === null &&
          !!m6?.onTop &&
          order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])) &&
          !/\bHome\b|Past Events/.test(m6?.text ?? '');
        detail.C6 = JSON.stringify({ t6, m6, order });
        if (t6 === null) await c.pressKey('Escape');

        // C9 — the way back on a Moment 1 event's old dashboard reads W4 and lands on Moment 1.
        await c.navigate(`/plan/${evM1}`, 9000);
        const link9 = `[...document.querySelectorAll('a')].find(a => a.innerText.trim() === ${JSON.stringify(W4)})`;
        const href9 = await ev<string | null>(`(${link9})?.getAttribute('href') ?? null`);
        const t9 = href9 ? await tap(link9, 8000) : 'absent';
        const path9 = await ev<string>(`location.pathname`);
        const cur9 = await current();
        r.C9 =
          href9 === `/plan/${evM1}/setup` &&
          t9 === null &&
          path9 === `/plan/${evM1}/setup` &&
          cur9.includes("Who's coming?");
        detail.C9 = JSON.stringify({ href9, t9, path9, cur9 });
      }

      // C8 — the old dashboard on a held Moment-flow event: tidied, and the way back at the top.
      await c.setViewport(w, mobile ? 1500 : 1100, mobile);
      await c.navigate(`/plan/${evHeld}`, 9000);
      const d8 =
        await ev<any>(`(() => { const t = document.body.innerText; const h1 = document.querySelector('h1');
        const a = [...document.querySelectorAll('a')].find(x => x.innerText.trim() === ${JSON.stringify(W7)});
        const card = [...document.querySelectorAll('h2')].find(x => x.textContent.trim() === 'Event Details');
        const cardText = card ? card.closest('div.bg-white').innerText : '';
        const ab = a ? a.getBoundingClientRect() : null;
        return { status: t.includes('CONFIRMING'), host: t.includes('View as Host'), template: t.includes('Save as Template'),
          when: cardText.includes(${JSON.stringify(W2)}), occasion: cardText.includes('Christmas'),
          bareGuests: cardText.split('\\n').some(l => l.trim() === 'guests'), people: t.includes(${JSON.stringify(W1)}),
          href: a ? a.getAttribute('href') : null, above: !!ab && !!h1 && ab.bottom <= h1.getBoundingClientRect().top,
          width: ab ? Math.round(ab.width) : 0, sw: document.documentElement.scrollWidth }; })()`);
      r[`C8${k}`] =
        !!d8 &&
        !d8.status &&
        !d8.host &&
        !d8.template &&
        d8.when &&
        d8.occasion &&
        !d8.bareGuests &&
        d8.people &&
        d8.href === `/plan/${evHeld}/pre-flight` &&
        d8.above &&
        (!mobile || (d8.width >= 390 - 32 - 2 && d8.sw <= 390));
      detail[`C8${k}`] = JSON.stringify(d8);

      // C10 — CONTROL: the old-style event's dashboard as it was, and no way back.
      await c.navigate(`/plan/${evV1}`, 9000);
      const d10 = await ev<any>(`(() => { const t = document.body.innerText;
        const card = [...document.querySelectorAll('h2')].find(x => x.textContent.trim() === 'Event Details');
        const cardText = card ? card.closest('div.bg-white').innerText : '';
        return { back: ${JSON.stringify([W4, W5, W6, W7, W8])}.some(x => t.includes(x)), draft: t.includes('DRAFT'),
          host: t.includes('View as Host'), coordinators: t.includes('coordinators,'), guests: cardText.includes('12 guests'),
          date: cardText.includes(new Date(${JSON.stringify(start.toISOString())}).toLocaleDateString()) }; })()`);
      r[`C10${k}`] =
        !!d10 && !d10.back && d10.draft && d10.host && d10.coordinators && d10.guests && d10.date;
      detail[`C10${k}`] = JSON.stringify(d10);
      await c.setViewport(w, h, mobile);

      // C11 — a loose item on the pre-flight opens Moment 3 at that item, in the same tab.
      const bread = itemIds[`${evHeld}:Bread rolls`];
      await c.navigate(`/plan/${evHeld}/pre-flight`, 8000);
      const fold11 = await tap(
        `document.querySelector('#step-1 header button[aria-expanded]')`,
        500
      );
      const door11 = await ev<any>(`(() => { const body = document.getElementById('step-1-body');
        const a = body && [...body.querySelectorAll('a')].find(x => x.innerText.trim() === 'Bread rolls');
        const t = body ? body.innerText.replace(/\\s+/g, ' ') : '';
        return { href: a ? a.getAttribute('href') : null, target: a ? a.getAttribute('target') : null,
          note: t.indexOf(${JSON.stringify(W11)}), refresh: t.lastIndexOf(${JSON.stringify(W12)}) }; })()`);
      const t11 =
        door11?.href === `/plan/${evHeld}/setup?item=${bread}` && door11?.target === null
          ? await tap(
              `[...document.getElementById('step-1-body').querySelectorAll('a')].find(x => x.innerText.trim() === 'Bread rolls')`,
              400
            )
          : 'absent';
      const land11 = t11 === null ? await arrival(bread) : null;
      r[`C11${k}`] =
        fold11 === null &&
        door11?.note >= 0 &&
        door11?.refresh > door11?.note &&
        t11 === null &&
        !!land11?.seen &&
        land11?.mid?.path === `/plan/${evHeld}/setup` &&
        land11?.mid?.search === '' &&
        land11?.mid?.centred === true &&
        land11?.mid?.picked === false;
      detail[`C11${k}`] = JSON.stringify({ fold11, door11, t11, land11 });

      // C15 — Moment 3 before the press: W10 at the top, and a tap lands on Moment 2's plan view.
      await c.navigate(`/plan/${evHeld}/setup`, 9000);
      const b15 = await backToPlan();
      r[`C15${k}`] =
        !!b15.at &&
        b15.at.above &&
        !b15.at.inBar &&
        (!mobile || b15.at.sw <= 390) &&
        b15.t === null &&
        b15.landed.path === `/plan/${evHeld}/setup` &&
        b15.landed.plan &&
        !b15.landed.m3;
      detail[`C15${k}`] = JSON.stringify(b15);

      if (!mobile) {
        // C12 — CONTROL: from Moment 3 before the press, the strip's "Is everyone sorted?" is the
        // way back to the pre-flight, and it writes nothing.
        await c.navigate(`/plan/${evHeld}/setup`, 9000);
        const t12 = await tap(
          `[...document.querySelectorAll('[data-moment-strip] button')].find(b => b.textContent.includes('Is everyone sorted?'))`,
          6000
        );
        const path12 = await ev<string>(`location.pathname`);
        r.C12 = t12 === null && path12 === `/plan/${evHeld}/pre-flight`;
        detail.C12 = JSON.stringify({ t12, path12 });

        // C13 — the board's "and N more unassigned" opens Moment 3.
        await c.navigate(`/plan/${evSent}/glance`, 9000);
        const d13 =
          await ev<any>(`(() => { const a = document.querySelector('[data-unassigned-door]');
          return a ? { href: a.getAttribute('href'), words: a.innerText.trim() } : null; })()`);
        const t13 =
          d13?.href === `/plan/${evSent}/setup`
            ? await tap(`document.querySelector('[data-unassigned-door]')`, 9000)
            : 'absent';
        const at13 = await ev<any>(
          `({ path: location.pathname, m3: document.body.innerText.includes(${JSON.stringify(M3_SENTENCE)}) })`
        );
        r.C13 =
          d13?.words === 'and 2 more unassigned' &&
          t13 === null &&
          at13.path === `/plan/${evSent}/setup` &&
          at13.m3;
        detail.C13 = JSON.stringify({ d13, t13, at13 });

        // C16 — CONTROL: Moment 3 after the press: no W10; the bar's two ways back as GTC-380 left them.
        await c.navigate(`/plan/${evSent}/setup`, 9000);
        const d16 =
          await ev<any>(`(() => { const bar = document.querySelector('div.fixed.bottom-0'); if (!bar) return null;
          return { m3: document.body.innerText.includes(${JSON.stringify(M3_SENTENCE)}), w10: document.body.innerText.includes(${JSON.stringify(W10)}),
            plan: [...bar.querySelectorAll('button')].some(b => b.innerText.trim() === ${JSON.stringify(BACK_TO_PLAN)}),
            board: [...bar.querySelectorAll('a')].some(a => a.innerText.trim() === ${JSON.stringify(W8)}) }; })()`);
        r.C16 = !!d16 && d16.m3 && !d16.w10 && d16.plan && d16.board;
        detail.C16 = JSON.stringify(d16);

        // C17 — arriving with an item: W10 still goes to Moment 2.
        const trifle = itemIds[`${evHeld}:Trifle`];
        await c.navigate(`/plan/${evHeld}/setup?item=${trifle}`, 500);
        const land17 = await arrival(trifle);
        const b17 = await backToPlan();
        r.C17 =
          !!land17.seen &&
          !!b17.at &&
          b17.t === null &&
          b17.landed.path === `/plan/${evHeld}/setup` &&
          b17.landed.plan &&
          !b17.landed.m3;
        detail.C17 = JSON.stringify({ land17, b17 });

        // C18 — Your Events: the Moment-flow row shows no raw status and no empty guests line; the
        // old-style row as it was.
        await c.navigate('/plan/events', 7000);
        const rowOf = (name: string) =>
          `(() => { const h = [...document.querySelectorAll('h2')].find(x => x.textContent.trim() === ${JSON.stringify(name)});
            const row = h && h.closest('.rounded-lg'); return row ? row.innerText : null; })()`;
        const held18 = await ev<string | null>(rowOf('GTC-381 b12 — held'));
        const old18 = await ev<string | null>(rowOf('GTC-381 b12 — old style'));
        r.C18 =
          !!held18 &&
          !!old18 &&
          held18.includes('2 teams') &&
          !held18.includes('CONFIRMING') &&
          !/\bguests\b/.test(held18) &&
          old18.includes('DRAFT') &&
          old18.includes('12 guests');
        detail.C18 = JSON.stringify({ held18, old18 });
      }
    }
    nonGet = await ev<string[]>(`JSON.parse(sessionStorage.getItem('__gtc381_nonget') || '[]')`);
    hosts = c.hostsRequested();
    blocked = c.planMakingBlocked();
    dialogs = c.dialogs();
  } catch (e) {
    console.error('live layer threw:', (e as Error).message);
  } finally {
    chrome?.close();
  }
  if (covered.length) console.log(`    covered (not pressed): ${covered.join(' | ')}`);
  const heldAfter = await heldFacts();

  const C_LABELS: Record<string, string> = {
    C1: 'a new event (an empty record), nothing yet: the opening screen, not the questions (Q1)',
    C2: 'a new event with her household and two more: Moment 1, not the questions (Q1)',
    C3: 'her own household’s step: the strip’s Moment 2 waits, with GTC-367’s line (Q1)',
    C4: 'the five Moment screens start at 65px, under the bar, and the bar is on top (Q7)',
    C5: 'the bar at 1280: Your Events and New Event; the email opens Billing and Sign Out; Escape closes it (Q6)',
    C6: 'the phone menu opened on Moment 1 lies on top of it: Your Events, New Event, the email, Billing, Sign Out (Q6)',
    C7: 'a name typed in Moment 1, then the bar’s Your Events: "Leave site?" (answered: leave), and she arrives (Q5)',
    C8: 'the old dashboard on a held Moment-flow event: no raw status, no View as Host, no Save as Template, W2, Moment 2’s answer, W1, and W7 to the pre-flight at the top (Q8, Q10, Q19)',
    C9: 'the old dashboard on a Moment 1 event: W4, and a tap lands on Moment 1 (Q10, Q11)',
    C10: 'CONTROL: an old-style event’s dashboard as it was (its status, View as Host, coordinators, 12 guests, the browser’s date), no way back (Q10, Q14)',
    C11: 'a loose item on the pre-flight opens Moment 3 at it in the same tab, centred and outlined, nothing picked; the note is W11, then W12 (ruling 4, Q16, Q17)',
    C12: 'CONTROL: from Moment 3 before the press, the strip’s "Is everyone sorted?" lands on the pre-flight (C19)',
    C13: 'the board’s "and 2 more unassigned" opens Moment 3 (ruling 4)',
    C14: 'CONTROL at 390: nothing scrolls sideways on the five Moment screens',
    C15: 'Moment 3 before the press: W10 above the strip, outside the bar; a tap lands on Moment 2’s plan view (Q15)',
    C16: 'CONTROL: Moment 3 after the press: no W10; "← Back to the plan" and "← Back to the board" in the bar (C21)',
    C17: 'arriving at an item: W10 is there and still goes to Moment 2 (Q15)',
    C18: 'Your Events: the held Moment-flow row has no raw status and no empty guests line; the old-style row as it was (Q18)',
  };
  for (const id of [
    'C1',
    'C1p',
    'C2',
    'C2p',
    'C3',
    'C4',
    'C4p',
    'C5',
    'C6',
    'C7',
    'C8',
    'C8p',
    'C9',
    'C10',
    'C10p',
    'C11',
    'C11p',
    'C12',
    'C13',
    'C14',
    'C15',
    'C15p',
    'C16',
    'C17',
    'C18',
  ]) {
    const base = id.replace(/p$/, '');
    const where =
      id.endsWith('p') || id === 'C6' || id === 'C9' || id === 'C14' ? 'phone' : 'desktop';
    assert('C', `${id} ${where}: ${C_LABELS[base]}`, r[id] === true, detail[id]);
  }

  // ── K — the controls ───────────────────────────────────────────────────────
  assert(
    'K',
    'K1 CONTROL: both probes failed in the browser (plan-making and sending blocked)',
    probes.plan === 'failed' && probes.send === 'failed',
    JSON.stringify(probes)
  );
  assert(
    'K',
    'K2 CONTROL: no click was refused',
    up && refusals.length === 0,
    refusals.join(' | ')
  );
  assert(
    'K',
    'K3 CONTROL: Chrome asked only localhost:3000, nothing but the two probes was blocked, and the page wrote nothing: its only non-GET requests are the old dashboard’s read-only gate checks',
    hosts.length > 0 &&
      hosts.every((x) => x === 'localhost:3000') &&
      blocked.length === 2 &&
      blocked.every((b) => /gtc381-probe/.test(b)) &&
      !nonGet.includes('(never read)') &&
      nonGet.every((x) => /^POST \/api\/events\/[^/]+\/gate-check$/.test(x)),
    `${hosts.join(',')} | blocked ${blocked.join(' | ')} | non-GET ${nonGet.join(' | ')}`
  );
  assert(
    'K',
    'K4 CONTROL: no dialog but C7’s "Leave site?"',
    up && dialogs.length <= 1 && dialogs.every((d) => d === 'beforeunload'),
    dialogs.join(',')
  );
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
  );
  assert(
    'K',
    'K5 CONTROL: while the fixture exists, aiCallsUsed is 0 on all seven events, nothing is queued or recorded on them, and the held event’s status and approval are as made',
    ai.length === 7 &&
      ai.every((x) => x === 0) &&
      whileExists.endsWith(',0,0') &&
      heldAfter === heldBefore,
    `ai ${ai}, rows ${whileExists}, held ${heldBefore} → ${heldAfter}`
  );
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K6 CONTROL: every fixture row removed by id, and the InviteEvent and OutboundMessage totals as found',
    created.events.length === 7 &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `${left} | ${JSON.stringify(before)} → ${JSON.stringify(after)}`
  );
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  // Every row below was made by this suite: its seven events and what hangs off them (the old
  // dashboard mints AccessTokens on the held event), its people, its user and her session.
  const evIds = created.events;
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
    for (const x of redAssertions) console.log(`  ${x}`);
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
