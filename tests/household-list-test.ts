/**
 * GTC-356 — the household contact is told, in her own message, what the others in her household
 * have been asked to bring.
 *
 * The founder's ruling and scoping rulings S1 to S7, and the PLAN RULINGS of 2026-10-03, are
 * verbatim in `docs/tickets/GTC-356.md`. What this suite holds:
 *
 *   A  the words — W1, W2, W3 and W5, approved as written ("Approve as written (Recommended)")
 *   B  `composeAsk` — the list in Gather's movement, after her own ask and her children's, before
 *      "I'll check back"; an empty list is byte-identical to the message before GTC-356; one body
 *      for both channels, never cut ("Never cut it (Recommended)")
 *   C  `readAskPreview` — who is on whose list (Q6 to Q9), on one fixture event
 *   D  the pre-flight — her message as she will read it, and W5's row
 *   E  one drain, guarded as test:reply-board's is (Q13) — what the senders were handed — and
 *      Q10's "Send it again", through the resend door's own composition (`readDoor`)
 *   F  the privacy page (S5)
 *   G  `chooseHouseholdListRoute`, pure
 *   X  the ruling's boundary: the guest page, `GET /api/p/[token]` and `carried-answer.ts` read no
 *      household list
 *   Z  every fixture removed by id; the OutboundMessage and InviteEvent totals as found
 *
 * NOTHING SENDS. `installProviderTrap` walls the process before anything is imported, and the two
 * senders the drain calls — `sendAskEmail` and `sendSms` — are replaced in `require.cache` so the
 * drain hands its bodies to this suite and never to a transport (texts-test's pattern). The live
 * gate is never opened. The drain is driven only when nothing outside this fixture is drainable.
 *
 * Fixtures are tagged per run; the one phone number is unique to the run and checked as held by
 * nobody else; no opt-out or email-block row is written (Zones 7 and 9 are read-only), so the
 * opted-out and blocked contacts are layer G's, in memory.
 */

import { PrismaClient } from '@prisma/client';
import { installProviderTrap } from './helpers/provider-trap';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const TAG = 'GTC356';
const ROOT = join(__dirname, '..');
const DAY = 24 * 60 * 60 * 1000;
const BASE = 'https://gather.example';
const LINE = 'Reply STOP to opt out';

// ── The environment and the walls, before anything that sends is imported. ───
for (const k of [
  'TNZ_AUTH_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'GATHER_LIVE_SENDS',
])
  delete process.env[k];
process.env.NEXT_PUBLIC_APP_URL = BASE;
installProviderTrap();

// ── The two senders the drain calls, replaced before any importer of them loads. ──
const texts: { to: string; message: string }[] = [];
const emails: { to: string; subject: string; body: string }[] = [];
let refuseEmailTo: string | null = null;
let sentN = 0;
const sendSmsPath = require.resolve('../src/lib/sms/send-sms');
const realSendSms = require(sendSmsPath);
require.cache[sendSmsPath]!.exports = {
  ...realSendSms,
  sendSms: async (p: { to: string; message: string }) => {
    texts.push({ to: p.to, message: p.message });
    return { success: true, messageId: `${TAG}-sms-${++sentN}-${Date.now()}` };
  },
};
const emailPath = require.resolve('../src/lib/email');
const realEmail = require(emailPath);
require.cache[emailPath]!.exports = {
  ...realEmail,
  sendAskEmail: async (p: { to: string; subject: string; body: string }) => {
    emails.push({ to: p.to, subject: p.subject, body: p.body });
    if (refuseEmailTo && p.to === refuseEmailTo) {
      return { success: false, error: `${TAG} stub refusal` };
    }
    return { success: true, providerMessageId: `${TAG}-email-${++sentN}-${Date.now()}` };
  },
};

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  — ${detail}` : ''}`);
    failed++;
    red.push(`[${phase}] ${label}`);
  }
}
function ok(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
async function layer(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    assert(name, `layer ran to completion (threw: ${(e as Error).message.split('\n')[0]})`, false);
  }
}
const read = (rel: string) =>
  existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '';
/** Comments out, so a scan reads code. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** Plain GSM-7 text: no character that would force a text to the 70-character size. */
const gsm7 = (s: unknown) =>
  typeof s === 'string' && s.length > 0 && !(NT.getMessageInfo(s) as any).hasUnicode;

// Pure modules. Present at RED; what they export is what the change adds.
const AR: any = require('../src/lib/messages/ask-register');
const APC: any = require('../src/lib/preflight/ask-preview-compose');
const CH: any = require('../src/lib/eligibility/channel-chooser');
const NT: any = require('../src/lib/sms/nudge-templates');

// ── The words as approved (W1, W2, W3, W5). ──────────────────────────────────
const W1 = 'Others in your household have been asked too:';
const W3 = "That's just so you know.";
const W5 = 'Told about';

