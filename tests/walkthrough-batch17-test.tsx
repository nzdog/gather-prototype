/**
 * GTC-387 — walkthrough batch 17: the 14 Oct walk's fourth batch, items 67, 69 and 70.
 *
 * Nigel walked the launch code on 2026-10-14 ("Gather Tweaks 2"). This suite pins the three items
 * to his plan rulings (GTC-387, Q1 to Q20 and W1 to W34, 2026-10-16):
 *
 *   69  the board's door on a "nowhere to send" red: an Email box and a Mobile box under "Add a
 *       way to reach them", one Save that becomes Close; save, then send (ruling 1), all or
 *       nothing (Q3); a mobile-only save with texting off saves the number, sends nothing and
 *       says so (Q2 b, W33); the door then says why there is no text button (W34), and offers
 *       the existing "Send it as a text" once texting is live
 *   67  the pre-flight's "People I’ll leave to you": a name opens a fold with the same boxes only
 *       where new details could fix it (ruling 2, Q6, Q10); host and co-host, through the
 *       pre-flight's existing channel route (Q8); saves only, with a ledger line (Q9)
 *   70  the board's three sealed greys open the reading room with the arrow (Q11): a child
 *       holding nothing ("Give them a job", Moment 3 with the child picked, Q12, Q13), the
 *       don't-nudge mark ("Change who I nudge", Q14) and not coming (a sentence only)
 *
 * Layers W, P, S run in memory; B and F on fixtures of their own behind the provider trap (no
 * drain is ever run, nothing sends, the text seam is the deps argument the door already has).
 * Layer C drives the dev server in a walled headless Chrome (port 9484) at 1280 and 390: every
 * request that is not a GET fails in the browser, except the two box saves on this suite's own
 * events, and every AI route fails even as a GET; proven on probes first. Clicks are scrolled to
 * mid-screen and hit-tested. Send is never pressed. The live conditions are the pure functions
 * between the CHECKS markers, dry-run on a passing and a failing input before RED.
 *
 * GTC387_SHOTS=1 saves pictures to ~/Desktop/GTC-387 looks; unset, none are taken.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import {
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { spawn, spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap, trapCount } from './helpers/provider-trap';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const PORT = 9484;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.GTC387_SHOTS === '1';
const SHOT_DIR = join(homedir(), 'Desktop', 'GTC-387 looks');

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

const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const unchanged = (rel: string) => git(['diff', '--quiet', 'HEAD', '--', rel]).status === 0;

function filesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = `${dir}/${f}`;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) out.push(p);
    }
  };
  try {
    walk(rel);
  } catch {
    // an absent directory has no files
  }
  return out;
}

// ─── The ruled words (GTC-387 plan rulings, 2026-10-16; curly apostrophes) ─────
const W: Record<number, string> = {
  1: 'Email',
  2: 'Mobile',
  3: 'e.g. 021 123 4567',
  4: 'Save',
  5: 'Saving…',
  6: 'Add a way to reach them',
  7: 'Saved, and sending their invitation. The board is catching up.',
  8: 'Close',
  9: 'They’ve opted out of texts, so only an email can reach them.',
  10: 'Add their email or mobile, and I’ll message them with everyone else when you send.',
  11: 'They’ve opted out of texts, so only an email can reach them. I’ll message them with everyone else when you send.',
  14: 'Type an email or a mobile number first.',
  15: 'That doesn’t look like an email address.',
  16: 'They chose not to receive email about this event, so I won’t email them.',
  17: 'I can’t read that as a New Zealand mobile number.',
  18: 'I can’t email that address anymore.',
  19: 'They’ve opted out of texts, so I won’t text them.',
  20: 'I can’t text that number.',
  21: 'I can’t send texts at the moment.',
  22: 'Nothing was saved.',
  23: 'The invitations have gone, so change this on the board.',
  24: 'There’s nothing to change for them here.',
  25: 'No job yet',
  26: 'I haven’t asked anyone about them, so there’s nothing to follow up.',
  27: 'Give them a job',
  28: "You're handling them",
  29: 'You marked them don’t-nudge, so I won’t follow them up.',
  30: 'Change who I nudge',
  31: 'Not coming',
  32: 'They told me they can’t come, so I won’t nudge them.',
  33: 'Saved. I can’t send texts at the moment, so I haven’t sent their invitation.',
  34: 'Their mobile is saved, but I can’t send texts at the moment, so their invitation hasn’t gone.',
};
const W12 = (name: string) => `Saved. ${name} is now in the messages above.`;
const W13 = (name: string) => `${name}: add an email or mobile`;
const OLD_ADDRESS_BLOCKED = "Gather can't email this address anymore.";

const CONTACT_FIX = 'src/lib/contact/contact-fix.ts';
const CONTACT_BOX = 'src/lib/contact/contact-box.ts';
const RESEND = 'src/lib/press/resend.ts';
const ACTIONS = 'src/lib/glance/actions.ts';
const CHANNEL_ROUTE = 'src/app/api/events/[id]/pre-flight/channel/route.ts';
const SETUP_PAGE = 'src/app/plan/[eventId]/setup/page.tsx';
const M3 = 'src/components/plan/Moment3AssignView.tsx';

// ── CHECKS ── (pure; dry-run on a passing and a failing input before RED)
const CHECKS = {
  /** The board's box on a "nowhere to send" door, as facts read from the open panel. */
  C_BOX: (f: any, mobile: boolean) =>
    !!f &&
    f.heading === 'Add a way to reach them' &&
    f.emailLabel === 'Email' &&
    f.email === true &&
    f.mobile === mobile &&
    (mobile ? f.mobileLabel === 'Mobile' && f.hint === 'e.g. 021 123 4567' : true) &&
    f.save === 'Save' &&
    f.sendTo === false,
  /** A refused save: the refusal and "Nothing was saved.", the typing kept, still Save. */
  C_REFUSED: (f: any, refusal: string, typed: string) =>
    !!f &&
    f.outcome === `${refusal} Nothing was saved.` &&
    f.failed === true &&
    f.mobileValue === typed &&
    f.save === 'Save' &&
    f.readOnly === false,
  /** A save: the note, the button reads Close, the boxes read-only. */
  C_SAVED: (f: any, note: string) =>
    !!f && f.outcome === note && f.failed === false && f.save === 'Close' && f.readOnly === true,
  /** The door reopened after a mobile-only save with texting off: W34, the number, no text button. */
  C_HELD: (f: any, shown: string) =>
    !!f &&
    f.held ===
      'Their mobile is saved, but I can’t send texts at the moment, so their invitation hasn’t gone.' &&
    f.mobileValue === shown &&
    f.textButton === false &&
    f.save === 'Save',
  /** A grey's pop-up: its status, its one sentence, its link (or none), no "Bringing nothing.". */
  C_POPUP: (f: any, status: string, line: string, link: { text: string; href: string } | null) =>
    !!f &&
    f.open === true &&
    f.status === status &&
    f.notes.length === 1 &&
    f.notes[0] === line &&
    (link === null
      ? f.links.length === 0
      : f.links.length === 1 && f.links[0].text === link.text && f.links[0].href === link.href),
  /** A grey strip as a reading door with the arrow. */
  C_ARROW: (f: any) => !!f && f.tag === 'BUTTON' && f.reading === true && f.chevron === true,
  /** Part 3 names: which are buttons, with their spoken label, and which stay plain. */
  C_NAMES: (f: any, tappable: string[], plain: string[]) =>
    !!f &&
    tappable.every(
      (n) => f.buttons.includes(n) && f.labels[n] === `${n}: add an email or mobile`
    ) &&
    plain.every((n) => f.plain.includes(n) && !f.buttons.includes(n)),
  /** An open fold: its lead line and which boxes it has. */
  C_FOLD: (f: any, lead: string, mobile: boolean, email: string, mobileValue: string) =>
    !!f &&
    f.lead === lead &&
    f.email === true &&
    f.mobile === mobile &&
    f.emailValue === email &&
    (mobile ? f.mobileValue === mobileValue : true) &&
    f.save === 'Save',
  /** After a pre-flight save: the line, and the person (and their carried child) out of part 3. */
  C_MOVED: (f: any, saved: string, gone: string[], before: number, after: number) =>
    !!f &&
    f.part3.includes(saved) &&
    gone.every((n) => !f.groupA.includes(n)) &&
    after === before + 1,
  /** [[GTC-387]] Q21 ("Keep showing it") — the reopened door still shows the composed message. */
  C_MESSAGE: (f: any, item: string) =>
    !!f && typeof f.message === 'string' && f.message.length > 0 && f.message.includes(item),
  /** [[GTC-387]] Q22 ("Drop it") — an open pop-up with no "Bringing nothing." line. */
  C_NO_NOTHING: (pf: any) => !!pf && pf.open === true && pf.empty === false,
  /** Nothing scrolls sideways at a width. */
  C_FITS: (scrollWidth: number, width: number) => scrollWidth > 0 && scrollWidth <= width + 1,
};
// ── END CHECKS ──

// ─── Layers W, P, S: in memory ────────────────────────────────────────────────

