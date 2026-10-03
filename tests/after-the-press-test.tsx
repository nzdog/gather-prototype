/**
 * [[GTC-329]] — after the press, a way back to the host's chase decisions.
 *
 * GTC-311's SCOPED ruling 3 found that after the press the pre-flight, and the three decisions the
 * chase reads when it runs (the don't-chase mark, the per-person exception, the event switch), were
 * reachable only by typing the address. This suite holds the way back, as ruled 2026-09-29:
 *
 *   Layer A — the post-press surface, rendered from props: "Who I chase", the three decisions and
 *             nothing else. No Send, no pace, no channel picker, no preview.
 *   Layer B — the pre-flight page shows it once `Event.sentAt` is set, and is otherwise untouched.
 *   Layer C — the three host surfaces link to it after the press and only then. The board's grey
 *             strips stay sealed (GTC-192 Ruling 17).
 *   Layer D — the ruled words, verbatim, and the refusal naming the heading the host will see.
 *   Layer E — Unknown 1, against gather_dev: a change after the press reaches reminders not yet
 *             sent, and leaves the one already sent alone. A characterisation — GREEN at HEAD.
 *   Layer Z — nothing sent.
 *
 * Needs the database for layer E. Its fixture is created and removed by id.
 *
 * Run: npm run test:after-the-press
 */

// Layer D pins the date in WD, so the zone is fixed before any Date is formatted.
process.env.TZ = 'Pacific/Auckland';

import { installProviderTrap, trapCount } from './helpers/provider-trap';
installProviderTrap();

import { PrismaClient } from '@prisma/client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const DAY = 24 * 60 * 60 * 1000;

let passed = 0;
let failed = 0;
const red: string[] = [];