// ── A fixed message, for the byte pins. ──────────────────────────────────────
const EVENT = {
  name: "Christmas at Kate's",
  startDate: new Date('2026-12-24T23:00:00Z'),
  venueName: '12 Rata Street',
  occasionDescription: null,
};
const LINK = 'https://gather.example/p/AbC123xYz';
const M1 =
  "Hi Jo - We're doing Christmas at Kate's on Friday, 25 December, at 12 Rata Street. Would love to have you there.";
const M2 = "I've got Gather helping me put it together - I'll let it take it from here.";
const SPEAKER = 'Hi - Gather here, helping Kate with this one.';
const CHECK = "I'll check back if I haven't heard from you.";
const TAP = `One tap to say yes, no or maybe - the details are on the page: ${LINK}`;
const TAP_ITEMLESS = `One tap to say whether you can make it: ${LINK}`;
const OWN_AND_OLLIE =
  "Would you bring the pavlova? Ollie has been asked to bring the chips. Would you also answer on Ollie's behalf?";

/** The message for Jo before GTC-356 — pinned, so an empty list is proven byte-identical. */
const BEFORE = `${M1}\n\n${M2}\n\n${SPEAKER} ${OWN_AND_OLLIE} ${CHECK} ${TAP}`;

const compose = (recipient: Record<string, unknown>) =>
  AR.composeAsk({
    event: EVENT,
    hostName: 'Kate Henderson',
    recipient: { link: LINK, ...recipient },
    storedAuthorLine: null,
  });
const jo = (household: unknown[], own = ['pavlova'], ollie = true) => ({
  firstName: 'Jo',
  itemNames: own,
  jobNames: [],
  carried: ollie ? [{ childFirstName: 'Ollie', itemNames: ['chips'], jobNames: [] }] : [],
  household,
});
const ross = { firstName: 'Ross', itemNames: ['cabbage'], jobNames: [] };
const sam = { firstName: 'Sam', itemNames: [], jobNames: ['dishes'] };

// ── LAYER A — the words. ──────────────────────────────────────────────────────
function runWords() {
  assert('A', 'A1 W1, the heading, byte-exact', AR.HOUSEHOLD_LIST_HEADING === W1);
  assert(
    'A',
    'A2 W2 for an item: "Ross: bring the cabbage"',
    ok(() => AR.householdLine(ross) === 'Ross: bring the cabbage')
  );
  assert(
    'A',
    'A3 W2 for a job: "Sam: do the dishes"',
    ok(() => AR.householdLine(sam) === 'Sam: do the dishes')
  );
  assert(
    'A',
    'A4 W2 for both, with decision 22\'s comma: "Ana: bring the ham and the rolls, and do the dishes"',
    ok(
      () =>
        AR.householdLine({
          firstName: 'Ana',
          itemNames: ['ham', 'rolls'],
          jobNames: ['dishes'],
        }) === 'Ana: bring the ham and the rolls, and do the dishes'
    )
  );
  assert('A', 'A5 W3, the closing line, byte-exact', AR.HOUSEHOLD_LIST_CLOSING === W3);
  assert('A', 'A6 W5, the pre-flight row\'s label: "Told about"', APC.TOLD_ABOUT_LABEL === W5);
  assert(
    'A',
    'A7 W1, W2 and W3 are plain GSM-7 text',
    gsm7(AR.HOUSEHOLD_LIST_HEADING) &&
      gsm7(AR.HOUSEHOLD_LIST_CLOSING) &&
      ok(() => gsm7(AR.householdLine(ross)))
  );
  const words = [AR.HOUSEHOLD_LIST_HEADING, AR.HOUSEHOLD_LIST_CLOSING];
  assert(
    'A',
    'A8 no "answer for", "could", "please" or dash in W1 to W3 (the register\'s rulings)',
    words.every(
      (w) => typeof w === 'string' && !/answer(ing)? for|\bcould\b|\bplease\b|[—–]/i.test(w)
    )
  );
}