async function runInMemory() {
  const BOX = await load('../src/lib/contact/contact-box');
  const DOOR = await load('../src/lib/press/resend-door');
  const ACT = await load('../src/lib/glance/actions');
  const RD = await load('../src/components/glance/reading');
  const SP = await load('../src/components/glance/strip');
  const HH = await load('../src/lib/events/home-href');
  const words = BOX?.CONTACT_BOX_WORDS ?? {};
  const refusals = DOOR?.RESEND_REFUSAL_WORDS ?? {};
  const routeWords = BOX?.CONTACT_REFUSAL_WORDS ?? {};

  // ── W: every ruled line, byte for byte ──
  const got: Record<number, unknown> = {
    1: words.email,
    2: words.mobile,
    3: words.mobileHint,
    4: words.save,
    5: words.saving,
    6: DOOR?.DOOR_WORDS?.UNREACHABLE?.EDIT,
    7: ACT && ACT.SAVED_AND_SENDING ? `${ACT.SAVED_AND_SENDING} ${ACT.CATCH_UP_NOTE}` : undefined,
    8: words.close,
    9: words.noMobile,
    10: words.leadBoth,
    11: words.leadEmail,
    14: refusals.NOTHING_TO_SAVE,
    15: refusals.EMAIL_UNREADABLE,
    16: refusals.EMAIL_OPTED_OUT,
    17: refusals.MOBILE_UNREADABLE,
    18: refusals.ADDRESS_BLOCKED,
    19: refusals.PHONE_OPTED_OUT,
    20: refusals.PHONE_UNUSABLE,
    21: refusals.TEXTING_UNAVAILABLE,
    22: words.nothingSaved,
    23: routeWords.INVITATIONS_GONE,
    24: routeWords.NOT_FOR_THEM,
    25: RD?.CHILD_NO_JOB_STATUS,
    26: RD?.GREY_NOTES?.CHILD_WITHOUT_ITEM,
    27: RD?.GIVE_JOB_DOOR,
    28: ok(() => typeof RD.readingStatusWord('NOT_CHASED', ['DONT_CHASE']) === 'string')
      ? RD.readingStatusWord('NOT_CHASED', ['DONT_CHASE'])
      : undefined,
    29: RD?.GREY_NOTES?.DONT_CHASE,
    30: undefined,
    31: ok(() => typeof RD.readingStatusWord('OUT', ['ATTENDANCE_NO']) === 'string')
      ? RD.readingStatusWord('OUT', ['ATTENDANCE_NO'])
      : undefined,
    32: RD?.GREY_NOTES?.OUT,
    33: words.savedNoText,
    34: words.mobileHeld,
  };
  // W30 is the pop-up's door label, read off a don't-nudge panel (P3 pins the rest of it).
  const marked = {
    personId: 'p-gus',
    personEventId: 'pe-gus',
    name: 'Gus Hale',
    state: 'NOT_CHASED',
    reasons: ['DONT_CHASE'],
    items: [],
    replies: [],
    chaseNote: null,
    emailNote: null,
    nextNudgeAt: null,
  };
  got[30] = ok(
    () => !!RD.readingPanelFor(marked, new Date(), { eventId: 'e1', invitesOnly: false }).door
  )
    ? RD.readingPanelFor(marked, new Date(), { eventId: 'e1', invitesOnly: false }).door.label
    : undefined;
  for (const n of Object.keys(W).map(Number)) {
    assert('W', `W${n} byte for byte: ${W[n]}`, got[n] === W[n], JSON.stringify(got[n]));
  }
  assert(
    'W',
    'W12 and W13, with the name in place',
    ok(
      () =>
        BOX.savedPreflightLine('Mere Tane') === W12('Mere Tane') &&
        BOX.nameLabel('Mere Tane') === W13('Mere Tane')
    )
  );
  assert(
    'W',
    'Q1: the door’s old "Gather can’t email" sentence is gone from the refusals',
    ok(
      () =>
        !Object.values(refusals).includes(OLD_ADDRESS_BLOCKED) && refusals.ADDRESS_BLOCKED === W[18]
    )
  );
  assert(
    'W',
    'the route’s refusal words reuse the door’s sentences, one spelling each (W14 to W20)',
    ok(() =>
      [
        'NOTHING_TO_SAVE',
        'EMAIL_UNREADABLE',
        'EMAIL_OPTED_OUT',
        'MOBILE_UNREADABLE',
        'ADDRESS_BLOCKED',
        'PHONE_OPTED_OUT',
        'PHONE_UNUSABLE',
      ].every((k) => typeof routeWords[k] === 'string' && routeWords[k] === refusals[k])
    )
  );
  assert(
    'W',
    'W22 follows every refusal but "nothing changed" (Q3): boxRefusalLine',
    ok(
      () =>
        BOX.boxRefusalLine('MOBILE_UNREADABLE', W[17]) === `${W[17]} ${W[22]}` &&
        BOX.boxRefusalLine('NOTHING_TO_SAVE', W[14]) === W[14]
    )
  );

  // ── P: the offer table, the panels and the hrefs ──
  const both = { email: true, mobile: true };
  const emailOnly = { email: true, mobile: false };
  const table: Array<[string, any]> = [
    ['NO_CHANNEL', both],
    ['PHONE_UNUSABLE', both],
    ['EMAIL_BLOCKED', both],
    ['SMS_OPTED_OUT', emailOnly],
    ['EMAIL_BLOCKED_SMS_OPTED_OUT', emailOnly],
    ['EMAIL_OPTED_OUT', null],
    ['EMAIL_REPORTED', null],
    ['EMAIL_REPORTED_SMS_OPTED_OUT', null],
    ['HOST_HOUSEHOLD_CHILD', null],
    ['NO_CARRIER', null],
    ['HOUSEHOLD_MUTED', null],
  ];
  for (const [why, want] of table) {
    assert(
      'P',
      `P1 the offer for an adult whose reason is ${why}: ${want === null ? 'plain text' : want.mobile ? 'email and mobile' : 'email only'}`,
      ok(() => JSON.stringify(BOX.contactFixOffer(why)) === JSON.stringify(want)),
      ok(() => true) ? JSON.stringify(BOX?.contactFixOffer?.(why)) : ''
    );
  }
  assert(
    'P',
    'P2 a child’s line is never tappable, whatever the reason (Q10; the grown-up’s line is)',
    ok(
      () =>
        BOX.contactLineOffer({ why: 'NO_CHANNEL', child: true }) === null &&
        BOX.contactLineOffer({ why: 'NO_CARRIER', child: true }) === null &&
        JSON.stringify(BOX.contactLineOffer({ why: 'NO_CHANNEL', child: false })) ===
          JSON.stringify(both)
    )
  );
  const person = (name: string, state: string, reasons: string[], items: any[] = []) => ({
    personId: `p-${name}`,
    personEventId: `pe-${name}`,
    name,
    state,
    reasons,
    items,
    replies: [],
    chaseNote: null,
    emailNote: null,
    nextNudgeAt: null,
  });
  const place = { eventId: 'e1', invitesOnly: false };
  const panel = (p: any, pl: any = place) => RD.readingPanelFor(p, new Date(), pl);
  assert(
    'P',
    'P3 a child holding nothing: "No job yet", W26, and "Give them a job" to Moment 3 with the child picked (Q12)',
    ok(() => {
      const x = panel(person('Pip', 'NOT_CHASED', ['CHILD_WITHOUT_ITEM']));
      return (
        x.status === W[25] &&
        JSON.stringify(x.notes) === JSON.stringify([W[26]]) &&
        x.door?.label === W[27] &&
        x.door?.href === '/plan/e1/setup?person=p-Pip'
      );
    })
  );
  assert(
    'P',
    'P4 on an invites-only event the child’s pop-up has no button (Q13)',
    ok(() => {
      const x = panel(person('Pip', 'NOT_CHASED', ['CHILD_WITHOUT_ITEM']), {
        eventId: 'e1',
        invitesOnly: true,
      });
      return x.status === W[25] && x.notes[0] === W[26] && x.door === null;
    })
  );
  assert(
    'P',
    'P5 the don’t-nudge mark: R6’s status, W29, and "Change who I nudge" to the pre-flight (Q14)',
    ok(() => {
      const x = panel(person('Gus', 'NOT_CHASED', ['DONT_CHASE']));
      return (
        x.status === W[28] &&
        JSON.stringify(x.notes) === JSON.stringify([W[29]]) &&
        x.door?.label === W[30] &&
        x.door?.href === '/plan/e1/pre-flight'
      );
    })
  );
  assert(
    'P',
    'P6 not coming: "Not coming", W32, no button',
    ok(() => {
      const x = panel(person('Ruth', 'OUT', ['ATTENDANCE_NO']));
      return (
        x.status === W[31] && JSON.stringify(x.notes) === JSON.stringify([W[32]]) && x.door === null
      );
    })
  );
  assert(
    'P',
    'P7 CONTROL: green, amber and a GTC-305 grey carry no door and no new sentence',
    ok(() => {
      const g = panel(person('Tom', 'GREEN', ['ACCEPTED']));
      const a = panel(person('Tom', 'AMBER', ['AWAITING_REPLY']));
      const h = panel(person('Hana', 'NOT_CHASED', ['HANDED_TO_HOST']));
      return (
        g.door === null &&
        a.door === null &&
        h.door === null &&
        g.notes.length === 0 &&
        a.notes.length === 0 &&
        !h.notes.some((n: string) => [W[26], W[29], W[32]].includes(n))
      );
    })
  );
  assert(
    'P',
    'P8 the three greys open the reading room and wear the arrow; a grey with no ruled reason still seals (Q11)',
    ok(() => {
      const p = (state: string, reasons: string[]) => ({ state, reasons });
      return (
        [
          p('NOT_CHASED', ['CHILD_WITHOUT_ITEM']),
          p('NOT_CHASED', ['DONT_CHASE']),
          p('OUT', ['ATTENDANCE_NO']),
        ].every((x) => SP.panelFor(x) === 'reading' && SP.doorTreatmentFor(x) !== '') &&
        SP.panelFor(p('NOT_CHASED', [])) === null &&
        !SP.doorTreatmentFor(p('OUT', ['ATTENDANCE_NO'])).includes(SP.DOOR_BORDER_CLASS)
      );
    })
  );
  assert(
    'P',
    'P9 Moment 3’s door to one person: ?person=, read like the search’s ?item=',
    ok(
      () =>
        HH.PERSON_PARAM === 'person' &&
        HH.personDoorHref('e1', 'p 1') === '/plan/e1/setup?person=p%201' &&
        HH.ITEM_PARAM === 'item'
    )
  );

  // ── S: fences ──
  const clientFiles = [
    ...filesUnder('src/components'),
    ...filesUnder('src/app').filter((f) => /page\.tsx$/.test(f)),
    ...filesUnder('src/lib').filter((f) => /^\s*['"]use client['"]/.test(read(f))),
    ACTIONS,
    CONTACT_BOX,
  ];
  const fix = codeOnly(read(CONTACT_FIX));
  const box = codeOnly(read(CONTACT_BOX));
  assert(
    'S',
    'S1 no client file imports the contact server module (it reaches the database)',
    fix.length > 0 &&
      clientFiles.length > 50 &&
      !clientFiles.some((f) => /@\/lib\/contact\/contact-fix/.test(read(f)))
  );
  assert(
    'S',
    'S2 one place decides who may be texted: the box asks the chooser and spells no rule of its own',
    fix.length > 0 &&
      /chooseAskRoute\(/.test(fix) &&
      /textAskReachOf\(/.test(fix) &&
      /smsOptedOutFact\(/.test(fix) &&
      /normalizePhoneNumber\(/.test(fix) &&
      !/isValidNZNumber|resolveChaseWhenNoMobile|isSmsEnabled\(|sendSms\(|smsOptOut\.(create|update|upsert|delete)/.test(
        fix
      )
  );
  assert(
    'S',
    'S3 its writes are on the transaction it is handed, with the ledger line beside them',
    fix.length > 0 &&
      /tx\.person\.update\(/.test(fix) &&
      /recordChange\(tx,/.test(fix) &&
      /EDIT_PERSON_CONTACT/.test(fix) &&
      !/from '@\/lib\/prisma'/.test(fix)
  );
  assert(
    'S',
    'S4 the door’s opt-out reading moved, not copied: one definition, in the contact module',
    ok(() => {
      const resend = codeOnly(read(RESEND));
      return (
        resend.length > 0 &&
        !/async function optedOut\(/.test(resend) &&
        /from '@\/lib\/contact\/contact-fix'/.test(resend) &&
        /export async function optedOutOf\(/.test(fix)
      );
    })
  );
  assert(
    'S',
    'S5 the board still reaches one door: saveContact posts to doorPath(), no new /api/ literal',
    ok(() => {
      const src = codeOnly(read(ACTIONS));
      const body = /export async function saveContact[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
      return (
        body.length > 0 &&
        /doorPath\(eventId, personId\)/.test(body) &&
        !/\/api\//.test(body) &&
        (src.match(/`\/api\//g) ?? []).length === 4
      );
    })
  );
  assert(
    'S',
    'S6 the words module is client-safe: type-only imports from server modules, no database',
    box.length > 0 &&
      !/@\/lib\/prisma|@prisma\/client|contact-fix|@\/lib\/sms|@\/lib\/email'/.test(box)
  );
  assert(
    'S',
    'S7 the pre-flight’s channel route: the same guard, first; the second shape goes to the contact module',
    ok(() => {
      const src = codeOnly(read(CHANNEL_ROUTE));
      const g = src.indexOf("requireEventRole(eventId, ['HOST', 'COHOST'])");
      const s = src.indexOf('saveContactBeforePress(');
      return g > 0 && s > g && /CONTACT_REFUSAL_WORDS\[/.test(src) && !/I can’t|There’s/.test(src);
    })
  );
  assert(
    'S',
    'S8 Moment 3 picks the child: the setup page reads ?person= in the one arrival block, Moment 3 takes arriveAtPerson',
    ok(() => {
      const page = codeOnly(read(SETUP_PAGE));
      const m3 = codeOnly(read(M3));
      return (
        (page.match(/\.get\(PERSON_PARAM\)/g) ?? []).length === 1 &&
        (page.match(/window\.history\.replaceState/g) ?? []).length === 1 &&
        /arriveAtPerson=/.test(page) &&
        /arriveAtPerson/.test(m3) &&
        !/useSearchParams/.test(page)
      );
    })
  );
  assert(
    'S',
    'S9 no box word says remind or chase (batch9 F2’s word fence, extended to the new module)',
    box.length > 0 && !/\b(remind|chase)/i.test(box.replace(/import[^;]+;/g, ''))
  );
  const newApi = git(['status', '--porcelain', '--', 'src/app/api'])
    .stdout.split('\n')
    .filter((l) => l.startsWith('??'));
  assert(
    'S',
    'S10 CONTROL: no new route; schema, migrations, the route list, the security suite, Zone 4, the AI, the chooser and the opt-out modules untouched',
    newApi.length === 0 &&
      unchanged('prisma') &&
      unchanged('route-classifications.json') &&
      unchanged('src/app/api/billing') &&
      unchanged('src/lib/ai') &&
      unchanged('src/lib/eligibility/channel-chooser.ts') &&
      unchanged('src/lib/sms/opt-out-service.ts') &&
      unchanged('src/lib/eligibility/email-opt-out.ts') &&
      unchanged('src/lib/eligibility/email-block.ts') &&
      filesUnder('tests')
        .filter((f) => /^tests\/security-/.test(f))
        .every(unchanged),
    newApi.join(',')
  );
}

// ─── Layers B and F: the door and the pre-flight shape, in process ─────────────

const created = {
  events: [] as string[],
  people: [] as string[],
  users: [] as string[],
  textBlocks: [] as string[],
};

async function runInProcess() {
  const R = await load('../src/lib/press/resend');
  const FIX = await load('../src/lib/contact/contact-fix');
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc387-${l}-${stamp}@example.com`;
  const digits = String(Math.floor(1000 + Math.random() * 8999));
  const num = (n: number) => `021 7${n}${digits.slice(0, 2)} ${digits.slice(2)}${n}`.slice(0, 13);
  const e164 = (local: string) => `+64${local.replace(/\s/g, '').slice(1)}`;
  const HOUR = 3600e3;
  const user = await prisma.user.create({ data: { email: mail('host') } });
  created.users.push(user.id);
  const host = await prisma.person.create({
    data: { name: 'Kate B17', email: user.email, userId: user.id },
  });
  created.people.push(host.id);
  const actor = { id: host.id, kind: 'HOST', name: host.name };

  const mkEvent = async (label: string, sent: boolean) => {
    const sentAt = sent ? new Date(Date.now() - 2 * HOUR) : null;
    const ev = await prisma.event.create({
      data: {
        name: `GTC-387 batch17 ${label}`,
        startDate: new Date(Date.now() + 200 * HOUR),
        endDate: new Date(Date.now() + 200 * HOUR),
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    created.events.push(ev.id);
    await prisma.personEvent.create({ data: { personId: host.id, eventId: ev.id, role: 'HOST' } });
    const team = await prisma.team.create({ data: { eventId: ev.id, name: 'Mains' } });
    return { ev, team, sentAt };
  };
  const { ev, team, sentAt } = await mkEvent('door', true);
  const hh = await prisma.household.create({ data: { eventId: ev.id } });
  const member = async (
    name: string,
    o: {
      email?: string | null;
      phone?: string | null;
      optedOut?: boolean;
      role?: string;
      withheld?: string;
      rejected?: boolean;
    } = {}
  ) => {
    const p = await prisma.person.create({
      data: {
        name: `${name} B17`,
        email: o.email === undefined ? null : o.email,
        phoneNumber: o.phone ?? null,
        smsOptedOut: o.optedOut ?? false,
      },
    });
    created.people.push(p.id);
    const pe = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId: ev.id,
        role: 'PARTICIPANT',
        householdId: hh.id,
        householdRole: (o.role ?? 'GUEST') as any,
      },
    });
    const it = await prisma.item.create({
      data: { teamId: team.id, name: `${name}'s dish`, kind: 'ITEM' },
    });
    await prisma.assignment.create({
      data: { itemId: it.id, personId: p.id, response: 'PENDING' },
    });
    if ((o.role ?? 'GUEST') !== 'CHILD') {
      await prisma.accessToken.create({
        data: {
          token: `b17-${name}-${stamp}`,
          scope: 'PARTICIPANT',
          eventId: ev.id,
          personId: p.id,
        },
      });
      await prisma.outboundMessage.create({
        data: {
          eventId: ev.id,
          personEventId: pe.id,
          kind: 'ASK',
          channel: 'EMAIL',
          ...(o.rejected
            ? {
                rejectedAt: sentAt,
                attemptedAt: sentAt,
                attemptCount: 1,
                provider: 'resend',
                providerError: 'x',
              }
            : { withheldAt: sentAt, withheldWhy: (o.withheld ?? 'NO_CHANNEL') as any }),
        },
      });
    }
    return { p, pe };
  };
  const rows = (pe: string) =>
    prisma.outboundMessage.findMany({
      where: { personEventId: pe },
      orderBy: { createdAt: 'asc' },
    });
  const ledger = (pe: string) =>
    prisma.auditEntry.findMany({
      where: { eventId: ev.id, targetId: pe, actionType: 'EDIT_PERSON_CONTACT' },
    });
  const on = { textingConfiguredFor: () => true };
  const off = { textingConfiguredFor: () => false };
  const press = (
    personId: string,
    email: string | null,
    mobile: string | null,
    deps: any,
    action = 'EDIT'
  ) =>
    R.resendToPerson(
      prisma,
      { eventId: ev.id, personId, baseUrl: BASE, actor, action, email, mobile },
      deps
    );

  const a = await member('Ana');
  const b = await member('Ben');
  const c = await member('Cal');
  const d = await member('Dee', { optedOut: true });
  const e = await member('Eve');
  const f = await member('Fay');
  const g = await member('Gil');
  const h = await member('Hal');
  const lena = await member('Lena', {
    phone: e164(num(5)),
    optedOut: true,
    withheld: 'SMS_OPTED_OUT',
  });
  const kid = await member('Kit', { role: 'CHILD' });
  const nd = await member('Ned', { email: mail('ned'), rejected: true });
  const dead = e164(num(6));
  const tb = await prisma.textBlock.create({ data: { phoneNumber: dead, reason: 'DEAD_CHANNEL' } });
  created.textBlocks.push(tb.id);

  // B1 — an email save on "nowhere to send": the email, one EMAIL invitation, one ledger line.
  const r1 = R ? await press(a.p.id, mail('ana'), null, off).catch(() => null) : null;
  const a1 = await rows(a.pe.id);
  const p1 = await prisma.person.findUnique({ where: { id: a.p.id } });
  assert(
    'B',
    'B1 email only: saved, ONE EMAIL invitation queued (never attempted), one ledger line, queued: true',
    !!r1 &&
      r1.ok === true &&
      r1.queued === true &&
      r1.channel === 'EMAIL' &&
      p1?.email === mail('ana') &&
      a1.length === 2 &&
      a1[1].channel === 'EMAIL' &&
      a1[1].attemptedAt === null &&
      a1[1].withheldAt === null &&
      (await ledger(a.pe.id)).length === 1,
    JSON.stringify(r1)
  );
  // B2 — a mobile save with texting live (the seam): one TEXT invitation.
  const r2 = R ? await press(b.p.id, null, num(2), on).catch(() => null) : null;
  const b2 = await rows(b.pe.id);
  const p2 = await prisma.person.findUnique({ where: { id: b.p.id } });
  const l2 = await ledger(b.pe.id);
  assert(
    'B',
    'B2 mobile only, texting live: the number stored E.164, ONE TEXT invitation, one ledger line on the mobile',
    !!r2 &&
      r2.ok === true &&
      r2.queued === true &&
      r2.channel === 'TEXT' &&
      p2?.phoneNumber === e164(num(2)) &&
      b2.length === 2 &&
      b2[1].channel === 'TEXT' &&
      l2.length === 1 &&
      l2[0].field === 'phoneNumber',
    JSON.stringify(r2)
  );
  // B3 — a mobile save with texting off (Q2 b): saved, ledger, NOTHING queued.
  const r3 = R ? await press(c.p.id, null, num(3), off).catch(() => null) : null;
  const c3 = await rows(c.pe.id);
  const p3 = await prisma.person.findUnique({ where: { id: c.p.id } });
  assert(
    'B',
    'B3 mobile only, texting off (Q2 b): the number saved, one ledger line, NO invitation, queued: false',
    !!r3 &&
      r3.ok === true &&
      r3.queued === false &&
      p3?.phoneNumber === e164(num(3)) &&
      c3.length === 1 &&
      (await ledger(c.pe.id)).length === 1,
    JSON.stringify(r3)
  );
  // B4 — the door reopened after B3, texting off then live (the existing PHONE action).
  const v4off = R
    ? await R.readDoor(prisma, { eventId: ev.id, personId: c.p.id, baseUrl: BASE }, off).catch(
        () => null
      )
    : null;
  const v4on = R
    ? await R.readDoor(prisma, { eventId: ev.id, personId: c.p.id, baseUrl: BASE }, on).catch(
        () => null
      )
    : null;
  assert(
    'B',
    'B4 reopened with texting off: still the "nowhere to send" door, the number shown, mobileHeld (W34), no "Send it as a text"',
    !!v4off &&
      v4off.ok === true &&
      v4off.view.reason === 'UNREACHABLE' &&
      String(v4off.view.mobile).replace(/\s/g, '') === num(3).replace(/\s/g, '') &&
      v4off.view.mobileHeld === true &&
      !v4off.view.actions.includes('PHONE'),
    JSON.stringify(v4off?.view)
  );
  const r4 = R && v4on?.ok ? await press(c.p.id, null, null, on, 'PHONE').catch(() => null) : null;
  assert(
    'B',
    'B5 once texting is live: the same door offers the existing PHONE action, not mobileHeld, and PHONE queues one TEXT',
    !!v4on &&
      v4on.ok === true &&
      v4on.view.actions.includes('PHONE') &&
      v4on.view.mobileHeld === false &&
      !!r4 &&
      r4.ok === true &&
      r4.channel === 'TEXT' &&
      (await rows(c.pe.id)).length === 2,
    JSON.stringify({ v: v4on?.view?.actions, r4 })
  );
  // B6 — a mobile for somebody who opted out (the flag, no number): refused, nothing written.
  const r6 = R ? await press(d.p.id, null, num(4), on).catch(() => null) : null;
  const p6 = await prisma.person.findUnique({ where: { id: d.p.id } });
  assert(
    'B',
    'B6 a mobile for a person who opted out of texts: PHONE_OPTED_OUT, and nothing saved, logged or queued',
    !!r6 &&
      r6.ok === false &&
      r6.code === 'PHONE_OPTED_OUT' &&
      p6?.phoneNumber === null &&
      (await ledger(d.pe.id)).length === 0 &&
      (await rows(d.pe.id)).length === 1,
    JSON.stringify(r6)
  );
  // B7 — both boxes with texting off: the email goes, the mobile is kept.
  const r7 = R ? await press(e.p.id, mail('eve'), num(7), off).catch(() => null) : null;
  const p7 = await prisma.person.findUnique({ where: { id: e.p.id } });
  const e7 = await rows(e.pe.id);
  assert(
    'B',
    'B7 both boxes, texting off: ONE EMAIL invitation, both saved, two ledger lines',
    !!r7 &&
      r7.ok === true &&
      r7.queued === true &&
      r7.channel === 'EMAIL' &&
      p7?.email === mail('eve') &&
      p7?.phoneNumber === e164(num(7)) &&
      e7.length === 2 &&
      e7[1].channel === 'EMAIL' &&
      (await ledger(e.pe.id)).length === 2,
    JSON.stringify(r7)
  );
  // B8 — both boxes, one refused (+61 cannot be read): nothing saved at all (Q3).
  const r8 = R ? await press(f.p.id, mail('fay'), '+61 412 345 678', on).catch(() => null) : null;
  const p8 = await prisma.person.findUnique({ where: { id: f.p.id } });
  assert(
    'B',
    'B8 both boxes, the mobile unreadable (+61): MOBILE_UNREADABLE, and the good email NOT saved either (Q3)',
    !!r8 &&
      r8.ok === false &&
      r8.code === 'MOBILE_UNREADABLE' &&
      r8.status === 400 &&
      p8?.email === null &&
      p8?.phoneNumber === null &&
      (await ledger(f.pe.id)).length === 0 &&
      (await rows(f.pe.id)).length === 1,
    JSON.stringify(r8)
  );
  const r9a = R ? await press(g.p.id, '', '', on).catch(() => null) : null;
  const r9b = R ? await press(g.p.id, 'not-an-address', null, on).catch(() => null) : null;
  const r9c = R ? await press(h.p.id, null, dead.replace('+64', '0'), on).catch(() => null) : null;
  assert(
    'B',
    'B9 nothing typed is NOTHING_TO_SAVE; an email with no @ is EMAIL_UNREADABLE; a number TNZ reported dead is PHONE_UNUSABLE',
    !!r9a &&
      r9a.code === 'NOTHING_TO_SAVE' &&
      !!r9b &&
      r9b.code === 'EMAIL_UNREADABLE' &&
      !!r9c &&
      r9c.code === 'PHONE_UNUSABLE' &&
      (await ledger(g.pe.id)).length === 0 &&
      (await ledger(h.pe.id)).length === 0,
    JSON.stringify({ r9a, r9b, r9c })
  );
  const v10 = R
    ? await R.readDoor(prisma, { eventId: ev.id, personId: lena.p.id, baseUrl: BASE }, on).catch(
        () => null
      )
    : null;
  const r10 = R ? await press(lena.p.id, null, num(8), on).catch(() => null) : null;
  assert(
    'B',
    'B10 opted out of texts (SMS_OPTED_OUT red): the door offers the email box only (Q4), and a mobile is refused',
    !!v10 &&
      v10.ok === true &&
      v10.view.offer?.email === true &&
      v10.view.offer?.mobile === false &&
      !!r10 &&
      r10.code === 'PHONE_OPTED_OUT',
    JSON.stringify({ o: v10?.view?.offer, r10 })
  );
  const r11 = R ? await press(kid.p.id, mail('kit'), null, on).catch(() => null) : null;
  const r12 = R ? await press(nd.p.id, 'x', null, on).catch(() => null) : null;
  assert(
    'B',
    'B11 CONTROLS: a child is refused as a child first; the NOT_DELIVERED door’s EDIT is unchanged (ADDRESS_REQUIRED)',
    !!r11 && r11.code === 'CHILD_NOT_MESSAGED' && !!r12 && r12.code === 'ADDRESS_REQUIRED',
    JSON.stringify({ r11, r12 })
  );

  // ── F: the pre-flight's second shape, in process ──
  const pre = await mkEvent('pre-flight', false);
  const ph = await prisma.household.create({ data: { eventId: pre.ev.id } });
  const pm = async (
    name: string,
    o: { phone?: string; optedOut?: boolean; role?: string } = {}
  ) => {
    const p = await prisma.person.create({
      data: { name: `${name} B17`, phoneNumber: o.phone ?? null, smsOptedOut: o.optedOut ?? false },
    });
    created.people.push(p.id);
    const pe = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId: pre.ev.id,
        role: 'PARTICIPANT',
        householdId: ph.id,
        householdRole: (o.role ?? 'GUEST') as any,
      },
    });
    return { p, pe };
  };
  const mo = await pm('Mo');
  const lo = await pm('Lo', { phone: e164(num(9)), optedOut: true });
  const ki = await pm('Ki', { role: 'CHILD' });
  const hostPe = await prisma.personEvent.findFirst({
    where: { eventId: pre.ev.id, personId: host.id },
  });
  const save = (
    eventId: string,
    personEventId: string,
    email: string | null,
    mobile: string | null
  ) => FIX.saveContactBeforePress(prisma, { eventId, personEventId, email, mobile, actor });
  const f1 = FIX ? await save(pre.ev.id, mo.pe.id, mail('mo'), null).catch(() => null) : null;
  const mo1 = await prisma.person.findUnique({ where: { id: mo.p.id } });
  assert(
    'F',
    'F1 a pre-flight save stores the email, writes one ledger line, and queues nothing (Q9)',
    !!f1 &&
      f1.ok === true &&
      mo1?.email === mail('mo') &&
      (await prisma.auditEntry.count({
        where: { eventId: pre.ev.id, targetId: mo.pe.id, actionType: 'EDIT_PERSON_CONTACT' },
      })) === 1 &&
      (await prisma.outboundMessage.count({ where: { eventId: pre.ev.id } })) === 0,
    JSON.stringify(f1)
  );
  const f2 = FIX ? await save(pre.ev.id, lo.pe.id, null, num(1)).catch(() => null) : null;
  const f3 = FIX ? await save(pre.ev.id, ki.pe.id, mail('ki'), null).catch(() => null) : null;
  const f4 =
    FIX && hostPe ? await save(pre.ev.id, hostPe.id, mail('k2'), null).catch(() => null) : null;
  const f5 = FIX ? await save(ev.id, a.pe.id, mail('ana2'), null).catch(() => null) : null;
  assert(
    'F',
    'F2 refusals: a mobile for the opted-out is PHONE_OPTED_OUT; a child and the host NOT_FOR_THEM; after the press INVITATIONS_GONE',
    !!f2 &&
      f2.code === 'PHONE_OPTED_OUT' &&
      !!f3 &&
      f3.code === 'NOT_FOR_THEM' &&
      !!f4 &&
      f4.code === 'NOT_FOR_THEM' &&
      !!f5 &&
      f5.code === 'INVITATIONS_GONE' &&
      (await prisma.person.findUnique({ where: { id: lo.p.id } }))?.phoneNumber === e164(num(9)),
    JSON.stringify({ f2, f3, f4, f5 })
  );
  const noCookie = await realFetch(`${BASE}/api/events/${pre.ev.id}/pre-flight/channel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personEventId: mo.pe.id, email: mail('x') }),
  })
    .then((r) => r.status)
    .catch(() => 0);
  assert(
    'F',
    'F3 LIVE: the channel route refuses a call with no session (401) — the guard is unchanged',
    noCookie === 401,
    `status ${noCookie}`
  );
  assert(
    'F',
    'F4 NOTHING LEFT THE PROCESS (the provider trap counted no request)',
    trapCount() === 0,
    `trap ${trapCount()}`
  );
}

// ─── Layer C: in the browser ──────────────────────────────────────────────────

const AI_RE =
  /finalize-plan|regenerate-plan|\/generate(\?|$)|\/regenerate(\?|$)|suggest-resolution/;

/** A headless Chrome with this suite's own wall (see the header). */
async function openWalled(allow: (method: string, url: string) => boolean) {
  const profile = mkdtempSync(join(tmpdir(), 'gtc387-b17-'));
  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost',
      '--no-first-run',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let targets: any[] = [];
  for (let i = 0; i < 75 && targets.length === 0; i++) {
    try {
      targets = await (await realFetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    } catch {
      await sleep(200);
    }
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    chrome.kill();
    throw new Error('headless Chrome did not start');
  }
  const ws = new (globalThis as any).WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map<number, (m: any) => void>();
  const failedReq: string[] = [];
  const allowedReq: string[] = [];
  const dialogs: string[] = [];
  const send = (method: string, params: any = {}) =>
    new Promise<any>((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  ws.addEventListener('message', (e: any) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
    if (m.method === 'Fetch.requestPaused') {
      const { method, url } = m.params.request;
      const go = (method === 'GET' && !AI_RE.test(url)) || allow(method, url);
      if (method !== 'GET') (go ? allowedReq : failedReq).push(`${method} ${url}`);
      else if (!go) failedReq.push(`${method} ${url}`);
      ws.send(
        JSON.stringify({
          id: ++id,
          method: go ? 'Fetch.continueRequest' : 'Fetch.failRequest',
          params: go
            ? { requestId: m.params.requestId }
            : { requestId: m.params.requestId, errorReason: 'BlockedByClient' },
        })
      );
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      dialogs.push(m.params.type);
      ws.send(
        JSON.stringify({
          id: ++id,
          method: 'Page.handleJavaScriptDialog',
          params: { accept: m.params.type === 'beforeunload' },
        })
      );
    }
  });
  await send('Page.enable');
  await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const ev = async <T = any,>(expression: string): Promise<T> =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
      ?.result?.value as T;
  const refusals: string[] = [];
  return {
    ev,
    failedReq,
    allowedReq,
    dialogs,
    refusals,
    async viewport(width: number, height: number, mobile: boolean) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
    },
    async cookie(token: string) {
      await send('Network.setCookie', {
        name: 'session',
        value: token,
        domain: 'localhost',
        path: '/',
      });
    },
    async navigate(path: string, settle = 6000) {
      await send('Page.navigate', { url: `${BASE}${path}` });
      await sleep(settle);
    },
    /** Scrolled to mid-screen and hit-tested; a press, send, hold or generate is refused by its words
     * (a strip is a door to a panel, so its own words are not read). */
    async tap(selector: string, settle = 600) {
      const at =
        await ev<any>(`(() => { const t = document.querySelector(${JSON.stringify(selector)}); if (!t) return { why: 'no target' };
        const strip = t.hasAttribute('data-strip-door') || t.hasAttribute('data-strip-reading');
        if (!strip && /\\b(generate|regenerate|new event|hold|send|press|move on)\\b/i.test(t.innerText || '')) return { why: 'refused by its words' };
        t.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = t.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return hit && t.contains(hit) ? { x, y } : { why: 'the point is not inside the target' }; })()`);
      if (!at || at.why) {
        refusals.push(`${selector}: ${at?.why}`);
        return at?.why ?? 'no answer';
      }
      for (const type of ['mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', {
          type,
          x: at.x,
          y: at.y,
          button: 'left',
          clickCount: 1,
        });
      await sleep(settle);
      return null;
    },
    async type(text: string) {
      await send('Input.insertText', { text });
      await sleep(250);
    },
    async shot(file: string) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
      chrome.kill();
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // the profile is in the OS temp directory
      }
    },
  };
}

/** The open board panel's box, as facts — the panel of ONE named person, never whichever is open. */
const BOX_FACTS = (
  personId: string
) => `(() => { const d = document.querySelector(${JSON.stringify(`[role="dialog"][data-person-surface="${personId}"]`)}); if (!d) return null;
  const door = d.querySelector('[data-bounce-door]'); if (!door) return null;
  const t = (s) => door.querySelector(s)?.textContent?.trim() ?? null;
  const em = door.querySelector('[data-contact-email]'); const mo = door.querySelector('[data-contact-mobile]');
  const save = door.querySelector('[data-contact-save]'); const out = d.querySelector('[data-action-outcome]');
  return { heading: t('[data-contact-heading]'), emailLabel: t('[data-contact-email-label]'), mobileLabel: t('[data-contact-mobile-label]'),
    email: !!em, mobile: !!mo, hint: mo ? mo.getAttribute('placeholder') : null, save: save ? save.textContent.trim() : null,
    sendTo: !!door.querySelector('[data-door-address]'), mobileValue: mo ? mo.value : null, readOnly: !!(em && em.readOnly),
    outcome: out ? out.textContent.trim() : null, failed: out ? out.getAttribute('data-action-outcome') === 'failed' : null,
    held: t('[data-contact-held]'), noMobile: t('[data-contact-no-mobile]'),
    message: door.querySelector('.whitespace-pre-wrap')?.textContent?.trim() ?? null,
    textButton: [...door.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Send it as a text') }; })()`;
/** The open reading pop-up, as facts. */
const POPUP_FACTS = `(() => { const d = [...document.querySelectorAll('[role="dialog"][data-reading-panel]')].find((x) => x.checkVisibility()); if (!d) return { open: false };
  return { open: true, status: d.querySelector('[data-reading-status]')?.textContent.trim() ?? null,
    notes: [...d.querySelectorAll('[data-reading-note]')].map((n) => n.textContent.trim()),
    links: [...d.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
    empty: d.textContent.includes('Bringing nothing.') }; })()`;
const STRIP_FACTS = (
  pe: string
) => `(() => { const s = document.querySelector('[data-person-event-id="${pe}"]'); if (!s) return null;
  return { tag: s.tagName, reading: s.hasAttribute('data-strip-reading'), chevron: !!s.querySelector('[data-strip-chevron]'), state: s.getAttribute('data-strip-state'), text: s.textContent.trim() }; })()`;
const PART3 = `(() => { const s = document.querySelector('#step-4 section[data-message-part="3"]'); if (!s) return null;
  const a = s.querySelector('[data-host-list-a]');
  const buttons = a ? [...a.querySelectorAll('button[data-contact-name]')] : [];
  const labels = {}; for (const b of buttons) labels[b.textContent.trim()] = b.getAttribute('aria-label');
  const plain = a ? [...a.querySelectorAll('li > span:first-child')].map((x) => x.textContent.trim()) : [];
  return { part3: s.textContent, groupA: a ? a.textContent : '', buttons: buttons.map((b) => b.textContent.trim()), labels, plain }; })()`;
const FOLD = (
  pe: string
) => `(() => { const f = document.querySelector(${JSON.stringify(`li:has(> button[data-contact-name="${pe}"]) [data-contact-fold]`)}); if (!f) return null;
  const em = f.querySelector('[data-contact-email]'); const mo = f.querySelector('[data-contact-mobile]');
  return { lead: f.querySelector('[data-contact-lead]')?.textContent.trim() ?? null, email: !!em, mobile: !!mo,
    emailValue: em ? em.value : null, mobileValue: mo ? mo.value : null, save: f.querySelector('[data-contact-save]')?.textContent.trim() ?? null }; })()`;
const MESSAGES = `(() => { const m = /(\\d+) messages? ·/.exec(document.querySelector('#step-4')?.textContent ?? ''); return m ? Number(m[1]) : -1; })()`;

// ── PANEL ── (the C layer's waits and targets; dry-run on an open, an empty and a stale panel)
// A fixed wait after a strip tap was shorter than the dev server's first build of the door route
// (1988 ms against 1800 at GREEN), and the next steps then typed into whichever box was open. So a
// step waits until the NAMED person's panel has drawn, and types only inside that panel.
/** The acting panel of one person, by the id it carries. */
const doorPanel = (personId: string) => `[role="dialog"][data-person-surface="${personId}"]`;
/** A control inside that person's panel — never whichever box is on the page. */
const inDoor = (personId: string, sel: string) => `${doorPanel(personId)} ${sel}`;
/** That person's door has drawn: its contact box, or the door's own refusal. */
const DOOR_DRAWN = (personId: string) =>
  `!!(document.querySelector(${JSON.stringify(inDoor(personId, '[data-bounce-door] [data-contact-box]'))}) || document.querySelector(${JSON.stringify(inDoor(personId, '[data-door-error]'))}))`;
/** That person's reading pop-up has drawn (it carries their name). */
const READING_DRAWN = (name: string) =>
  `[...document.querySelectorAll(${JSON.stringify(`[role="dialog"][data-reading-panel="${name}"]`)})].some((d) => d.checkVisibility())`;
/** A control in the fold under ONE name on the pre-flight. */
const inFold = (pe: string, sel: string) =>
  `li:has(> button[data-contact-name="${pe}"]) [data-contact-fold] ${sel}`;
/** Wait for a panel to draw, up to `ms`; a panel that never draws is reported, loudly. */
async function waitDrawn(
  ev: <T = any>(expression: string) => Promise<T>,
  expression: string,
  what: string,
  refusals: string[],
  ms = 10_000
): Promise<boolean> {
  for (let t = 0; t <= ms; t += 250) {
    if ((await ev<boolean>(expression)) === true) return true;
    await sleep(250);
  }
  refusals.push(`${what}: the panel never drew in ${ms / 1000} s`);
  console.error(`    ${what}: the panel never drew in ${ms / 1000} s`);
  return false;
}
// ── END PANEL ──

// K2's "before": the InviteEvent and OutboundMessage totals at the very start of the suite, before
// any fixture is made — the in-process layer writes and its rows stay until the one cleanup.
const totals = async () => ({
  invite: await prisma.inviteEvent.count(),
  outbound: await prisma.outboundMessage.count(),
});
let suiteStart: { invite: number; outbound: number } = { invite: -1, outbound: -1 };

async function runLive() {
  const up = await realFetch(`${BASE}/`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');
  const before = suiteStart;
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc387-c-${l}-${stamp}@example.com`;
  const digits = String(Math.floor(1000 + Math.random() * 8999));
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Look', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 4 * 3600e3) },
  });
  const HOUR = 3600e3;
  const ids: Record<string, string> = {};

  const mk = async (label: string, sent: boolean) => {
    const sentAt = sent ? new Date(Date.now() - 2 * HOUR) : null;
    const e = await prisma.event.create({
      data: {
        name: `GTC-387 — ${label}`,
        startDate: new Date(Date.now() + 240 * HOUR),
        endDate: new Date(Date.now() + 240 * HOUR),
        hostId: kate.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    created.events.push(e.id);
    await prisma.eventRole.create({ data: { eventId: e.id, userId: user.id, role: 'HOST' } });
    await prisma.eventSetup.create({
      data: {
        eventId: e.id,
        eventType: 'BBQ',
        planApprovedAt: new Date(Date.now() - 3 * HOUR),
      } as any,
    });
    const own = await prisma.household.create({ data: { eventId: e.id } });
    const kpe = await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId: e.id,
        role: 'HOST',
        householdId: own.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    await prisma.household.update({
      where: { id: own.id },
      data: { contactPersonEventId: kpe.id },
    });
    const team = await prisma.team.create({ data: { eventId: e.id, name: 'Mains' } });
    const add = async (
      name: string,
      o: {
        email?: boolean;
        phone?: string;
        optedOut?: boolean;
        child?: string;
        dish?: string;
        extra?: any;
        ask?: any;
      } = {}
    ) => {
      const p = await prisma.person.create({
        data: {
          name,
          email: o.email ? mail(name.split(' ')[0].toLowerCase()) : null,
          phoneNumber: o.phone ?? null,
          smsOptedOut: o.optedOut ?? false,
        },
      });
      created.people.push(p.id);
      const hh = o.child
        ? o.child
        : (await prisma.household.create({ data: { eventId: e.id } })).id;
      const pe = await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: e.id,
          role: 'PARTICIPANT',
          householdId: hh,
          householdRole: (o.child ? 'CHILD' : 'PRIMARY_CONTACT') as any,
          sentAt: o.ask?.acceptedAt ?? null,
          ...(o.extra ?? {}),
        },
      });
      if (!o.child)
        await prisma.household.update({ where: { id: hh }, data: { contactPersonEventId: pe.id } });
      if (o.dish) {
        const it = await prisma.item.create({
          data: { teamId: team.id, name: o.dish, kind: 'ITEM' },
        });
        await prisma.assignment.create({
          data: { itemId: it.id, personId: p.id, response: 'PENDING' },
        });
      }
      if (!o.child)
        await prisma.accessToken.create({
          data: {
            token: `b17c-${p.id}-${stamp}`,
            scope: 'PARTICIPANT',
            eventId: e.id,
            personId: p.id,
          },
        });
      if (o.ask)
        await prisma.outboundMessage.create({
          data: { eventId: e.id, personEventId: pe.id, kind: 'ASK', channel: 'EMAIL', ...o.ask },
        });
      ids[`${label}:${name}`] = pe.id;
      ids[`${label}:${name}:person`] = p.id;
      return { p, pe, hh };
    };
    return { e, add, sentAt };
  };

  const boards: Record<number, string> = {};
  const pres: Record<number, string> = {};
  for (const w of [1280, 390]) {
    const B = await mk(`board ${w}`, true);
    boards[w] = B.e.id;
    const held = { withheldAt: B.sentAt, withheldWhy: 'NO_CHANNEL' };
    const ok1 = {
      attemptedAt: B.sentAt,
      acceptedAt: B.sentAt,
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `b17c-${w}-${stamp}`,
    };
    await B.add('Mere Tane', { dish: 'Potato salad', ask: held });
    await B.add('Nina Rau', { dish: 'Bread rolls', ask: held });
    await B.add('Lena Ford', {
      phone: `+6421${w}${digits}`.slice(0, 13),
      optedOut: true,
      dish: 'Coleslaw',
      ask: { ...held, withheldWhy: 'SMS_OPTED_OUT' },
    });
    const tom = await B.add('Tom Reid', {
      email: true,
      dish: 'Sausages',
      ask: { ...ok1, providerMessageId: `b17c-t-${w}-${stamp}` },
    });
    await B.add('Pip Reid', { child: tom.hh });
    await B.add('Gus Hale', {
      email: true,
      dish: 'Pavlova',
      extra: { nudgeMark: 'DONT_CHASE' },
      ask: { ...ok1, providerMessageId: `b17c-g-${w}-${stamp}` },
    });
    await B.add('Ruth Moana', {
      email: true,
      extra: { attendanceAnswer: 'NO', attendanceAnsweredAt: new Date(Date.now() - HOUR) },
      ask: { ...ok1, providerMessageId: `b17c-r-${w}-${stamp}` },
    });
    const P = await mk(`pre ${w}`, false);
    pres[w] = P.e.id;
    const mere = await P.add('Mere Tane', { dish: 'Potato salad' });
    await P.add('Ana Tane', { child: mere.hh, dish: 'Fairy bread' });
    await P.add('Lena Ford', {
      phone: `+6422${w}${digits}`.slice(0, 13),
      optedOut: true,
      dish: 'Coleslaw',
    });
    await P.add('Raj Patel', { phone: '+447700900387', dish: 'Bread rolls' });
    await P.add('Tom Reid', { email: true, dish: 'Sausages' });
  }
  const evIn = { eventId: { in: created.events } };
  const fixtureRows = async () => ({
    people: await prisma.person.count({ where: { id: { in: created.people } } }),
    events: await prisma.event.count({ where: { id: { in: created.events } } }),
    queued: await prisma.outboundMessage.count({
      where: { ...evIn, withheldAt: null, attemptedAt: null },
    }),
    messages: await prisma.outboundMessage.count({ where: evIn }),
    ledger: await prisma.auditEntry.count({
      where: { ...evIn, actionType: 'EDIT_PERSON_CONTACT' },
    }),
    invite: await prisma.inviteEvent.count({ where: evIn }),
  });

  const allow = (method: string, url: string) =>
    (method === 'POST' &&
      Object.values(boards).some((b) =>
        new RegExp(`/api/events/${b}/people/[^/]+/resend$`).test(url)
      )) ||
    (method === 'PATCH' &&
      Object.values(pres).some((p) => url.endsWith(`/api/events/${p}/pre-flight/channel`)));

  let c: Awaited<ReturnType<typeof openWalled>> | null = null;
  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
  try {
    c = await openWalled(allow);
    const b = c;
    await b.navigate('/', 3000);
    const probes = await b.ev<string[]>(`Promise.all([
      fetch('/api/gtc387-probe', { method: 'POST' }).then(() => 'reached', () => 'failed'),
      fetch('/api/events/gtc387-probe/finalize-plan').then(() => 'reached', () => 'failed'),
      fetch('/api/events/gtc387-probe/send', { method: 'POST' }).then(() => 'reached', () => 'failed')])`);
    assert(
      'C',
      'C0 PRECONDITION: the wall proven: a POST probe, an AI route by GET and a send probe all fail in the browser',
      JSON.stringify(probes) === '["failed","failed","failed"]',
      JSON.stringify(probes)
    );
    if (JSON.stringify(probes) !== '["failed","failed","failed"]') return;
    await b.cookie(token);
    const shot = async (name: string) => {
      if (SHOTS) await b.shot(join(SHOT_DIR, name));
    };
    const fits = async (w: number) =>
      CHECKS.C_FITS(await b.ev<number>('document.documentElement.scrollWidth'), w);
    const clear = (sel: string) =>
      b.ev(
        `(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`
      );
    const typeInto = async (sel: string, text: string) => {
      await clear(sel);
      if (await b.tap(sel, 200)) return false;
      await b.type(text);
      return true;
    };
    const closePanel = () => b.tap('[role="dialog"] button[aria-label="Close"]', 400);
    /** A red strip: tap it, then wait until THAT person's door has drawn. */
    const openDoor = async (pe: string, personId: string) => {
      await b.tap(`[data-person-event-id="${pe}"]`, 300);
      return waitDrawn(b.ev, DOOR_DRAWN(personId), `[data-person-event-id="${pe}"]`, b.refusals);
    };
    /** A grey strip: tap it, then wait until THAT person's reading pop-up has drawn. */
    const openReading = async (pe: string, name: string) => {
      await b.tap(`[data-person-event-id="${pe}"]`, 300);
      return waitDrawn(b.ev, READING_DRAWN(name), `[data-person-event-id="${pe}"]`, b.refusals);
    };

    for (const [w, h, mobile] of [
      [1280, 900, false],
      [390, 844, true],
    ] as const) {
      await b.viewport(w, h, mobile);
      const board = boards[w];
      const id = (n: string) => ids[`board ${w}:${n}`];
      const pid = (n: string) => ids[`board ${w}:${n}:person`];
      const k = w === 390 ? 'p' : '';

      // ── item 69, the board's door ──
      await b.navigate(`/plan/${board}/glance`, 7000);
      const mere = pid('Mere Tane');
      await openDoor(id('Mere Tane'), mere);
      const f1 = await b.ev(BOX_FACTS(mere));
      r[`C1${k}`] = CHECKS.C_BOX(f1, true) && (await fits(w));
      detail[`C1${k}`] = JSON.stringify(f1);
      await shot(`69-box-empty-${w}.png`);
      await typeInto(inDoor(mere, '[data-contact-mobile]'), '0800 123');
      await b.tap(inDoor(mere, '[data-contact-save]'), 1500);
      const f2 = await b.ev(BOX_FACTS(mere));
      const mere2 = await prisma.person.findUnique({ where: { id: pid('Mere Tane') } });
      r[`C2${k}`] = CHECKS.C_REFUSED(f2, W[17], '0800 123') && mere2?.phoneNumber === null;
      detail[`C2${k}`] = JSON.stringify(f2);
      await shot(`69-box-refused-${w}.png`);
      await clear(inDoor(mere, '[data-contact-mobile]'));
      await typeInto(inDoor(mere, '[data-contact-email]'), mail(`mere${w}`));
      const q0 = (await fixtureRows()).queued;
      await b.tap(inDoor(mere, '[data-contact-save]'), 1800);
      const f3 = await b.ev(BOX_FACTS(mere));
      const q1 = (await fixtureRows()).queued;
      r[`C3${k}`] = CHECKS.C_SAVED(f3, W[7]) && q1 === q0 + 1;
      detail[`C3${k}`] = JSON.stringify({ f3, q0, q1 });
      await shot(`69-box-saved-email-${w}.png`);
      await b.tap(inDoor(mere, '[data-contact-save]'), 600);
      await sleep(4000);
      const s3 = await b.ev(STRIP_FACTS(id('Mere Tane')));
      r[`C4${k}`] =
        !(await b.ev<boolean>(
          `[...document.querySelectorAll('[role="dialog"]')].some((d) => d.checkVisibility())`
        )) && s3?.state === 'AMBER';
      detail[`C4${k}`] = JSON.stringify(s3);

      // the mobile-only save with texting off (the dev server is never live): W33, then W34
      const local = `021 6${String(w).slice(0, 2)} ${digits}`;
      const ninaId = pid('Nina Rau');
      await openDoor(id('Nina Rau'), ninaId);
      await typeInto(inDoor(ninaId, '[data-contact-mobile]'), local);
      const q2 = (await fixtureRows()).queued;
      await b.tap(inDoor(ninaId, '[data-contact-save]'), 1800);
      const f5 = await b.ev(BOX_FACTS(ninaId));
      const nina = await prisma.person.findUnique({ where: { id: pid('Nina Rau') } });
      r[`C5${k}`] =
        CHECKS.C_SAVED(f5, W[33]) && (await fixtureRows()).queued === q2 && !!nina?.phoneNumber;
      detail[`C5${k}`] = JSON.stringify({ f5, phone: !!nina?.phoneNumber });
      await shot(`69-box-saved-texting-off-${w}.png`);
      await b.tap(inDoor(ninaId, '[data-contact-save]'), 600);
      await b.navigate(`/plan/${board}/glance`, 7000);
      const s6 = await b.ev(STRIP_FACTS(id('Nina Rau')));
      await openDoor(id('Nina Rau'), ninaId);
      const f6 = await b.ev(BOX_FACTS(ninaId));
      r[`C6${k}`] =
        CHECKS.C_HELD(f6, local) && s6?.state === 'RED' && /nowhere to send/.test(s6?.text ?? '');
      r[`C14${k}`] = CHECKS.C_MESSAGE(f6, 'Bread rolls');
      detail[`C6${k}`] = JSON.stringify({ f6, s6 });
      await shot(`69-box-reopened-texting-off-${w}.png`);
      await closePanel();

      // opted out of texts: no mobile box, W9 in its place (Q4)
      await openDoor(id('Lena Ford'), pid('Lena Ford'));
      const f7 = await b.ev(BOX_FACTS(pid('Lena Ford')));
      r[`C7${k}`] = CHECKS.C_BOX(f7, false) && f7?.noMobile === W[9];
      detail[`C7${k}`] = JSON.stringify(f7);
      await closePanel();

      // ── item 70, the three greys ──
      const grey = [
        [
          'Pip Reid',
          W[25],
          W[26],
          {
            text: W[27],
            href: `/plan/${board}/setup?person=${encodeURIComponent(pid('Pip Reid'))}`,
          },
          'child',
        ],
        [
          'Gus Hale',
          W[28],
          W[29],
          { text: W[30], href: `/plan/${board}/pre-flight` },
          'dont-nudge',
        ],
        ['Ruth Moana', W[31], W[32], null, 'not-coming'],
      ] as const;
      let arrows = true;
      for (const [name, status, line, link, tag] of grey) {
        const sf = await b.ev(STRIP_FACTS(id(name)));
        arrows = arrows && CHECKS.C_ARROW(sf);
        await openReading(id(name), name);
        const pf = await b.ev(POPUP_FACTS);
        r[`C8${tag}${k}`] =
          CHECKS.C_POPUP(pf, status, line, link as any) &&
          (tag !== 'child' || pf.empty === false) &&
          (await fits(w));
        if (tag === 'not-coming') r[`C15${k}`] = CHECKS.C_NO_NOTHING(pf);
        detail[`C8${tag}${k}`] = JSON.stringify({ sf, pf });
        await shot(`70-popup-${tag}-${w}.png`);
        await closePanel();
      }
      r[`C9${k}`] = arrows;
      await shot(`70-board-greys-${w}.png`);

      // ── item 67, the pre-flight ──
      const pre = pres[w];
      const pidPre = (n: string) => ids[`pre ${w}:${n}`];
      await b.navigate(`/plan/${pre}/pre-flight`, 6000);
      await b.tap('#step-4 header button[aria-expanded]', 2500);
      const p3 = await b.ev(PART3);
      r[`C10${k}`] = CHECKS.C_NAMES(p3, ['Lena Ford', 'Mere Tane', 'Raj Patel'], ['Ana Tane']);
      detail[`C10${k}`] = JSON.stringify(p3);
      await b.tap(`button[data-contact-name="${pidPre('Mere Tane')}"]`, 1500);
      const fo1 = await b.ev(FOLD(pidPre('Mere Tane')));
      r[`C11${k}`] = CHECKS.C_FOLD(fo1, W[10], true, '', '') && (await fits(w));
      detail[`C11${k}`] = JSON.stringify(fo1);
      await shot(`67-fold-both-${w}.png`);
      await b.tap(`button[data-contact-name="${pidPre('Lena Ford')}"]`, 1500);
      const fo2 = await b.ev(FOLD(pidPre('Lena Ford')));
      await shot(`67-fold-email-only-${w}.png`);
      await b.tap(`button[data-contact-name="${pidPre('Raj Patel')}"]`, 1500);
      const fo3 = await b.ev(FOLD(pidPre('Raj Patel')));
      r[`C12${k}`] =
        CHECKS.C_FOLD(fo2, W[11], false, '', '') &&
        CHECKS.C_FOLD(fo3, W[10], true, '', '+447700900387');
      detail[`C12${k}`] = JSON.stringify({ fo2, fo3 });
      // tick step 4, then save Mere's email from her fold: she and Ana leave part 3, the tick stays (Q7)
      // [[GTC-399]] item 5: step 4 is open here, so its one box is at the foot of its open content
      // (its row's slot empty).
      const STEP4_BOX = `(() => { const b = document.querySelectorAll('#step-4 header input[type=checkbox], #step-4 [data-tick-bottom] input[type=checkbox]'); return b.length === 1 && !!b[0].closest('[data-tick-bottom]') && document.querySelector('#step-4 header [data-tick-slot]')?.children.length === 0 && b[0].checked; })()`;
      await b.tap('#step-4 [data-tick-bottom] label', 600);
      const ticked = await b.ev<boolean>(STEP4_BOX);
      const m0 = await b.ev<number>(MESSAGES);
      await b.tap(`button[data-contact-name="${pidPre('Mere Tane')}"]`, 1500);
      await typeInto(inFold(pidPre('Mere Tane'), '[data-contact-email]'), mail(`mere-pre${w}`));
      const q3 = (await fixtureRows()).queued;
      await b.tap(inFold(pidPre('Mere Tane'), '[data-contact-save]'), 3000);
      const after = await b.ev(PART3);
      const m1 = await b.ev<number>(MESSAGES);
      const stillTicked = await b.ev<boolean>(STEP4_BOX);
      r[`C13${k}`] =
        CHECKS.C_MOVED(after, W12('Mere Tane'), ['Mere Tane', 'Ana Tane'], m0, m1) &&
        ticked &&
        stillTicked &&
        (await fixtureRows()).queued === q3;
      detail[`C13${k}`] = JSON.stringify({ m0, m1, ticked, stillTicked, groupA: after?.groupA });
      await b.ev(
        `document.querySelector('#step-4 section[data-message-part="3"]')?.scrollIntoView({ block: 'start' })`
      );
      await shot(`67-after-save-${w}.png`);
    }
    const labels: Array<[string, string]> = [
      [
        'C1',
        'C1 the "nowhere to send" door shows the box: W6 heading, Email and Mobile (W1 to W3), Save (W4), no old "Send to" box',
      ],
      ['C2', 'C2 an unreadable mobile: W17 then W22, the typing kept, still Save, nothing saved'],
      [
        'C3',
        'C3 an email save: W7, Close (W8), boxes read-only, ONE invitation queued (never sent: the drain is never run)',
      ],
      ['C4', 'C4 Close closes the panel, and the strip turns amber on the board’s refresh'],
      [
        'C5',
        'C5 a mobile-only save with texting off (Q2 b): W33, Close, the number saved, nothing queued',
      ],
      [
        'C6',
        'C6 reopened after a reload: W34, the saved number in the box, no "Send it as a text"; the strip still red, "nowhere to send" (Q20)',
      ],
      ['C7', 'C7 opted out of texts: the Email box only, with W9 in place of the Mobile box (Q4)'],
      [
        'C8child',
        'C8 a child holding nothing: "No job yet", W26, "Give them a job" to Moment 3 with the child picked; no "Bringing nothing." (Q16)',
      ],
      [
        'C8dont-nudge',
        'C8 the don’t-nudge mark: R6’s status, W29, "Change who I nudge" to the pre-flight',
      ],
      ['C8not-coming', 'C8 not coming: "Not coming", W32, no link'],
      ['C9', 'C9 the three greys are reading doors and wear the arrow (Q11)'],
      [
        'C10',
        'C10 part 3: Mere, Lena and Raj are buttons with W13’s spoken label; Ana (a carried child) stays plain text',
      ],
      ['C11', 'C11 Mere’s fold: W10, Email and Mobile, empty, Save'],
      [
        'C12',
        'C12 Lena’s fold has the Email box only (W11); Raj’s shows the number Gather holds (Q5)',
      ],
      [
        'C13',
        'C13 a fold save: W12 in part 3, Mere and Ana leave it, the messages go up by one, step 4’s tick stays (Q7; ticked and read at the foot of the open step, GTC-399 item 5), nothing queued',
      ],
    ];
    for (const [key, label] of labels) {
      assert('C', `${label} (1280)`, r[key] === true, detail[key]);
      assert('C', `${label} (390)`, r[`${key}p`] === true, detail[`${key}p`]);
    }
    // [[GTC-387]] looks rulings (2026-10-16): one assertion each, over both widths.
    assert(
      'C',
      'C14 (Q21) reopened after a mobile-only save with texting off, the door still shows the composed message (1280 and 390)',
      r.C14 === true && r.C14p === true,
      `${detail.C6} || ${detail.C6p}`
    );
    assert(
      'C',
      'C15 (Q22) the Not coming pop-up has no "Bringing nothing." line (1280 and 390)',
      r.C15 === true && r.C15p === true,
      `${detail['C8not-coming']} || ${detail['C8not-comingp']}`
    );
  } finally {
    c?.close();
  }
  const whileExists = await fixtureRows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(
    `    fixture while it existed: ${JSON.stringify(whileExists)}; aiCallsUsed ${ai.join(',')}`
  );
  const nonGet = c?.allowedReq ?? [];
  assert(
    'K',
    'K1 CONTROL: no request but GETs reached the server except the box saves on this suite’s own events; nothing failed but the probes; no dialog; no click refused',
    !!c &&
      nonGet.every((x) => /\/resend$|\/pre-flight\/channel$/.test(x)) &&
      c.failedReq.length === 3 &&
      c.failedReq.every((x) => /gtc387-probe/.test(x)) &&
      c.dialogs.length === 0 &&
      c.refusals.length === 0,
    `${nonGet.join(' | ')} || ${c?.failedReq.join(' | ')} || ${c?.dialogs.join(',')} || ${c?.refusals.join(' ; ')}`
  );
  await cleanup();
  const after = await totals();
  assert(
    'K',
    'K2 CONTROL: aiCallsUsed 0 on every fixture event; the invitations Save queued counted, then every fixture row removed by id; the InviteEvent and OutboundMessage totals as found',
    ai.length > 0 &&
      ai.every((x) => x === 0) &&
      whileExists.invite === 0 &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `${JSON.stringify(before)} → ${JSON.stringify(after)}`
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
  // Every row below was made by this suite: its events and what hangs off them, its people, its
  // users and their sessions, and its one TextBlock (address-wide, so removed by id).
  const evIds = created.events;
  await del(() => prisma.accessToken.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.auditEntry.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.outboundMessage.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() =>
    prisma.assignment.deleteMany({ where: { item: { team: { eventId: { in: evIds } } } } })
  );
  await del(() => prisma.item.deleteMany({ where: { team: { eventId: { in: evIds } } } }));
  await del(() =>
    prisma.household.updateMany({
      where: { eventId: { in: evIds } },
      data: { contactPersonEventId: null },
    })
  );
  await del(() => prisma.event.deleteMany({ where: { id: { in: evIds } } }));
  await del(() => prisma.textBlock.deleteMany({ where: { id: { in: created.textBlocks } } }));
  await del(() => prisma.session.deleteMany({ where: { userId: { in: created.users } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
  const left = [
    await prisma.event.count({ where: { id: { in: evIds } } }),
    await prisma.person.count({ where: { id: { in: created.people } } }),
    await prisma.user.count({ where: { id: { in: created.users } } }),
    await prisma.textBlock.count({ where: { id: { in: created.textBlocks } } }),
  ].join(',');
  assert(
    'K',
    'K3 CONTROL: every fixture row removed by id (events, people, users, the TextBlock)',
    left === '0,0,0,0',
    left
  );
}

async function main() {
  suiteStart = await totals();
  await runInMemory();
  await runInProcess();
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