function assert(layer: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}`);
    failed++;
    red.push(`[${layer}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function raw(rel: string): string {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

/** Source with comments stripped — prose about a rule must not satisfy an assertion. */
function code(rel: string): string {
  return raw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** What renderToStaticMarkup writes for a string. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;');
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

async function load<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const MARK_ROWS = 'src/components/preflight/mark-rows.tsx';
const AFTER = 'src/components/preflight/AfterThePress.tsx';
const HOST_VIEW = 'src/app/h/[token]/page.tsx';
const INVITE_STATUS = 'src/components/plan/InviteStatusSection.tsx';
const BOARD = 'src/components/glance/GlanceBoard.tsx';
const BOARD_PAGE = 'src/app/plan/[eventId]/glance/page.tsx';

// The ruled words, 2026-09-29, verbatim.
const WA = 'Change who I chase';
const WB = 'Opens the page where you can change who I chase. You will need to be signed in.';
const WC = 'Who I chase';
const WD_27_SEP =
  "The invitations went out on 27 September. Changes here apply to reminders I haven't sent yet.";
const WE =
  "This person is marked don't-chase and will not be nudged. Change the mark under “Who I chase” first.";

// ─── Pure props for the post-press view ──────────────────────────────────────

const SENT_AT = '2026-09-27T07:52:45.003Z';

function member(
  id: string,
  name: string,
  o: {
    householdRole?: string;
    messageable?: boolean;
    markable?: boolean;
    nudgeMark?: 'GENTLE' | 'DONT_CHASE' | null;
  } = {}
) {
  return {
    personEventId: id,
    personId: `p-${id}`,
    name,
    email: null,
    phone: null,
    householdRole: o.householdRole ?? 'GUEST',
    isYoungPerson: false,
    messageable: o.messageable ?? true,
    markable: o.markable ?? true,
    nudgeMark: o.nudgeMark ?? null,
  };
}

const households = [
  {
    id: 'hh-host',
    label: 'Kate Walk',
    littleCount: 0,
    contactPersonEventId: null,
    resolvedContactPersonEventId: 'pe-kate',
    members: [
      member('pe-kate', 'Kate Walk', { householdRole: 'PRIMARY_CONTACT', markable: false }),
    ],
  },
  {
    id: 'hh-b',
    label: 'Tama Mobile',
    littleCount: 0,
    contactPersonEventId: null,
    resolvedContactPersonEventId: 'pe-tama',
    members: [
      member('pe-tama', 'Tama Mobile', { householdRole: 'PRIMARY_CONTACT' }),
      member('pe-erin', 'Erin Emailonly', { householdRole: 'PARTNER' }),
      member('pe-dora', 'Dora Dontchase', { nudgeMark: 'DONT_CHASE' }),
      member('pe-kit', 'Kit Child', { householdRole: 'CHILD', messageable: false }),
    ],
  },
];
const unhoused = [member('pe-olly', 'Olly Optedout')];
const chase = {
  stored: null,
  resolved: 'BY_EMAIL',
  byRecipient: {
    'pe-tama': { chasedBy: 'TEXT', why: null, control: 'NONE', exception: null, carried: [] },
    'pe-erin': { chasedBy: 'EMAIL', why: null, control: 'OFFERED', exception: null, carried: [] },
    'pe-dora': {
      chasedBy: 'NONE',
      why: 'MARKED_DONT_CHASE',
      control: 'NONE',
      exception: null,
      carried: [],
    },
    'pe-olly': {
      chasedBy: 'NONE',
      why: 'SMS_OPTED_OUT',
      control: 'REFUSED_OPTED_OUT',
      exception: null,
      carried: [],
    },
  },
};

async function main() {
  const words = await load(() => import('../src/lib/preflight/after-press-words'));
  const after = await load(() => import('../src/components/preflight/AfterThePress'));
  const compose = await import('../src/lib/preflight/ask-preview-compose');
  const nudgeMark = await import('../src/lib/eligibility/nudge-mark');

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer A: the post-press surface, rendered from props');
  // ───────────────────────────────────────────────────────────────────────────
  const noop = () => {};
  const html =
    (after &&
      ok(() => typeof (after as any).AfterThePressView === 'function') &&
      (() => {
        try {
          return renderToStaticMarkup(
            createElement((after as any).AfterThePressView, {
              eventName: 'GTC-329 walk',
              sentAt: SENT_AT,
              pace: null,
              households,
              unhoused,
              chase,
              saving: false,
              error: null,
              onMark: noop,
              onException: noop,
              onDefault: noop,
            })
          );
        } catch (e) {
          console.error('    render threw:', (e as Error).message);
          return '';
        }
      })()) ||
    '';
  // Every absence below is gated on this: an empty render has no Send button either.
  const rendered = html.includes(WC);
  const text = html.replace(/<[^>]+>/g, '\n');

  assert(
    'A',
    `the heading is WC, "${WC}", as an h1`,
    rendered && /<h1[^>]*>Who I chase<\/h1>/.test(html)
  );
  assert(
    'A',
    'the lead is WD, with the date of the press',
    rendered && html.includes(esc(WD_27_SEP))
  );
  assert(
    'A',
    'it does not present itself as before the press — no "Before you send", no "Five things"',
    rendered && !html.includes('Before you send') && !html.includes('Five things')
  );
  assert(
    'A',
    'THERE IS NO SEND — no button whose words begin "Send", and no path to /send',
    rendered &&
      !/<button[^>]*>\s*Send/.test(html) &&
      !/\/send\b/.test(html) &&
      !code(AFTER).match(/\/send['"`]/)
  );
  assert(
    'A',
    'the mark row is offered to each markable adult — four "Normal nudge" pills: Tama, Erin, Dora, Olly',
    rendered && count(html, '>Normal nudge<') === 4 && count(html, '>Don&#x27;t chase<') === 4
  );
  assert(
    'A',
    'the host and the child keep their existing sentences and get no pills',
    rendered &&
      text.includes('you — never messaged about your own event') &&
      text.includes('child — never messaged, whatever contact details are on the record')
  );
  assert(
    'A',
    "the exception pills appear only where control is OFFERED — Erin's, once",
    rendered &&
      count(html, `>${compose.CHASE_PERSON_PILLS.HAND_TO_HOST}<`) === 1 &&
      html.includes(`>${compose.CHASE_PERSON_PILLS.BY_EMAIL}${compose.DEFAULT_SUFFIX}<`)
  );
  assert(
    'A',
    "ruling AM's placeholder appears where control is REFUSED_OPTED_OUT — Olly's, once",
    rendered && count(html, esc(compose.CHASE_OPTED_OUT_PLACEHOLDER)) === 1
  );
  assert(
    'A',
    'the event switch: its sentence for the resolved default, both pills, the default suffixed',
    rendered &&
      html.includes(esc(compose.CHASE_DEFAULT_SENTENCE.BY_EMAIL)) &&
      html.includes(`>${compose.CHASE_DEFAULT_PILLS.BY_EMAIL}${compose.DEFAULT_SUFFIX}<`) &&
      html.includes(`>${compose.CHASE_DEFAULT_PILLS.HAND_TO_HOST}<`)
  );
  assert(
    'A',
    'PACE IS LEFT OUT (ruling 1) — no pace heading and none of its three pills',
    rendered && !html.includes('Nudge pace') && !/>(Standard|Relaxed|Off|Not set)</.test(html)
  );
  assert(
    'A',
    'no channel picker, no preview, no dietary — no <select>, no <textarea>, no "Your line"',
    rendered && !/<select|<textarea/.test(html) && !html.includes('Your line')
  );

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer B: the pre-flight page shows it after the press, and only then');
  // ───────────────────────────────────────────────────────────────────────────
  const page = code(PAGE);
  const body = page.slice(page.indexOf('export default function PreFlightPage'));
  const branchAt = body.search(
    /if\s*\(\s*data\.event\.sentAt\s*\)\s*\{?\s*return\s*<AfterThePress\b/
  );
  assert(
    'B',
    'PreFlightPage returns <AfterThePress> when data.event.sentAt is set',
    page.length > 0 && branchAt > 0 && /from '@\/components\/preflight\/AfterThePress'/.test(page)
  );
  assert(
    'B',
    'the branch comes after every hook — no use* call follows it in PreFlightPage',
    ok(() => {
      if (branchAt <= 0) return false;
      const end = body.indexOf('\n}\n');
      const after = body.slice(branchAt, end > 0 ? end : undefined);
      return !/\buse(State|Effect|Callback|Memo|Params)\(/.test(after);
    })
  );
  assert(
    'B',
    'the pre-press path is untouched — "Before you send" and the post to /send are still there',
    page.includes('Before you send') && /\/api\/events\/\$\{eventId\}\/send/.test(page)
  );

  const POSTS_TO_PRESS = /confirm-invites-sent|\/send['"`]/;
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const q = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(q);
      else if (/\.tsx$/.test(e.name) && POSTS_TO_PRESS.test(code(q))) callers.push(q);
    }
  };
  walk('src');
  assert(
    'B',
    'EXACTLY ONE SURFACE POSTS TO THE PRESS, and it is still the pre-flight page',
    callers.length === 1 && callers[0] === `src/${PAGE.slice(4)}`
  );
  assert(
    'B',
    'CONTROL: the matcher matches a planted post to the press',
    POSTS_TO_PRESS.test('fetch(`/api/events/x/send`)')
  );
  assert(
    'B',
    'MarkRows and its helpers MOVED, unchanged in kind: mark-rows.tsx exports them and the page no longer defines them',
    ok(() => {
      const m = code(MARK_ROWS);
      return (
        /export function MarkRows\b/.test(m) &&
        /export function Pill\b/.test(m) &&
        /export function cadenceSentence\b/.test(m) &&
        /export const MARK_LABELS\b/.test(m) &&
        !/function MarkRows\b|function Pill\b|function cadenceSentence\b|const MARK_LABELS\b/.test(
          page
        )
      );
    })
  );

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer C: the way back, on the three host surfaces, after the press only');
  // ───────────────────────────────────────────────────────────────────────────
  const GB = await load(() => import('../src/components/glance/GlanceBoard'));
  const strip = await import('../src/components/glance/strip');
  const emptyGlance = {
    eventId: 'e-329',
    hostPersonId: 'p-kate',
    asOf: new Date(SENT_AT).toISOString(),
    summary: { needYou: 0, withGather: 0, settled: 0 },
    households: [],
    unhoused: [],
    unassignedCritical: [],
    unassignedOrdinaryCount: 0,
  };
  const board = (afterPress: boolean | undefined) =>
    renderToStaticMarkup(
      createElement((GB as any).default, {
        glance: emptyGlance,
        eventName: 'GTC-329 walk',
        actorRole: 'HOST',
        eventDate: 'Friday, 9 October',
        stickyReversals: [],
        now: new Date(SENT_AT),
        ...(afterPress === undefined ? {} : { afterPress }),
      })
    );
  const boardAfter = ok(() => board(true).length > 0) ? board(true) : '';
  const boardBefore = ok(() => board(false).length > 0) ? board(false) : '';
  assert(
    'C',
    'the board after the press carries WA, linking to the pre-flight',
    boardAfter.includes(`href="/plan/e-329/pre-flight"`) && boardAfter.includes(`>${WA}<`)
  );
  assert(
    'C',
    'the board before the press does not, and neither does a board given no afterPress',
    boardBefore.length > 0 &&
      !boardBefore.includes(WA) &&
      !boardBefore.includes('/pre-flight') &&
      ok(() => !board(undefined).includes(WA))
  );
  assert(
    'C',
    'the glance page passes afterPress from Event.sentAt',
    /afterPress=\{\s*event\.sentAt\s*!==\s*null\s*\}|afterPress=\{\s*!!event\.sentAt\s*\}/.test(
      code(BOARD_PAGE)
    )
  );
  assert(
    'C',
    "RULING 17 — the don't-chase grey is still sealed: panelFor returns null",
    strip.panelFor({ state: 'NOT_CHASED', reasons: ['DONT_CHASE'] } as any) === null
  );

  const SENT_GATED = (src: string, gate: RegExp, word: string) => {
    const at = src.search(gate);
    if (at < 0) return false;
    const block = src.slice(at, at + 1600);
    return block.includes(word);
  };
  const hostView = code(HOST_VIEW);
  assert(
    'C',
    'the host-token page shows WA and WB inside its `inviteStatus.sentAt &&` block',
    SENT_GATED(hostView, /\{\s*data\.inviteStatus\.sentAt\s*&&/, 'CHASE_DOOR_LINK') &&
      SENT_GATED(hostView, /\{\s*data\.inviteStatus\.sentAt\s*&&/, 'CHASE_DOOR_HOST_VIEW_NOTE') &&
      count(hostView, '{CHASE_DOOR_LINK}') === 1
  );
  assert(
    'C',
    'and its "Review and send" before the press is still there (outbound-drain-test layer D)',
    hostView.includes('Review and send') && /\{\s*!data\.inviteStatus\.sentAt\s*&&/.test(hostView)
  );
  const invite = code(INVITE_STATUS);
  assert(
    'C',
    'InviteStatusSection shows WA inside its `sentAt &&` block, and only there',
    SENT_GATED(invite, /\{\s*sentAt\s*&&/, 'CHASE_DOOR_LINK') &&
      count(invite, '{CHASE_DOOR_LINK}') === 1
  );
  assert(
    'C',
    'and its "Review and send" is still gated on hasUnsentPeople',
    invite.includes('Review and send') && /\{\s*hasUnsentPeople\s*&&/.test(invite)
  );
  assert(
    'C',
    'CONTROL: the gate matcher finds a planted gated link and refuses an ungated one',
    SENT_GATED('{sentAt && (<a>{CHASE_DOOR_LINK}</a>)}', /\{\s*sentAt\s*&&/, 'CHASE_DOOR_LINK') &&
      !SENT_GATED('<a>{CHASE_DOOR_LINK}</a>', /\{\s*sentAt\s*&&/, 'CHASE_DOOR_LINK')
  );

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer D: the words, as ruled 2026-09-29');
  // ───────────────────────────────────────────────────────────────────────────
  const w = (words ?? {}) as Record<string, any>;
  assert('D', `WA is exactly "${WA}"`, w.CHASE_DOOR_LINK === WA);
  assert('D', 'WB is exactly as ruled', w.CHASE_DOOR_HOST_VIEW_NOTE === WB);
  assert('D', `WC is exactly "${WC}"`, w.AFTER_PRESS_HEADING === WC);
  assert(
    'D',
    'WD is exactly as ruled, with the date of the press',
    ok(() => w.afterPressLead(new Date(SENT_AT)) === WD_27_SEP)
  );
  assert(
    'D',
    'WE — DONT_CHASE_NOT_ADDRESSABLE_MESSAGE is exactly as ruled',
    nudgeMark.DONT_CHASE_NOT_ADDRESSABLE_MESSAGE === WE
  );
  assert(
    'D',
    'WE names the heading the host will actually see — WC, in quotes, from the one constant',
    typeof w.AFTER_PRESS_HEADING === 'string' &&
      nudgeMark.DONT_CHASE_NOT_ADDRESSABLE_MESSAGE.includes(`“${w.AFTER_PRESS_HEADING}”`)
  );
  assert(
    'D',
    'the door goes to the pre-flight address, which is where the mark is set (Ruling 17)',
    ok(() => w.chaseDoorHref('e1') === '/plan/e1/pre-flight')
  );

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer E: Unknown 1 — a change after the press reaches only reminders not yet sent');
  // ───────────────────────────────────────────────────────────────────────────
  await runDatabaseLayer();

  // ───────────────────────────────────────────────────────────────────────────
  section('Layer Z: nothing sent');
  // ───────────────────────────────────────────────────────────────────────────
  assert('Z', 'NOTHING SENDS — no request reached the provider trap', trapCount() === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nRED:');
    for (const r of red) console.log(`  ${r}`);
  }
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

async function runDatabaseLayer() {
  const { writeChaseChoice } = await import('../src/lib/preflight/chase-choice');
  const { findNudgeCandidatesForEvent } = await import('../src/lib/sms/nudge-eligibility');
  const { DONT_CHASE_SKIP_REASON } = await import('../src/lib/eligibility/nudge-mark');

  const HANDED = 'Handed to the host by her exception or her switch (GTC-311)';
  const tag = `gtc329-${Date.now().toString(36)}`;
  const ids = {
    persons: [] as string[],
    event: '',
    personEvents: [] as string[],
    tokens: [] as string[],
  };
  const outboundBefore = await prisma.outboundMessage.count();
  const inviteBefore = await prisma.inviteEvent.count();

  const now = new Date();
  const sentAt = new Date(now.getTime() - 8 * DAY);
  const firstLeg = new Date(sentAt.getTime() + 4 * DAY);
  try {
    const host = await prisma.person.create({
      data: { name: 'Kate 329', email: `host+${tag}@example.com` },
    });
    ids.persons.push(host.id);
    const event = await prisma.event.create({
      data: {
        name: `GTC-329 test — ${tag}`,
        startDate: new Date(now.getTime() + 10 * DAY),
        endDate: new Date(now.getTime() + 10 * DAY + 6 * 3600 * 1000),
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    ids.event = event.id;
    const erin = await prisma.person.create({
      data: { name: 'Erin 329', email: `erin+${tag}@example.com`, phoneNumber: null },
    });
    ids.persons.push(erin.id);
    const pe = await prisma.personEvent.create({
      data: {
        personId: erin.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdRole: 'GUEST',
        sentAt,
        firstNudgeSentAt: firstLeg,
      },
    });
    ids.personEvents.push(pe.id);
    const tok = await prisma.accessToken.create({
      data: { token: `${tag}-erin`, scope: 'PARTICIPANT', eventId: event.id, personId: erin.id },
    });
    ids.tokens.push(tok.id);

    const inSecond = (r: { eligibleSecond: { personEventId: string }[] }) =>
      r.eligibleSecond.some((c) => c.personEventId === pe.id);
    const skipped = (r: { skipped: { reason: string; count: number }[] }, reason: string) =>
      r.skipped.some((s) => s.reason === reason && s.count >= 1);

    const before = await findNudgeCandidatesForEvent(event.id, now);
    assert(
      'E',
      'CONTROL: after the press, with the first leg sent, the email-only adult is due her SECOND leg by email',
      inSecond(before) &&
        before.eligibleSecond.find((c) => c.personEventId === pe.id)?.channel === 'EMAIL'
    );

    const wrote = await writeChaseChoice(
      prisma,
      event.id,
      { personEventId: pe.id, chaseException: 'HAND_TO_HOST' },
      'http://localhost:3000'
    );
    const handed = await findNudgeCandidatesForEvent(event.id, now);
    assert(
      'E',
      'the exception written after the press takes her off the NEXT leg — skipped as handed to the host',
      (wrote as any).ok !== false && !inSecond(handed) && skipped(handed, HANDED)
    );
    const afterException = await prisma.personEvent.findUniqueOrThrow({ where: { id: pe.id } });
    assert(
      'E',
      'and the leg already sent stays sent — firstNudgeSentAt is unchanged, secondNudgeSentAt still null',
      afterException.firstNudgeSentAt?.getTime() === firstLeg.getTime() &&
        afterException.secondNudgeSentAt === null
    );

    await writeChaseChoice(
      prisma,
      event.id,
      { personEventId: pe.id, chaseException: null },
      'http://localhost:3000'
    );
    // The cadence route's own write — a plain update of the one column — made directly, because
    // the route is session-gated and this layer asks what the chase READS, not who may write.
    await prisma.personEvent.update({ where: { id: pe.id }, data: { nudgeMark: 'DONT_CHASE' } });
    const marked = await findNudgeCandidatesForEvent(event.id, now);
    assert(
      'E',
      "the don't-chase mark set after the press does the same — skipped as don't-chase",
      !inSecond(marked) && skipped(marked, DONT_CHASE_SKIP_REASON)
    );
    const afterMark = await prisma.personEvent.findUniqueOrThrow({ where: { id: pe.id } });
    assert(
      'E',
      'and again the leg already sent is untouched',
      afterMark.firstNudgeSentAt?.getTime() === firstLeg.getTime()
    );
    assert(
      'E',
      'NOTHING WRITTEN TO SEND — OutboundMessage and InviteEvent counts are unchanged',
      (await prisma.outboundMessage.count()) === outboundBefore &&
        (await prisma.inviteEvent.count()) === inviteBefore
    );
  } finally {
    await prisma.accessToken.deleteMany({ where: { id: { in: ids.tokens } } });
    await prisma.personEvent.deleteMany({ where: { id: { in: ids.personEvents } } });
    if (ids.event) await prisma.event.deleteMany({ where: { id: ids.event } });
    await prisma.person.deleteMany({ where: { id: { in: ids.persons } } });
    const left =
      (await prisma.person.count({ where: { id: { in: ids.persons } } })) +
      (ids.event ? await prisma.event.count({ where: { id: ids.event } }) : 0);
    assert('E', 'the fixture is removed by id — nothing of it is left', left === 0);
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