// ── LAYER B — composeAsk. ─────────────────────────────────────────────────────
function runCompose() {
  assert(
    'B',
    'B1 CONTROL: with an empty household, the message is byte-identical to before GTC-356',
    ok(() => compose(jo([])).text === BEFORE)
  );
  const withRoss = `${M1}\n\n${M2}\n\n${SPEAKER} ${OWN_AND_OLLIE}\n${W1}\nRoss: bring the cabbage\n${W3}\n${CHECK} ${TAP}`;
  assert(
    'B',
    "B2 Jo — her pavlova, Ollie's chips, Ross's cabbage — byte-exact",
    ok(() => compose(jo([ross])).text === withRoss)
  );
  const itemless = `${M1}\n\n${M2}\n\n${SPEAKER} Nothing for you to bring.\n${W1}\nRoss: bring the cabbage\nSam: do the dishes\n${W3}\n${CHECK} ${TAP_ITEMLESS}`;
  assert(
    'B',
    'B3 S2: Jo holds nothing and carries no child — the itemless message with the list, byte-exact',
    ok(() => compose(jo([ross, sam], [], false)).text === itemless)
  );
  const five = [
    { firstName: 'Ross', itemNames: ['cabbage', 'potato salad'], jobNames: [] },
    { firstName: 'Sam', itemNames: ['ham'], jobNames: ['dishes'] },
    { firstName: 'Lee', itemNames: ['bread rolls'], jobNames: [] },
    { firstName: 'Ana', itemNames: ['trifle', 'cream'], jobNames: [] },
    { firstName: 'Pat', itemNames: ['ice'], jobNames: [] },
  ];
  assert(
    'B',
    'B4 five adults: every line written out, in order — one body for both channels, never cut',
    ok(() =>
      compose(jo(five)).text.includes(
        `${W1}\nRoss: bring the cabbage and the potato salad\nSam: bring the ham and do the dishes\nLee: bring the bread rolls\nAna: bring the trifle and the cream\nPat: bring the ice\n${W3}\n`
      )
    )
  );
  assert(
    'B',
    'B5 CONTROL: the link still ends the message',
    ok(() => compose(jo([ross])).text.endsWith(LINK))
  );
  assert(
    'B',
    'B6 the list sits after the carried question and before "I\'ll check back"',
    ok(() => {
      const t: string = compose(jo([ross])).text;
      const q = t.indexOf("on Ollie's behalf?");
      const h = t.indexOf(W1);
      const c = t.indexOf(CHECK);
      return q >= 0 && h > q && c > h;
    })
  );
  assert(
    'B',
    'B7 the segment count is taken over the message with the list',
    ok(() => {
      const a = compose(jo(five));
      return a.text.includes(W1) && a.segments === NT.getMessageInfo(a.text).segments;
    })
  );
}

// ── LAYER G — chooseHouseholdListRoute, pure. ─────────────────────────────────
function person(over: Record<string, unknown> = {}) {
  return {
    email: 'x@example.test',
    phoneNumber: null,
    smsOptedOut: false,
    emailOptedOut: false,
    emailBlocked: false,
    emailReported: false,
    numberDead: false,
    ...over,
  };
}
function member(
  id: string,
  householdId: string | null,
  householdRole: string | null,
  holdsItems: boolean,
  over: Record<string, unknown> = {}
) {
  return {
    id,
    personId: `p-${id}`,
    role: 'PARTICIPANT',
    householdId,
    householdRole,
    nudgeMark: null,
    holdsItems,
    person: person(over),
  };
}
function runChooser() {
  const route = (hh: string, ev: any) => CH.chooseHouseholdListRoute(hh, ev);
  const base = (
    contactOver: Record<string, unknown> = {},
    hhOver: Record<string, unknown> = {}
  ) => ({
    hostId: 'p-kate',
    households: [
      { id: 'hh', contactPersonEventId: 'jo', messagesMuted: null, ...hhOver },
      { id: 'hh-kate', contactPersonEventId: null, messagesMuted: null },
    ],
    memberships: [
      { ...member('kate', 'hh-kate', 'PRIMARY_CONTACT', false), role: 'HOST' },
      member('jo', 'hh', 'PRIMARY_CONTACT', true, contactOver),
      member('ross', 'hh', 'PARTNER', true),
      member('pat', 'hh', 'PARTNER', false),
      member('ollie', 'hh', 'CHILD', true),
    ],
  });

  assert(
    'G',
    'G1 a reachable contact: the list goes to her, by her channel, naming the adults holding a row',
    ok(() => {
      const r = route('hh', base());
      return (
        r.kind === 'TO_CONTACT' &&
        r.recipientId === 'jo' &&
        r.channel === 'EMAIL' &&
        JSON.stringify(r.memberIds) === JSON.stringify(['ross'])
      );
    })
  );
  const none = (r: any, why: string) => r && r.kind === 'NONE' && r.why === why;
  assert(
    'G',
    'G2 a contact opted out of texts, with no email: no list',
    ok(() =>
      none(
        route('hh', base({ email: null, phoneNumber: '+64211234567', smsOptedOut: true })),
        'SMS_OPTED_OUT'
      )
    )
  );
  assert(
    'G',
    'G3 a contact whose email is blocked, with no phone: no list',
    ok(() => none(route('hh', base({ emailBlocked: true })), 'EMAIL_BLOCKED'))
  );
  assert(
    'G',
    'G4 a contact who unsubscribed from email for this event: no list',
    ok(() => none(route('hh', base({ emailOptedOut: true })), 'EMAIL_OPTED_OUT'))
  );
  assert(
    'G',
    'G5 a household whose contact is the host (ruling A2): no list',
    ok(() => none(route('hh', base({}, { contactPersonEventId: 'kate' })), 'HOST_AS_CONTACT'))
  );
  assert(
    'G',
    'G6 a household that picked a child as its contact: no list',
    ok(() => none(route('hh', base({}, { contactPersonEventId: 'ollie' })), 'NO_CARRIER'))
  );
  assert(
    'G',
    'G7 a household with its messages switched off: no list',
    ok(() => none(route('hh', base({}, { messagesMuted: true })), 'HOUSEHOLD_MUTED'))
  );
  assert(
    'G',
    "G8 the host's own household: no list, whoever its contact is",
    ok(() => {
      const ev = base();
      ev.memberships.push(member('dan', 'hh-kate', 'PARTNER', true));
      ev.households[1].contactPersonEventId = 'dan' as any;
      return none(route('hh-kate', ev), 'HOST_HOUSEHOLD');
    })
  );
  assert(
    'G',
    'G9 an adult Gather cannot reach is still on the list (S6)',
    ok(() => {
      const ev = base();
      ev.memberships.push(member('lee', 'hh', 'GUEST', true, { email: null, phoneNumber: null }));
      ev.memberships.push(
        member('opt', 'hh', 'GUEST', true, {
          email: null,
          phoneNumber: '+64211234568',
          smsOptedOut: true,
        })
      );
      const r = route('hh', ev);
      return (
        r.kind === 'TO_CONTACT' && ['ross', 'lee', 'opt'].every((id) => r.memberIds.includes(id))
      );
    })
  );
  assert(
    'G',
    'G10 CONTROL: chooseAskRoute answers for the same roster are unchanged',
    ok(() => {
      const ev = base();
      const by = (id: string) =>
        CH.chooseAskRoute(
          ev.memberships.find((m) => m.id === id),
          ev
        );
      return (
        JSON.stringify(by('ollie')) ===
          JSON.stringify({ kind: 'CARRIED', channel: 'EMAIL', recipientId: 'jo' }) &&
        JSON.stringify(by('ross')) ===
          JSON.stringify({ kind: 'DIRECT', channel: 'EMAIL', recipientId: 'ross' }) &&
        JSON.stringify(by('kate')) ===
          JSON.stringify({ kind: 'NOT_A_RECIPIENT', why: 'HOST_OWN_ASK' })
      );
    })
  );
  assert(
    'G',
    'G11 a household where no other adult holds a row: no list',
    ok(() => {
      const ev = base();
      ev.memberships = ev.memberships.filter((m) => m.id !== 'ross');
      return none(route('hh', ev), 'NOBODY_TO_LIST');
    })
  );
}

// ── LAYER F — the privacy page (S5). ──────────────────────────────────────────
const S5 =
  "If you're part of a household, Gather tells its contact person what you've been asked to bring.";
function runPrivacy() {
  const page = read('src/app/privacy/page.tsx')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ');
  const howStart = page.indexOf('How We Use It');
  const howEnd = page.indexOf('Who We Share It With');
  const how = howStart >= 0 && howEnd > howStart ? page.slice(howStart, howEnd) : '';
  assert('F', 'F1 the S5 sentence, verbatim, under "How We Use It"', how.includes(S5));
  assert('F', 'F2 "Last updated: 3 October 2026"', page.includes('Last updated: 3 October 2026'));
  assert(
    'F',
    "F3 CONTROL: GTC-350's bullet about text replies is still there",
    page.includes('If you reply to one of our texts, we show your reply to the person who invited')
  );
}

// ── LAYER X — the ruling's boundary. ──────────────────────────────────────────
function runBoundary() {
  const files = [
    'src/app/p/[token]/page.tsx',
    'src/app/api/p/[token]/route.ts',
    'src/lib/eligibility/carried-answer.ts',
  ];
  const reads =
    /chooseHouseholdListRoute|readAskPreview|HOUSEHOLD_LIST_|householdLine|toldAbout|\.household\b(?!\s*\.)|\bhousehold\s*:/;
  const hits = files.filter((f) => {
    const src = read(f);
    return src.length === 0 || reads.test(codeOnly(src));
  });
  assert(
    'X',
    'X1 CONTROL: the guest page, GET /api/p/[token] and carried-answer.ts read no household list',
    hits.length === 0,
    hits.join(', ')
  );
}

// ── LAYERS C, D and E — one fixture event. ────────────────────────────────────
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

function nzNoon(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0); // 12:00 or 13:00 NZ, outside quiet hours
  return d;
}

async function runDatabase() {
  const preview = await import('../src/lib/preflight/ask-preview');
  const press = await import('../src/lib/press/press');
  const dispatch = await import('../src/lib/press/dispatch');
  const resend = await import('../src/lib/press/resend');

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `${TAG.toLowerCase()}-${l}-${stamp}@example.test`;
  const digits = String(Date.now()).slice(-6);
  const gusPhone = `+64213${digits}`;
  const samPhone = `+64214${digits}`;
  assert(
    'C',
    `SAFETY PRECONDITION: nobody else holds the run's two phone numbers (${gusPhone}, ${samPhone})`,
    (await prisma.person.count({ where: { phoneNumber: { in: [gusPhone, samPhone] } } })) === 0
  );

  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const mk = async (label: string, over: Record<string, unknown> = {}) => {
    const p = await prisma.person.create({
      data: { name: `${label} ${TAG}`, email: mail(label.toLowerCase()), ...over },
    });
    created.people.push(p.id);
    return p;
  };
  const kate = await mk('Kate', { email: user.email, userId: user.id });
  const now = nzNoon();
  const start = new Date(now.getTime() + 30 * DAY);
  const event = await prisma.event.create({
    data: {
      name: `${TAG} Christmas`,
      startDate: start,
      endDate: start,
      hostId: kate.id,
      status: 'CONFIRMING',
    },
  });
  created.events.push(event.id);
  await prisma.eventRole.create({ data: { eventId: event.id, userId: user.id, role: 'HOST' } });
  const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });

  const hh = async (over: Record<string, unknown> = {}) =>
    prisma.household.create({ data: { eventId: event.id, ...over } });
  const join_ = async (
    p: { id: string },
    householdId: string,
    householdRole: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD',
    over: Record<string, unknown> = {}
  ) =>
    prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId,
        householdRole,
        ...over,
      },
    });
  const item = async (
    p: { id: string },
    name: string,
    kind: 'ITEM' | 'TASK' = 'ITEM',
    response: 'PENDING' | 'DECLINED' = 'PENDING'
  ) => {
    const it = await prisma.item.create({
      data: { name, kind, teamId: team.id, status: 'ASSIGNED' },
    });
    await prisma.assignment.create({ data: { itemId: it.id, personId: p.id, response } });
  };

  // The host's own household: Kate, Dan (holds the cheeseboard), Poppy (a child, napkins).
  const hhKate = await hh();
  await join_(kate, hhKate.id, 'PRIMARY_CONTACT', { role: 'HOST' });
  const kateMembership = await prisma.personEvent.findFirstOrThrow({
    where: { personId: kate.id, eventId: event.id },
  });
  const dan = await mk('Dan');
  await join_(dan, hhKate.id, 'PARTNER');
  await item(dan, 'cheeseboard');
  const poppy = await mk('Poppy', { email: null });
  await join_(poppy, hhKate.id, 'CHILD');
  await item(poppy, 'napkins');

  // H1 — Jo's: Ross (cabbage), Sam (texted; a job), Pat (nothing), Lee (no email or mobile; ham,
  // DECLINED), Zed (just attending, and holds the ice), Pip (just attending, nothing), Ollie (child).
  const h1 = await hh();
  const joP = await mk('Jo');
  const joM = await join_(joP, h1.id, 'PRIMARY_CONTACT');
  await prisma.household.update({ where: { id: h1.id }, data: { contactPersonEventId: joM.id } });
  await item(joP, 'pavlova');
  const rossP = await mk('Ross');
  await join_(rossP, h1.id, 'PARTNER');
  await item(rossP, 'cabbage');
  const samP = await mk('Sam', { email: null, phoneNumber: samPhone });
  await join_(samP, h1.id, 'GUEST');
  await item(samP, 'dishes', 'TASK');
  const patP = await mk('Pat');
  await join_(patP, h1.id, 'PARTNER');
  const leeP = await mk('Lee', { email: null });
  await join_(leeP, h1.id, 'GUEST');
  await item(leeP, 'ham', 'ITEM', 'DECLINED');
  const zedP = await mk('Zed');
  await join_(zedP, h1.id, 'GUEST', { justAttending: true });
  await item(zedP, 'ice');
  const pipP = await mk('Pip');
  await join_(pipP, h1.id, 'GUEST', { justAttending: true });
  const ollieP = await mk('Ollie', { email: null });
  await join_(ollieP, h1.id, 'CHILD');
  await item(ollieP, 'chips');

  // H2 — switched off: Mia (contact), Ben (bread).
  const h2 = await hh({ messagesMuted: true });
  const miaP = await mk('Mia');
  await join_(miaP, h2.id, 'PRIMARY_CONTACT');
  const benP = await mk('Ben');
  await join_(benP, h2.id, 'PARTNER');
  await item(benP, 'bread');

  // H3 — a contact Gather cannot reach: Ned (no email or mobile), Eve (trifle).
  const h3 = await hh();
  const nedP = await mk('Ned', { email: null });
  await join_(nedP, h3.id, 'PRIMARY_CONTACT');
  const eveP = await mk('Eve');
  const eveM = await join_(eveP, h3.id, 'PARTNER');
  await item(eveP, 'trifle');

  // H4 — S2: Gus (texted, holds nothing, no child), Hal (salad).
  const h4 = await hh();
  const gusP = await mk('Gus', { email: null, phoneNumber: gusPhone });
  await join_(gusP, h4.id, 'PRIMARY_CONTACT');
  const halP = await mk('Hal');
  await join_(halP, h4.id, 'PARTNER');
  await item(halP, 'salad');

  // H5 — its contact is the host (ruling A2): Ivy (gravy), Ian (rolls).
  const h5 = await hh({ contactPersonEventId: kateMembership.id });
  const ivyP = await mk('Ivy');
  await join_(ivyP, h5.id, 'PRIMARY_CONTACT');
  await item(ivyP, 'gravy');
  const ianP = await mk('Ian');
  await join_(ianP, h5.id, 'PARTNER');
  await item(ianP, 'rolls');

  // H6 — its contact lives in another household (Eve, in H3): Kim (wine), Kai (cups).
  const h6 = await hh({ contactPersonEventId: eveM.id });
  const kimP = await mk('Kim');
  await join_(kimP, h6.id, 'PRIMARY_CONTACT');
  await item(kimP, 'wine');
  const kaiP = await mk('Kai');
  await join_(kaiP, h6.id, 'PARTNER');
  await item(kaiP, 'cups');

  // ── C — readAskPreview.
  const pv: any = await preview.readAskPreview(prisma as any, event.id, BASE);
  const rec = (p: { id: string }) => pv?.recipients.find((r: any) => r.personId === p.id);
  const listOf = (p: { id: string }) => rec(p)?.household;
  const names = (l: any) => (Array.isArray(l) ? l.map((h: any) => h.firstName) : null);
  const allLists = () => (pv?.recipients ?? []).map((r: any) => r.household);
  const noneListed = (first: string) =>
    allLists().every((l: any) => Array.isArray(l) && !l.some((h: any) => h.firstName === first));

  assert(
    'C',
    "C1 Jo's list is Lee, Ross, Sam and Zed, in name order, each with their rows",
    ok(() => {
      const l = listOf(joP);
      return (
        JSON.stringify(names(l)) === JSON.stringify(['Lee', 'Ross', 'Sam', 'Zed']) &&
        JSON.stringify(l.map((h: any) => [h.itemNames, h.jobNames])) ===
          JSON.stringify([
            [['ham'], []],
            [['cabbage'], []],
            [[], ['dishes']],
            [['ice'], []],
          ])
      );
    })
  );
  assert(
    'C',
    "C2 S6: Lee (no email or mobile) is on your list as today, and on Jo's",
    ok(
      () =>
        pv.hostList.some((h: any) => h.personId === leeP.id && h.why === 'NO_CHANNEL') &&
        names(listOf(joP)).includes('Lee')
    )
  );
  assert(
    'C',
    'C3 Pat and Pip (holding nothing) and the children are on no list',
    ['Pat', 'Pip', 'Ollie', 'Poppy'].every(noneListed)
  );
  assert(
    'C',
    "C4 Ross's and Sam's own lists are empty — only the contact is told",
    ok(() => listOf(rossP).length === 0 && listOf(samP).length === 0)
  );
  assert(
    'C',
    "C5 the host's household: nobody lists Dan, and Dan's own list is empty",
    noneListed('Dan') && ok(() => listOf(dan).length === 0)
  );
  assert(
    'C',
    "C6 a switched-off household: Mia's list is empty, and nobody lists Ben",
    ok(() => listOf(miaP).length === 0) && noneListed('Ben')
  );
  assert(
    'C',
    'C7 a contact Gather cannot reach: Eve is still asked directly, and nobody lists her',
    ok(() => rec(eveP)?.channel === 'EMAIL') && noneListed('Eve')
  );
  assert(
    'C',
    'C8 a household whose contact is the host: nobody lists Ivy or Ian',
    noneListed('Ivy') && noneListed('Ian')
  );
  assert(
    'C',
    'C9 S2: Gus holds nothing; his list is Hal, and his message is the itemless one with the list',
    ok(() => {
      const r = APC.composePreview(pv, pv.storedAuthorLine).rows.find(
        (x: any) => x.recipient.personId === gusP.id
      );
      return (
        JSON.stringify(names(listOf(gusP))) === JSON.stringify(['Hal']) &&
        r.ask.text.includes(`Nothing for you to bring.\n${W1}\nHal: bring the salad\n${W3}\n`)
      );
    })
  );
  assert(
    'C',
    "C10 Lee's ham is listed though he declined it — the list never shows an answer",
    ok(() => listOf(joP).find((h: any) => h.firstName === 'Lee').itemNames[0] === 'ham')
  );
  assert(
    'C',
    'C11 "just attending" is never read: Zed (holding the ice) is listed, Pip (nothing) is not',
    ok(() => names(listOf(joP)).includes('Zed') && !names(listOf(joP)).includes('Pip'))
  );
  assert(
    'C',
    "C12 a contact from another household gets that household's list: Eve's is Kai and Kim",
    ok(() => JSON.stringify(names(listOf(eveP))) === JSON.stringify(['Kai', 'Kim']))
  );
  const recipientNames = (pv?.recipients ?? [])
    .map((r: any) => `${r.name.split(' ')[0]}:${r.channel}`)
    .sort();
  assert(
    'C',
    'C13 CONTROL: who is messaged and how, and the host list, are as before',
    JSON.stringify(recipientNames) ===
      JSON.stringify(
        [
          'Ben:EMAIL',
          'Dan:EMAIL',
          'Eve:EMAIL',
          'Gus:TEXT',
          'Hal:EMAIL',
          'Ian:EMAIL',
          'Ivy:EMAIL',
          'Jo:EMAIL',
          'Kai:EMAIL',
          'Kim:EMAIL',
          'Mia:EMAIL',
          'Pat:EMAIL',
          'Pip:EMAIL',
          'Ross:EMAIL',
          'Sam:TEXT',
          'Zed:EMAIL',
        ].sort()
      ) &&
      JSON.stringify((pv?.hostList ?? []).map((h: any) => `${h.name.split(' ')[0]}:${h.why}`)) ===
        JSON.stringify(['Lee:NO_CHANNEL', 'Ned:NO_CHANNEL', 'Poppy:HOST_HOUSEHOLD_CHILD']) &&
      pv?.recipients.find((r: any) => r.personId === joP.id)?.carried.length === 1,
    `${JSON.stringify(recipientNames)} ${JSON.stringify((pv?.hostList ?? []).map((h: any) => h.why))}`
  );

  // Every event on gather_dev, through the walk the drain, the sweep and the board all run.
  const events = await prisma.event.findMany({ select: { id: true } });
  let threw = 0;
  let shapeBad = 0;
  for (const e of events) {
    try {
      const p: any = await preview.readAskPreview(prisma as any, e.id, BASE);
      if (!p) continue;
      APC.composePreview(p, p.storedAuthorLine);
      for (const r of p.recipients) {
        const l = r.household;
        if (
          !Array.isArray(l) ||
          l.some(
            (h: any) =>
              h.personEventId === r.personEventId ||
              typeof h.firstName !== 'string' ||
              h.itemNames.length + h.jobNames.length === 0
          )
        )
          shapeBad++;
      }
    } catch {
      threw++;
    }
  }
  assert(
    'C',
    `C14a CONTROL: every event's preview and messages compose without throwing (${events.length} events)`,
    threw === 0,
    `${threw} threw`
  );
  assert(
    'C',
    'C14b every recipient on every event has a household list, never naming herself or an empty-handed adult',
    threw === 0 && shapeBad === 0,
    `${shapeBad} recipient(s) without a well-formed list`
  );

  // ── D — the pre-flight.
  const rows: any[] = ok(() => !!pv) ? APC.composePreview(pv, pv.storedAuthorLine).rows : [];
  const row = (p: { id: string }) => rows.find((r) => r.recipient.personId === p.id);
  assert(
    'D',
    "D1 Jo's message, by email, carries her whole list",
    ok(() =>
      row(joP).ask.text.includes(
        `${W1}\nLee: bring the ham\nRoss: bring the cabbage\nSam: do the dishes\nZed: bring the ice\n${W3}\n`
      )
    )
  );
  assert(
    'D',
    "D2 Gus's text, as it will be sent, carries his list, and its parts are counted over it",
    ok(
      () =>
        row(gusP).textAsSent.includes('Hal: bring the salad') &&
        row(gusP).textAsSent.endsWith(`\n${LINE}`) &&
        row(gusP).segments === NT.getMessageInfo(row(gusP).textAsSent).segments
    )
  );
  assert(
    'D',
    'D3 "the longest text runs to N" counts a text with its list',
    ok(() => {
      const c = APC.composePreview(pv, pv.storedAuthorLine);
      const texted = c.rows.filter((r: any) => r.segments !== null);
      return (
        c.longestText === Math.max(...texted.map((r: any) => r.segments)) &&
        texted.some((r: any) => r.textAsSent.includes(W1))
      );
    })
  );
  const page = codeOnly(read('src/app/plan/[eventId]/pre-flight/page.tsx'));
  assert(
    'D',
    'D4 the pre-flight renders W5 from the module, for a recipient with a list',
    /TOLD_ABOUT_LABEL/.test(page) &&
      /toldAboutValue\(/.test(page) &&
      /recipient\.household/.test(page)
  );
  assert(
    'D',
    'D5 W5\'s value for Jo: "Lee, Ross, Sam, Zed"',
    ok(() => APC.toldAboutValue(row(joP).recipient.household) === 'Lee, Ross, Sam, Zed')
  );

  // ── E — one drain, guarded as test:reply-board's is.
  const outside = { eventId: { notIn: created.events } };
  const drainableElsewhere = await prisma.outboundMessage.count({
    where: {
      ...outside,
      OR: [{ attemptedAt: null, withheldAt: null }, { nextAttemptAt: { not: null, lte: now } }],
    },
  });
  assert(
    'E',
    `E0 SAFETY PRECONDITION: nothing outside this fixture is drainable (${drainableElsewhere})`,
    drainableElsewhere === 0
  );
  if (drainableElsewhere !== 0) {
    assert('E', 'the drain was NOT driven — the precondition failed', false);
    return;
  }
  const pressed: any = await press.pressSend(prisma as any, {
    eventId: event.id,
    actor: { id: kate.id, kind: 'HOST', name: kate.name } as any,
    baseUrl: BASE,
  });
  refuseEmailTo = joP.email;
  texts.length = 0;
  emails.length = 0;
  await dispatch.drainOnce(prisma as any, 50, now);

  const emailTo = (p: { email: string | null }) => emails.filter((m) => m.to === p.email);
  const textTo = (p: { phoneNumber: string | null }) => texts.filter((t) => t.to === p.phoneNumber);
  assert(
    'E',
    'E1 the email the drain handed over for Jo carries her whole list',
    ok(() =>
      emailTo(joP)[0].body.includes(
        `${W1}\nLee: bring the ham\nRoss: bring the cabbage\nSam: do the dishes\nZed: bring the ice\n${W3}\n`
      )
    )
  );
  assert(
    'E',
    'E2 the text the drain handed over for Gus carries his whole list, then the opt-out line',
    ok(
      () =>
        textTo(gusP)[0].message.includes(`${W1}\nHal: bring the salad\n${W3}\n`) &&
        textTo(gusP)[0].message.endsWith(`\n${LINE}`)
    )
  );
  assert(
    'E',
    "E3 CONTROL: Ross's own message carries no list",
    ok(() => emailTo(rossP).length === 1 && !emailTo(rossP)[0].body.includes(W1))
  );
  const askRows = await prisma.outboundMessage.count({ where: { eventId: event.id, kind: 'ASK' } });
  assert(
    'E',
    'E4 CONTROL: one row per person the press decided about, one message per recipient, nothing extra',
    pressed?.ok === true &&
      pressed.recipientCount === 16 &&
      askRows === 18 &&
      emails.length === 14 &&
      texts.length === 2 &&
      (await prisma.outboundMessage.count({
        where: { eventId: event.id, kind: { not: 'ASK' } },
      })) === 0,
    `press ${pressed?.ok} ${pressed?.recipientCount}, rows ${askRows}, emails ${emails.length}, texts ${texts.length}`
  );

  // Q10 — "Send it again", through the resend door's own composition. `readDoor` reads only.
  const door: any = await resend.readDoor(prisma as any, {
    eventId: event.id,
    personId: joP.id,
    baseUrl: BASE,
  });
  assert(
    'E',
    "E5 CONTROL: Jo's email was refused, so the resend door opens for her",
    door?.ok === true && door.view.reason === 'NOT_DELIVERED',
    JSON.stringify(door?.code ?? door?.view?.reason)
  );
  assert(
    'E',
    'E6 Q10: the message "Send it again" would send Jo carries her list',
    ok(() =>
      door.view.message.text.includes(
        `${W1}\nLee: bring the ham\nRoss: bring the cabbage\nSam: do the dishes\nZed: bring the ice\n${W3}\n`
      )
    )
  );
  assert(
    'E',
    'E7 CONTROL: the reminder composer takes no household (S4 — the list is at the send only)',
    (() => {
      const src = codeOnly(read('src/lib/messages/chase-register.ts'));
      return src.length > 0 && !/household/i.test(src);
    })()
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
  const ev = { in: created.events };
  // Every row below hangs off this run's own events or people; nothing else is touched.
  await del(() => prisma.outboundMessage.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.inviteEvent.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.event.deleteMany({ where: { id: ev } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  const totalsBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  try {
    runWords();
    runCompose();
    runChooser();
    runPrivacy();
    runBoundary();
    await layer('C-D-E', runDatabase);
  } finally {
    await cleanup();
    const totalsAfter = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
    const left =
      (await prisma.person.count({ where: { id: { in: created.people } } })) +
      (await prisma.event.count({ where: { id: { in: created.events } } }));
    assert(
      'Z',
      `Z1 CONTROL: every fixture removed by id, and the OutboundMessage and InviteEvent totals as found (${totalsBefore} -> ${totalsAfter})`,
      left === 0 && JSON.stringify(totalsBefore) === JSON.stringify(totalsAfter)
    );
    await prisma.$disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (red.length > 0) console.log(`RED:\n${red.map((r) => `  ${r}`).join('\n')}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
