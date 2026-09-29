/**
 * GTC-296 — EVERY EMAIL CARRIES A WAY OUT. The per-event email opt-out.
 *
 * Run: npm run test:email-opt-out
 *
 * ── WHAT THIS SUITE HOLDS ─────────────────────────────────────────────────────
 *
 * Ruling Q of [[GTC-189]], scoped 2026-09-20 with seven rulings and corrected the
 * same day with seven more (GTC-296's *CORRECTIONS* section). The assertions below
 * are the ticket's Acceptance list in its own order, with the corrections applied.
 *
 * ⚠ THE OPT-OUT IS A FACT THE CHOOSER READS, NOT A CHECK BOLTED ONTO FOUR SENDERS.
 * That is the one design decision to read first, and most of this suite is shaped by
 * it: `askChannelOf` and `chaseChannelOf` in `src/lib/eligibility/channel-chooser.ts`
 * refuse, and the pre-flight, the press, the drain and the mini-send inherit the
 * refusal because all four already run through `readAskPreview`. A suite that tested
 * four senders separately would pass while the screen and the row disagreed, which is
 * the drift `ask-preview.ts` records GTC-294 catching in that very module.
 *
 * ── NOTHING IS SENT ───────────────────────────────────────────────────────────
 *
 * Layer G stubs `globalThis.fetch`, so no request leaves the process. No layer drives
 * a provider. Rows created here are tagged `GTC296` and removed in `finally`.
 */

import { PrismaClient } from '@prisma/client';
import { liveBehindTrap } from './helpers/provider-trap';

const prisma = new PrismaClient();

const TAG = 'GTC296';

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

function assertThrows(phase: string, label: string, fn: () => unknown) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(phase, label, threw);
}

// The secret this suite signs with. Set before any import that reads it — the token
// module reads `process.env` at CALL time, not at import time, precisely so a caller
// (and this suite) can change it without re-importing.
const TEST_SECRET = 'gtc296-suite-secret-not-a-real-key';

async function runTokenAndFooterLayers() {
  // ── LAYER A — the token. Pure, no database. ────────────────────────────────
  //
  // ⚠ NEITHER SIGNED NOR ONE-SHOT WAS TRUE OF THE GUEST-LINK TOKENS THE TICKET
  // POINTED AT, and correction R5 is what this layer is built against:
  // `generateToken` in `src/lib/tokens.ts` makes 32 random bytes stored as an
  // `AccessToken` row — Do-Not-Touch Zone 3. This is a different instrument.
  const tokenMod = await import('../src/lib/unsubscribe-token');

  process.env.UNSUBSCRIBE_TOKEN_SECRET = TEST_SECRET;

  const t1 = tokenMod.mintUnsubscribeToken('person-1', 'event-1');
  const readBack = tokenMod.readUnsubscribeToken(t1);
  assert(
    'A',
    'a minted token reads back as the pair it was minted for',
    readBack?.personId === 'person-1' && readBack?.eventId === 'event-1'
  );

  assert(
    'A',
    'the token is URL-safe — no +, / or = to be mangled in a mail client',
    /^[A-Za-z0-9._-]+$/.test(t1)
  );

  const t2 = tokenMod.mintUnsubscribeToken('person-1', 'event-2');
  assert('A', 'a different event mints a different token — ruling 1 is per event', t1 !== t2);

  assert(
    'A',
    'minting is deterministic, so the same link in two emails is one link',
    tokenMod.mintUnsubscribeToken('person-1', 'event-1') === t1
  );

  // Tamper: flip the payload and keep the signature.
  const [payload, sig] = t1.split('.');
  const forgedPayload = Buffer.from('person-9:event-1').toString('base64url');
  assert(
    'A',
    'a forged payload with a stolen signature is refused',
    tokenMod.readUnsubscribeToken(`${forgedPayload}.${sig}`) === null
  );
  assert(
    'A',
    'a truncated signature is refused rather than throwing',
    tokenMod.readUnsubscribeToken(`${payload}.${sig.slice(0, 8)}`) === null
  );
  assert(
    'A',
    'garbage is refused rather than throwing',
    tokenMod.readUnsubscribeToken('not-a-token') === null
  );
  assert('A', 'an empty token is refused', tokenMod.readUnsubscribeToken('') === null);

  // ⚠ A SIGNATURE MADE WITH A DIFFERENT SECRET MUST NOT VERIFY. Without this the
  // whole instrument is decoration: the payload is plain base64url and anybody can
  // write one.
  process.env.UNSUBSCRIBE_TOKEN_SECRET = 'a-different-secret';
  assert(
    'A',
    'a token signed with another secret does not verify',
    tokenMod.readUnsubscribeToken(t1) === null
  );

  // FAILS CLOSED, following GTC-270's precedent for CRON_SECRET: an unset secret
  // refuses every caller rather than admitting them.
  delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
  assertThrows('A', 'minting with no secret configured THROWS rather than signing with ""', () =>
    tokenMod.mintUnsubscribeToken('person-1', 'event-1')
  );
  assert(
    'A',
    'reading with no secret configured returns null, never a pair',
    tokenMod.readUnsubscribeToken(t1) === null
  );

  process.env.UNSUBSCRIBE_TOKEN_SECRET = TEST_SECRET;

  // ⚠ NO EXPIRY. A way out that stops working is not a way out (R5). Asserted by
  // the SHAPE of the payload rather than by waiting: there is no timestamp in it.
  assert(
    'A',
    'the payload carries no expiry field to lapse',
    Buffer.from(t1.split('.')[0], 'base64url').toString() === 'person-1:event-1'
  );

  // ── LAYER B — the footer and the two headers. Pure. ────────────────────────
  const footer = await import('../src/lib/email-footer');

  const pageUrl = 'https://example.test/unsubscribe/abc.def';
  const oneClickUrl = 'https://example.test/api/unsubscribe/abc.def';
  const footerText = footer.guestEmailFooter(pageUrl);

  assert(
    'B',
    'the footer carries a visible unsubscribe link (ruling 2, the body half)',
    footerText.includes(pageUrl)
  );
  // [[GTC-341]]: ruling 7 as re-ruled 2026-09-29 — a contact email, not a postal address.
  // The words were ruled at GTC-341's plan; `tests/email-contact-line-test.ts` pins them.
  assert(
    'B',
    "the footer's last line is Gather's contact line from the one constant (ruling 7)",
    footerText.split('\n').at(-1) === footer.GATHER_CONTACT_LINE
  );
  assert(
    'B',
    'the contact line is a single config constant, not a literal in the footer text',
    footerText.split(footer.GATHER_CONTACT_LINE).length === 2
  );

  // ⚠ THE PLACEHOLDER'S END IS ASSERTED, NOT ONLY THE NEW LINE'S PRESENCE. Until
  // [[GTC-341]] this asserted the placeholder flag was still set, a state the re-ruling
  // ends; its successor holds that the placeholder is gone.
  assert(
    'B',
    'the footer carries no postal-address placeholder',
    !footerText.includes('registered postal address') && !footerText.includes('[Gather')
  );

  const headers = footer.listUnsubscribeHeaders(oneClickUrl);
  assert(
    'B',
    'List-Unsubscribe is present and angle-bracketed per RFC 2369',
    headers['List-Unsubscribe'] === `<${oneClickUrl}>`
  );
  assert(
    'B',
    "List-Unsubscribe-Post carries RFC 8058's exact one-click value",
    headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click'
  );
  assert(
    'B',
    'the header pair is exactly two headers and invents no third',
    Object.keys(headers).length === 2
  );
}

// ── LAYER C — the check itself. Database. ────────────────────────────────────
async function runCheckLayer() {
  const optOutMod = await import('../src/lib/eligibility/email-opt-out');

  assert(
    'C',
    'getEmailOptOut returns null for a pair with no row',
    (await optOutMod.getEmailOptOut(`${TAG}-nobody`, `${TAG}-nowhere`)) === null
  );

  console.log('\n(layers C, H, I, K and L build rows — see the fixture below)\n');

  await withFixture(async (fx) => {
    // The row exists for (person, event A) and not for (person, event B).
    await prisma.emailOptOut.create({
      data: { personId: fx.personId, eventId: fx.eventAId, token: fx.tokenA },
    });

    const hit = await optOutMod.getEmailOptOut(fx.personId, fx.eventAId);
    assert('C', 'getEmailOptOut returns the row when one exists', hit !== null);
    assert(
      'C',
      'the row it returns is the one asked for',
      hit?.personId === fx.personId && hit?.eventId === fx.eventAId
    );
    assert('C', 'the token that did it is recorded on the row', hit?.token === fx.tokenA);

    // ⚠ THE CROSS-EVENT ASSERTION IS THE ONE THAT PROVES RULING 1. Per-host storage
    // would pass every other assertion in this layer and fail this one.
    assert(
      'C',
      'NO CROSS-EVENT LEAK — the same person is not opted out of event B',
      (await optOutMod.getEmailOptOut(fx.personId, fx.eventBId)) === null
    );

    const setA = await optOutMod.listEmailOptOutsForEvent(prisma, fx.eventAId);
    const setB = await optOutMod.listEmailOptOutsForEvent(prisma, fx.eventBId);
    assert('C', 'the bulk read finds the person on event A', setA.has(fx.personId));
    assert('C', 'the bulk read does not find them on event B', !setB.has(fx.personId));
    assert(
      'C',
      'emailOptedOutFact reads the set the chooser is built from',
      optOutMod.emailOptedOutFact(fx.personId, setA) &&
        !optOutMod.emailOptedOutFact(fx.personId, setB)
    );
  });
}

/**
 * ⚠ EVERY LAYER RUNS EVEN WHEN AN EARLIER ONE THROWS, AND THAT IS FOR THE RED RUN.
 * At RED the modules under test do not exist, so an unguarded `await` would take the
 * suite down at the first missing import and report one failure for a ticket with
 * fourteen acceptance bullets. Guarded, the RED run names every bullet it fails.
 */
async function main() {
  liveBehindTrap(); // [[GTC-274]] the gate opened for this process only, behind the trap
  const layers: Array<[string, () => Promise<void>]> = [
    ['A/B', runTokenAndFooterLayers],
    ['C', runCheckLayer],
    ['D/E/F', runPureLayers],
    ['G', runSenderLayer],
    ['H/I/K/L', runDatabaseLayers],
    ['M', runStructuralLayer],
  ];
  for (const [name, fn] of layers) {
    try {
      await fn();
    } catch (err) {
      assert(name, `layer ran to completion (threw: ${(err as Error)?.message ?? err})`, false);
    }
  }
}

// ── LAYER D — the chooser, and layers E and F, the vocabulary. All pure. ─────
async function runPureLayers() {
  const chooser = await import('../src/lib/eligibility/channel-chooser');
  const compose = await import('../src/lib/preflight/ask-preview-compose');
  const strip = await import('../src/components/glance/strip');
  const dispatch = await import('../src/lib/press/dispatch');
  const deliveryFact = await import('../src/lib/glance/delivery-fact');
  const optOutMod = await import('../src/lib/eligibility/email-opt-out');

  type Person = Record<string, unknown>;
  const mk = (person: Person, over: Record<string, unknown> = {}) =>
    ({
      id: 'pe-1',
      personId: 'p-1',
      role: 'PARTICIPANT',
      householdId: null,
      householdRole: null,
      nudgeMark: null,
      holdsItems: true,
      // [[GTC-311]]: follows the event default — the chase chooser now requires the field.
      chaseException: null,
      person,
      ...over,
    }) as never;
  const ev = (memberships: unknown[]) =>
    ({ hostId: 'host-1', memberships, households: [], chaseWhenNoMobileDefault: null }) as never;

  const reachable = {
    email: 'guest@example.test',
    phoneNumber: '+64211234567',
    smsOptedOut: false,
  };

  // Baseline: without the fact, the chooser behaves exactly as slice 1 built it.
  const plain = mk({ ...reachable, emailOptedOut: false });
  assert(
    'D',
    'CONTROL — a reachable person is still a DIRECT email ask',
    (chooser.chooseAskRoute(plain, ev([plain])) as { kind: string; channel?: string }).kind ===
      'DIRECT'
  );

  const optedOut = mk({ ...reachable, emailOptedOut: true });
  const askRoute = chooser.chooseAskRoute(optedOut, ev([optedOut])) as {
    kind: string;
    why?: string;
  };

  // ⚠ R1 — REFUSE, DO NOT FALL TO TEXT. This person holds a perfectly usable +64
  // number, and the ask still refuses. Falling to text would be the "silently keeps
  // sending on a different channel" pattern [[GTC-324]] was raised against, and the
  // number in this fixture is what makes the assertion mean something.
  assert(
    'D',
    'R1 — the ask REFUSES for an email opt-out and lands on the host list',
    askRoute.kind === 'HOST_LIST'
  );
  assert(
    'D',
    'R1 — it refuses with EMAIL_OPTED_OUT, not with a borrowed why',
    askRoute.why === 'EMAIL_OPTED_OUT'
  );

  const chaseRoute = chooser.chooseChaseRoute(optedOut, ev([optedOut])) as {
    kind: string;
    why?: string;
  };
  // ⚠ RULING 3 — CHASE-WIDE. The chase prefers TEXT, so this is the assertion that
  // proves an email no reaches the text chase rather than only the email one.
  assert(
    'D',
    'ruling 3 — the chase sends NOTHING on any channel for an email opt-out',
    chaseRoute.kind === 'NONE'
  );
  assert(
    'D',
    'ruling 3 — the chase refusal carries the same why-code',
    chaseRoute.why === 'EMAIL_OPTED_OUT'
  );

  // ⚠ THE ORDER, ASSERTED THE WAY `nudge-cadence-controls-test.ts` asserts the SMS
  // one: give the subject BOTH conditions and check which reason comes back.
  // Correction R2 puts the email opt-out BELOW Zone 7's line and above the mark, so
  // Zone 7 wins this report — the outcome is a refusal either way.
  const both = mk({
    email: 'g@example.test',
    phoneNumber: '+64211234567',
    smsOptedOut: true,
    emailOptedOut: true,
  });
  assert(
    'D',
    'R2 — Zone 7 keeps the top: an SMS opt-out is the reported why when both hold',
    (chooser.chooseChaseRoute(both, ev([both])) as { why?: string }).why === 'SMS_OPTED_OUT'
  );

  const marked = mk({ ...reachable, emailOptedOut: true }, { nudgeMark: 'DONT_CHASE' });
  assert(
    'D',
    "the email opt-out outranks the host's don't-chase mark in the report",
    (chooser.chooseChaseRoute(marked, ev([marked])) as { why?: string }).why === 'EMAIL_OPTED_OUT'
  );

  // ── LAYER E — the words. R7's three landing points. ───────────────────────
  assert(
    'E',
    "EMAIL_OPTED_OUT_WHY_LINE is ruling 3's sentence, verbatim",
    optOutMod.EMAIL_OPTED_OUT_WHY_LINE ===
      'chose not to receive email about this event; not chased on any channel.'
  );

  const adultLine = compose.hostListReason({
    why: 'EMAIL_OPTED_OUT',
    child: false,
    carrierName: null,
  } as never);
  // A child with no named carrier falls to `CHILD_WHY` rather than to the carrier
  // sentence, which is the entry R7 asks for.
  const childLine = compose.hostListReason({
    why: 'EMAIL_OPTED_OUT',
    child: true,
    carrierName: null,
  } as never);
  assert('E', 'ADULT_WHY has words for EMAIL_OPTED_OUT', !!adultLine && adultLine.length > 0);
  assert(
    'E',
    'CHILD_WHY has its own words for EMAIL_OPTED_OUT',
    !!childLine && childLine.length > 0 && childLine !== adultLine
  );
  assert(
    'E',
    "the adult line stays in the screen's 'I' register (no 'we', no 'Gather says')",
    !/\bwe\b/i.test(adultLine) && !/\bGather\b/.test(adultLine)
  );

  // ⚠ THE 16-CHARACTER PIN IS WHY THE TICKET'S ORIGINAL PLAN COULD NOT WORK. Ruling
  // 3's sentence is 70 characters; every strip line is held to 16 by
  // `tests/glance-grid-test.tsx`, from the reference's 160px columns. R7 splits them.
  // Driven through the real `whyLineFor`, so the assertion fails if the reason is
  // missing from `WHY_PRECEDENCE` as well as if it is missing from `WHY_LINES`.
  const stripLine = strip.whyLineFor({
    state: 'RED',
    reasons: ['EMAIL_OPTED_OUT'],
    items: [],
  } as never);
  assert('E', 'WHY_LINES has a short line for EMAIL_OPTED_OUT', typeof stripLine === 'string');
  assert(
    'E',
    'the strip line fits the 16-character pin every other why-line is held to',
    typeof stripLine === 'string' && stripLine.length <= 16
  );
  // ⚠ AND IT MUST NOT READ AS "HAS NO EMAIL ADDRESS", which is NO_CHANNEL's meaning
  // and is FALSE of somebody holding a live address they just unsubscribed from.
  assert('E', 'the strip line does not claim the person has no address', stripLine !== 'no email');

  // ── LAYER F — the withheld code. ──────────────────────────────────────────
  assert(
    'F',
    'EMAIL_OPTED_OUT is a member of OutboundWithheldWhy',
    Object.prototype.hasOwnProperty.call(dispatch.WITHHELD_WHY_IS_TERMINAL, 'EMAIL_OPTED_OUT')
  );
  assert(
    'F',
    'and it is terminal — there is nothing to retry, nothing was attempted',
    (dispatch.WITHHELD_WHY_IS_TERMINAL as Record<string, true>).EMAIL_OPTED_OUT === true
  );

  // ⚠ R6 — MAPS TO NULL, AND THE null IS THE RULING. 'UNREACHABLE' renders "nowhere
  // to send", which is false of somebody holding a live address; a sixth red family
  // would hand slice 7b's door a "send it again" button pointed at the person who
  // just unsubscribed. The cost — the strip reads amber with nothing saying why — is
  // filed as its own ticket rather than folded in here.
  assert(
    'F',
    'R6 — WITHHELD_MEANS_UNREACHABLE maps EMAIL_OPTED_OUT to null',
    Object.prototype.hasOwnProperty.call(
      deliveryFact.WITHHELD_MEANS_UNREACHABLE,
      'EMAIL_OPTED_OUT'
    ) &&
      (deliveryFact.WITHHELD_MEANS_UNREACHABLE as Record<string, unknown>).EMAIL_OPTED_OUT === null
  );
  assert(
    'F',
    'so a withheld row for it produces no delivery failure on the board',
    deliveryFact.deliveryFactFrom({
      personEventId: 'pe-1',
      createdAt: new Date(),
      rejectedAt: null,
      withheldAt: new Date(),
      withheldWhy: 'EMAIL_OPTED_OUT',
      deliveryState: null,
    }).failure === null
  );
}

// ── LAYER G — the two guest senders and the two account senders. ────────────
//
// ⚠ THE PAYLOAD IS INSPECTED, NOT THE OUTCOME. Every send in this environment fails
// ([[GTC-247]]: the Resend key does not authenticate), so asserting on `success`
// would prove nothing about what was composed. The stub captures the request body
// and the assertions read it — which is also the only way to see a HEADER.
async function runSenderLayer() {
  const email = await import('../src/lib/email');
  const footer = await import('../src/lib/email-footer');

  process.env.UNSUBSCRIBE_TOKEN_SECRET = TEST_SECRET;
  // `new Resend(undefined)` THROWS, and a suite that let it throw would go green
  // against the unfixed tree — `tests/email-send-result-test.ts` records that trap.
  // A syntactically valid sentinel lets the client construct; the stub does the rest.
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_gtc296_sentinel_key';
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const realFetch = globalThis.fetch;
  const sent: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    try {
      sent.push(JSON.parse(init?.body ?? '{}'));
    } catch {
      sent.push({});
    }
    return new Response(JSON.stringify({ id: `${TAG}-stub` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    sent.length = 0;
    await email.sendAskEmail({
      to: 'guest@example.test',
      subject: 'An ask',
      body: 'Would you bring a salad?',
      replyTo: 'host@example.test',
      fromName: 'Alice',
      personId: 'p-ask',
      eventId: 'e-ask',
    } as never);
    const ask = sent[0] ?? {};
    const askHeaders = (ask.headers ?? {}) as Record<string, string>;

    assert(
      'G',
      'sendAskEmail carries the List-Unsubscribe header',
      typeof askHeaders['List-Unsubscribe'] === 'string' &&
        askHeaders['List-Unsubscribe'].includes('/api/unsubscribe/')
    );
    assert(
      'G',
      'sendAskEmail carries List-Unsubscribe-Post for RFC 8058 one-click',
      askHeaders['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click'
    );
    assert(
      'G',
      'sendAskEmail carries a VISIBLE body link — ruling 2 is both, not either',
      typeof ask.text === 'string' && (ask.text as string).includes('/unsubscribe/')
    );
    assert(
      'G',
      "sendAskEmail's footer ends with the contact line (ruling 7, UEMA, re-ruled)",
      typeof ask.text === 'string' &&
        (ask.text as string).split('\n').at(-1) === footer.GATHER_CONTACT_LINE
    );
    assert(
      'G',
      'the ask body itself survives the footer being appended',
      typeof ask.text === 'string' && (ask.text as string).includes('Would you bring a salad?')
    );

    sent.length = 0;
    await email.sendNudgeEmail({
      to: 'guest@example.test',
      subject: 'A nudge',
      body: 'Just checking in.',
      eventId: 'e-nudge',
      personId: 'p-nudge',
    });
    const nudge = sent[0] ?? {};
    const nudgeHeaders = (nudge.headers ?? {}) as Record<string, string>;
    assert(
      'G',
      'sendNudgeEmail carries the List-Unsubscribe header',
      typeof nudgeHeaders['List-Unsubscribe'] === 'string'
    );
    assert(
      'G',
      'sendNudgeEmail carries List-Unsubscribe-Post',
      nudgeHeaders['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click'
    );
    assert(
      'G',
      'sendNudgeEmail carries a visible body link',
      typeof nudge.text === 'string' && (nudge.text as string).includes('/unsubscribe/')
    );
    assert(
      'G',
      "sendNudgeEmail's footer ends with the contact line",
      typeof nudge.text === 'string' &&
        (nudge.text as string).split('\n').at(-1) === footer.GATHER_CONTACT_LINE
    );

    // ⚠ RULING 6 — THE TWO ACCOUNT SENDERS ARE EXEMPT, AND THE EXEMPTION IS
    // ASSERTED RATHER THAN ASSUMED. They are direct responses to something the
    // account holder just did, which is the same reading commercial-mail law gives
    // "transactional" mail. A magic link that carried an unsubscribe would offer to
    // switch off the only way back in.
    sent.length = 0;
    await email.sendMagicLinkEmail('user@example.test', `${TAG}-token`);
    const magic = sent[0] ?? {};
    assert(
      'G',
      'ruling 6 — sendMagicLinkEmail composes NO List-Unsubscribe header',
      magic.headers === undefined
    );
    assert(
      'G',
      'ruling 6 — sendMagicLinkEmail composes no unsubscribe link',
      typeof magic.text === 'string' && !(magic.text as string).includes('/unsubscribe/')
    );
    assert(
      'G',
      'ruling 6 — sendMagicLinkEmail composes no contact line and no contact address',
      typeof magic.text === 'string' &&
        !(magic.text as string).includes(footer.GATHER_CONTACT_LINE) &&
        !(magic.text as string).includes(footer.GATHER_CONTACT_EMAIL)
    );

    // `sendWelcomeEmail` writes a MagicLink row, so it is driven inside the fixture
    // and its row is cleaned up there.
    await withFixture(async (fx) => {
      // The person is opted out of EVERY event that exists, which is the condition
      // the acceptance bullet names — and the two account senders still compose
      // unchanged, because they never read the table.
      await prisma.emailOptOut.createMany({
        data: [
          { personId: fx.personId, eventId: fx.eventAId },
          { personId: fx.personId, eventId: fx.eventBId },
        ],
        skipDuplicates: true,
      });
      sent.length = 0;
      await email.sendWelcomeEmail(`${TAG}-welcome@example.test`, 'An event', fx.eventAId);
      const welcome = sent[0] ?? {};
      assert(
        'G',
        'ruling 6 — sendWelcomeEmail composes NO List-Unsubscribe header',
        welcome.headers === undefined
      );
      assert(
        'G',
        'ruling 6 — sendWelcomeEmail composes no unsubscribe link',
        typeof welcome.html === 'string' && !(welcome.html as string).includes('/unsubscribe/')
      );
      assert(
        'G',
        'ruling 6 — sendWelcomeEmail composes no contact line and no contact address',
        typeof welcome.html === 'string' &&
          !(welcome.html as string).includes(footer.GATHER_CONTACT_LINE) &&
          !(welcome.html as string).includes(footer.GATHER_CONTACT_EMAIL)
      );
    });
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── THE FIXTURE ─────────────────────────────────────────────────────────────
//
// Two events for one guest, because ruling 1's whole content is that a no to one
// is not a no to the other. A single-event fixture would pass a per-host
// implementation.
interface Fixture {
  userId: string;
  hostId: string;
  personId: string;
  lateId: string;
  /**
   * ⚠ A SECOND RECIPIENT ON EVENT A WHO IS NOT OPTED OUT, AND THE FIRST GREEN RUN IS WHY.
   * With the opted-out guest as the only participant, `askRowPopulation` returns an empty
   * addressed set and `pressSend` refuses the whole event with `NO_RECIPIENTS` — so no rows
   * are written at all and the host-list assertions fail for a reason that has nothing to do
   * with this ticket. A board with exactly one guest, who has unsubscribed, is also not the
   * shape the ticket is about.
   */
  otherId: string;
  /** Her address, so a payload assertion can say WHOSE message was or was not sent. */
  guestEmail: string;
  eventAId: string;
  eventBId: string;
  peAId: string;
  tokenA: string;
}

const created = {
  optOuts: [] as string[],
  wrapUpLinks: [] as string[],
  outbound: [] as string[],
  assignments: [] as string[],
  items: [] as string[],
  teams: [] as string[],
  personEvents: [] as string[],
  tokens: [] as string[],
  inviteEvents: [] as string[],
  auditEntries: [] as string[],
  eventRoles: [] as string[],
  events: [] as string[],
  people: [] as string[],
  users: [] as string[],
  magicLinks: [] as string[],
};

async function withFixture(body: (fx: Fixture) => Promise<void>): Promise<void> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.create({ data: { email: `${TAG}+${stamp}@example.test` } });
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
  // ⚠ THE GUEST HOLDS A USABLE +64 NUMBER ON PURPOSE. R1 says the ask REFUSES
  // rather than falling to text, and an unreachable-by-text guest would let a
  // fall-to-text implementation pass every assertion below.
  const guest = await mkPerson('Guest', { phoneNumber: '+64211234567' });
  const late = await mkPerson('Late', { phoneNumber: '+64211234568' });
  const other = await mkPerson('Other');

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
    const role = await prisma.eventRole.create({
      data: { eventId: e.id, userId: user.id, role: 'HOST' },
    });
    created.eventRoles.push(role.id);
    const hostPe = await prisma.personEvent.create({
      data: { personId: host.id, eventId: e.id, role: 'HOST' },
    });
    created.personEvents.push(hostPe.id);
    const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: e.id } });
    created.teams.push(team.id);
    return { event: e, team };
  };

  const addRecipient = async (
    eventId: string,
    teamId: string,
    person: { id: string; name: string }
  ) => {
    const pe = await prisma.personEvent.create({
      data: { personId: person.id, eventId, role: 'PARTICIPANT' },
    });
    created.personEvents.push(pe.id);
    const item = await prisma.item.create({
      data: { name: `${TAG} dish`, teamId, status: 'ASSIGNED' },
    });
    created.items.push(item.id);
    const a = await prisma.assignment.create({
      data: { itemId: item.id, personId: person.id, response: 'PENDING' },
    });
    created.assignments.push(a.id);
    return pe;
  };

  const a = await mkEvent('event A');
  const b = await mkEvent('event B');
  const peA = await addRecipient(a.event.id, a.team.id, guest);
  await addRecipient(b.event.id, b.team.id, guest);
  await addRecipient(a.event.id, a.team.id, other);

  const tokenMod = await import('../src/lib/unsubscribe-token');
  process.env.UNSUBSCRIBE_TOKEN_SECRET = TEST_SECRET;
  let tokenA = '';
  try {
    tokenA = tokenMod.mintUnsubscribeToken(guest.id, a.event.id);
  } catch {
    // RED: the module does not exist yet. The layers that need it fail on their own
    // assertions rather than taking the suite down here.
    tokenA = 'unmintable';
  }

  await body({
    userId: user.id,
    hostId: host.id,
    personId: guest.id,
    lateId: late.id,
    otherId: other.id,
    guestEmail: guest.email!,
    eventAId: a.event.id,
    eventBId: b.event.id,
    peAId: peA.id,
    tokenA,
  });
}

// ── LAYERS H, I, K, L — the wiring points, against the database. ────────────
async function runDatabaseLayers() {
  process.env.UNSUBSCRIBE_TOKEN_SECRET = TEST_SECRET;
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_gtc296_sentinel_key';

  const askPreview = await import('../src/lib/preflight/ask-preview');
  const press = await import('../src/lib/press/press');
  const dispatch = await import('../src/lib/press/dispatch');
  const wrapUp = await import('../src/lib/wrap-up');
  const nudgeEligibility = await import('../src/lib/sms/nudge-eligibility');

  const realFetch = globalThis.fetch;
  /*
   * ⚠ WHO WAS SENT TO, NOT HOW MANY SENDS HAPPENED, AND THE FIRST GREEN RUN IS WHY.
   *
   * This started as a counter, and the assertion under it read *"the provider was never called
   * FOR HER"* while the measurement read *"the provider was never called"*. The moment the
   * fixture gained a second recipient — which it had to, or the press refuses the whole event —
   * the counter saw HIS ask go out and the assertion failed, correctly, for a claim it was
   * never making. A label about one person needs a measurement about that person.
   */
  let resendTo: string[] = [];
  const stub = () => {
    resendTo = [];
    globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
      if (String(url).includes('resend')) {
        try {
          const body = JSON.parse(init?.body ?? '{}') as { to?: string | string[] };
          resendTo.push(...[body.to ?? []].flat());
        } catch {
          resendTo.push('(unparseable)');
        }
      }
      return new Response(JSON.stringify({ id: `${TAG}-stub` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
  };

  // ── H — the pre-flight, the press, the mini-send and the drain. ──────────
  await withFixture(async (fx) => {
    await prisma.emailOptOut.create({
      data: { personId: fx.personId, eventId: fx.eventAId, token: fx.tokenA },
    });

    const preview = await askPreview.readAskPreview(prisma, fx.eventAId, 'http://localhost:3000');
    const line = preview?.hostList.find((l) => l.personId === fx.personId);
    assert('H', 'the PRE-FLIGHT shows the host the opted-out guest on her list', !!line);
    assert('H', 'and names the reason as EMAIL_OPTED_OUT', line?.why === 'EMAIL_OPTED_OUT');
    assert(
      'H',
      'the opted-out guest is NOT in the recipients the press would message',
      !preview?.recipients.some((r) => r.personId === fx.personId)
    );

    // The same guest on event B is untouched — ruling 1, end to end rather than in
    // the chooser alone.
    const previewB = await askPreview.readAskPreview(prisma, fx.eventBId, 'http://localhost:3000');
    assert(
      'H',
      'ruling 1 end to end — on event B the same guest is still a recipient',
      !!previewB?.recipients.some((r) => r.personId === fx.personId)
    );

    stub();
    try {
      const pressed = await press.pressSend(prisma, {
        eventId: fx.eventAId,
        actor: { id: fx.hostId, kind: 'HOST' as const, name: `${TAG} Host` },
        baseUrl: 'http://localhost:3000',
      });
      // ⚠ READ `ok`, NOT TRUTHINESS. A refusal is an object too, and the first green run had
      // this assertion passing on a `NO_RECIPIENTS` refusal while every assertion under it
      // failed — the press had written nothing because there was nobody left to send to.
      assert('H', 'the press accepts the event', (pressed as { ok?: boolean }).ok === true);

      const rows = await prisma.outboundMessage.findMany({ where: { eventId: fx.eventAId } });
      rows.forEach((r) => created.outbound.push(r.id));
      const mine = rows.find((r) => r.personEventId === fx.peAId);
      assert(
        'H',
        'the press writes ONE row for the opted-out guest — a decision about her',
        !!mine
      );
      assert(
        'H',
        'born withheld, with no channel',
        !!mine && mine.withheldAt !== null && mine.channel === null
      );
      assert(
        'H',
        'carrying EMAIL_OPTED_OUT as the withheld why',
        mine?.withheldWhy === 'EMAIL_OPTED_OUT'
      );

      // ⚠ THE MINI-SEND PATH — the one press path that can hit this (R1). A late
      // arrival who unsubscribed on an earlier membership is added back, and the
      // sweep must not enrol them.
      await prisma.emailOptOut.create({
        data: { personId: fx.lateId, eventId: fx.eventAId },
      });
      const team = await prisma.team.findFirst({ where: { eventId: fx.eventAId } });
      const latePe = await prisma.personEvent.create({
        data: { personId: fx.lateId, eventId: fx.eventAId, role: 'PARTICIPANT' },
      });
      created.personEvents.push(latePe.id);
      const lateItem = await prisma.item.create({
        data: { name: `${TAG} late dish`, teamId: team!.id, status: 'ASSIGNED' },
      });
      created.items.push(lateItem.id);
      const lateAssignment = await prisma.assignment.create({
        data: { itemId: lateItem.id, personId: fx.lateId, response: 'PENDING' },
      });
      created.assignments.push(lateAssignment.id);

      await dispatch.enrolMiniSends(prisma, 50);
      const lateRows = await prisma.outboundMessage.findMany({
        where: { personEventId: latePe.id },
      });
      lateRows.forEach((r) => created.outbound.push(r.id));
      assert(
        'H',
        'R1 — the mini-send does NOT enrol a late arrival who unsubscribed',
        !lateRows.some((r) => r.withheldAt === null)
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // ── H2 — the drain window: somebody who unsubscribes AFTER the press. ────
  await withFixture(async (fx) => {
    stub();
    try {
      await press.pressSend(prisma, {
        eventId: fx.eventAId,
        actor: { id: fx.hostId, kind: 'HOST' as const, name: `${TAG} Host` },
        baseUrl: 'http://localhost:3000',
      });
      const before = await prisma.outboundMessage.findMany({ where: { eventId: fx.eventAId } });
      before.forEach((r) => created.outbound.push(r.id));
      const mine = before.find((r) => r.personEventId === fx.peAId);
      assert(
        'H2',
        'CONTROL — with no opt-out the press writes a live EMAIL row for her',
        !!mine && mine.withheldAt === null && mine.channel === 'EMAIL'
      );

      // She unsubscribes in the window between the press and the drain.
      await prisma.emailOptOut.create({
        data: { personId: fx.personId, eventId: fx.eventAId },
      });
      await dispatch.drainOnce(prisma, 50);
      const after = await prisma.outboundMessage.findUnique({ where: { id: mine!.id } });
      assert(
        'H2',
        'the drain re-runs the chooser and WITHHOLDS rather than sending',
        after?.withheldAt !== null
      );
      assert(
        'H2',
        "with the chooser's own why, not a generic one",
        after?.withheldWhy === 'EMAIL_OPTED_OUT'
      );
      assert(
        'H2',
        'and the provider was never called for HER address',
        !resendTo.includes(fx.guestEmail)
      );
      // The control that keeps the assertion above honest: the OTHER recipient's ask did go
      // out on the same tick, so "never called for her" is a statement about her and not
      // about a drain that did nothing.
      assert(
        'H2',
        'CONTROL — the un-opted-out recipient on the same event WAS sent to',
        resendTo.length > 0
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // ── I — the three automatic chase finders (R2, R2b). ─────────────────────
  await withFixture(async (fx) => {
    // Make her a real, due chase candidate: sent ten days ago, a participant token,
    // a usable number, no marks. Without all of that the finder skips her for a
    // reason that has nothing to do with this ticket and the assertion proves nothing.
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    /*
     * ⚠ BOTH CLOCKS, AND THE FIRST GREEN RUN IS WHY. `findNudgeCandidates` filters on
     * `event: SENT_AND_LIVE(now)`, which reads `Event.sentAt`, and separately on
     * `PersonEvent.sentAt`. Setting only the membership's left her outside the SQL entirely —
     * `skipped` came back EMPTY, which is the tell: a person the query never returned cannot
     * be skipped for a reason.
     */
    await prisma.event.update({ where: { id: fx.eventAId }, data: { sentAt: tenDaysAgo } });
    await prisma.personEvent.update({ where: { id: fx.peAId }, data: { sentAt: tenDaysAgo } });
    const tok = await prisma.accessToken.create({
      data: {
        token: `${TAG}-participant-${Date.now()}`,
        scope: 'PARTICIPANT',
        personId: fx.personId,
        eventId: fx.eventAId,
      },
    });
    created.tokens.push(tok.id);

    const control = await nudgeEligibility.findNudgeCandidates(new Date());
    const inControl = [...control.eligibleFirst, ...control.eligibleSecond].some(
      (c) => c.personId === fx.personId
    );
    if (!inControl) {
      // The control failing means the FIXTURE is wrong, not the code — and without the
      // reasons the next reader has to rebuild the whole ladder to find out which rung.
      console.error('    control skipped:', JSON.stringify(control.skipped));
    }
    assert('I', 'CONTROL — without an opt-out she IS a live chase candidate today', inControl);

    await prisma.emailOptOut.create({
      data: { personId: fx.personId, eventId: fx.eventAId },
    });
    const gated = await nudgeEligibility.findNudgeCandidates(new Date());
    const stillThere = [...gated.eligibleFirst, ...gated.eligibleSecond].some(
      (c) => c.personId === fx.personId
    );
    // ⚠ R2 — THE TEXT CHASE THAT RUNS TODAY. Ruling 3 says an email no stops the
    // chase on EVERY channel, and the chase that exists today is SMS-only. Without
    // this gate a guest who unsubscribes from email goes on being texted.
    assert('I', 'R2 — findNudgeCandidates drops her once the email opt-out exists', !stillThere);
    const optOutMod = await import('../src/lib/eligibility/email-opt-out');
    assert(
      'I',
      'and it records a SKIP rather than dropping her silently',
      gated.skipped.some((s) => s.reason === optOutMod.EMAIL_OPT_OUT_SKIP_REASON)
    );
  });

  // ── K — the wrap-up thank-you (ruling 5 as corrected by R3). ─────────────
  await withFixture(async (fx) => {
    await prisma.emailOptOut.create({
      data: { personId: fx.personId, eventId: fx.eventAId },
    });
    /*
     * ⚠ THE AGE IS RELATIVE TO THE `now` THE DISPATCHER IS GIVEN, NOT TO THE WALL CLOCK, AND
     * THE FIRST GREEN RUN IS WHY. `dispatchPendingWrapUpMessages` filters on
     * `createdAt <= now - DISPATCH_DELAY_MINUTES`. A row stamped an hour before the REAL now
     * is still in the future relative to a fixed 10:00 `now`, so the batch was empty and every
     * assertion under it failed for a reason that had nothing to do with this ticket.
     */
    // 10:00 NZ — outside quiet hours, so the batch is not deferred for an unrelated reason.
    const noon = new Date();
    noon.setHours(10, 0, 0, 0);
    const old = new Date(noon.getTime() - 60 * 60 * 1000);
    const mkLink = async (channel: string, personId: string) => {
      const l = await prisma.wrapUpLink.create({
        data: {
          token: `${TAG}-wrap-${channel}-${Date.now()}-${Math.random()}`,
          eventId: fx.eventAId,
          personId,
          guestName: `${TAG} Guest`,
          guestEmail: `${TAG.toLowerCase()}-wrap@example.test`,
          guestPhone: '+64211234567',
          channel,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdAt: old,
        },
      });
      created.wrapUpLinks.push(l.id);
      return l;
    };
    const emailLink = await mkLink('email', fx.personId);

    stub();
    try {
      const result = (await wrapUp.dispatchPendingWrapUpMessages(noon)) as Record<string, number>;
      const after = await prisma.wrapUpLink.findUnique({ where: { id: emailLink.id } });
      assert(
        'K',
        'ruling 5 — the wrap-up EMAIL leg does not send for an opted-out guest',
        resendTo.length === 0
      );
      assert(
        'K',
        'the link is closed out rather than left to retry forever',
        after?.dispatched === true
      );
      assert('K', 'and it is NOT recorded as a failure — nothing failed', after?.failed === false);
      assert(
        'K',
        'the dispatcher reports the suppression rather than hiding it',
        typeof result.suppressed === 'number' && result.suppressed >= 1
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // ── L — the route. ───────────────────────────────────────────────────────
  await withFixture(async (fx) => {
    const route = await import('../src/app/api/unsubscribe/[token]/route');
    const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
    const post = (token: string) =>
      route.POST(
        new Request(`http://localhost:3000/api/unsubscribe/${token}`, { method: 'POST' }) as never,
        ctx(token) as never
      );

    const bad = await post('not-a-real-token');
    assert('L', 'an invalid token returns 404, never a write', bad.status === 404);
    assert(
      'L',
      'and wrote nothing',
      (await prisma.emailOptOut.count({ where: { personId: fx.personId } })) === 0
    );

    const first = await post(fx.tokenA);
    assert('L', 'a valid token returns 200', first.status === 200);
    assert(
      'L',
      'and writes exactly one row',
      (await prisma.emailOptOut.count({
        where: { personId: fx.personId, eventId: fx.eventAId },
      })) === 1
    );
    const row = await prisma.emailOptOut.findFirst({ where: { personId: fx.personId } });
    assert('L', 'recording which token did it', row?.token === fx.tokenA);

    // ⚠ IDEMPOTENT, AND RULING 2 IS WHY IT HAS TO BE. A one-click header is POSTed
    // by the mail client, which may retry; a second row would break the unique and
    // 500 at the person who is trying to leave.
    const replay = await post(fx.tokenA);
    assert('L', 'a replay returns 200 rather than erroring', replay.status === 200);
    assert(
      'L',
      'and writes nothing new',
      (await prisma.emailOptOut.count({
        where: { personId: fx.personId, eventId: fx.eventAId },
      })) === 1
    );
    const after = await prisma.emailOptOut.findFirst({ where: { personId: fx.personId } });
    assert(
      'L',
      'and does not move the original timestamp',
      after?.optedOutAt.getTime() === row?.optedOutAt.getTime()
    );

    // The confirm page's words — ruling 1's specimen sentence, adapted.
    const words = await import('../src/lib/eligibility/email-opt-out');
    const sentence = words.unsubscribeConfirmSentence({
      hostFirstName: 'Alice',
      eventName: 'Christmas Lunch',
    });
    assert(
      'L',
      "the confirm sentence matches ruling 1's specimen exactly",
      sentence ===
        "Confirm: you'll stop receiving emails about Alice's Christmas Lunch. " +
          'Alice can still email you about other events.'
    );
  });
}

// ── LAYER M — structure. What a behavioural assertion cannot see. ───────────
async function runStructuralLayer() {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const ROOT = join(__dirname, '..');
  const read = (rel: string) =>
    existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '';

  // The house order, written down where the next reader of the SMS gate will find it.
  const nudgeMark = read('src/lib/eligibility/nudge-mark.ts');
  assert(
    'M',
    "nudge-mark.ts's comment stack names the new module as the layer above it",
    nudgeMark.includes('email-opt-out')
  );
  assert('M', 'and names the ticket that put it there', nudgeMark.includes('GTC-296'));

  // ⚠ ZONE 7, AS GATHER-BUILD-CONSTANTS DEFINES IT — the `SmsOptOut` model, the
  // `Person.smsOptedOut` column, and the two opt-out modules by association. NOT the
  // whole of `src/lib/sms/`, which correction R2 reworded because `findNudgeCandidates`
  // lives there and ruling 3 reaches it.
  const zone7Files = ['src/lib/sms/opt-out-service.ts', 'src/lib/sms/opt-out-keywords.ts'];
  for (const f of zone7Files) {
    const diff = execFileSync('git', ['diff', '--stat', 'HEAD', '--', f], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    assert('M', `Zone 7 untouched — ${f} is unchanged against HEAD`, diff === '');
  }
  const schemaDiff = execFileSync('git', ['diff', '-U0', 'HEAD', '--', 'prisma/schema.prisma'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  // ⚠ COMMENT LINES ARE EXCLUDED DELIBERATELY, AND THE FIRST RED RUN IS WHY. The new
  // model's own docstring NAMES `Person.smsOptedOut` — to say the zone is not widened —
  // and a naive `/^[+-].*smsOptedOut/` read that as a change to the column. An assertion
  // that fires on prose about a thing rather than on the thing is a false red, and this
  // one fired on the sentence explaining that it should not.
  const schemaCodeChanges = schemaDiff
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^[+-]{3}/.test(l))
    .filter((l) => !/^[+-]\s*(\/\/|\/\/\/)/.test(l));
  assert(
    'M',
    'Zone 7 untouched — no schema LINE changes `smsOptedOut`',
    !schemaCodeChanges.some((l) => l.includes('smsOptedOut'))
  );
  assert(
    'M',
    'Zone 7 untouched — the SmsOptOut model is not edited',
    !schemaCodeChanges.some((l) => l.includes('model SmsOptOut'))
  );
  // Zone 2 and Zone 3, named by the ticket's Do-not-touch list.
  const tokensFile = execFileSync('git', ['diff', '--stat', 'HEAD', '--', 'src/lib/tokens.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  assert('M', 'Zone 3 untouched — src/lib/tokens.ts is unchanged', tokensFile === '');

  // The public handler is visible to the security scanner, which walks src/app/api only.
  assert(
    'M',
    'the POST handler lives under src/app/api so the route scanner can see it',
    existsSync(join(ROOT, 'src/app/api/unsubscribe/[token]/route.ts'))
  );
  assert(
    'M',
    'the confirm page lives at /unsubscribe/<token>',
    existsSync(join(ROOT, 'src/app/unsubscribe/[token]/page.tsx'))
  );
  const classifications = read('route-classifications.json');
  assert(
    'M',
    'and it is classified in route-classifications.json',
    classifications.includes('/api/unsubscribe/[token]')
  );

  // The new secret is documented in both places an operator looks.
  assert(
    'M',
    'UNSUBSCRIBE_TOKEN_SECRET is in .env.example',
    read('.env.example').includes('UNSUBSCRIBE_TOKEN_SECRET')
  );
  assert(
    'M',
    "and in GATHER-BUILD-CONSTANTS.md's environment table",
    read('GATHER-BUILD-CONSTANTS.md').includes('UNSUBSCRIBE_TOKEN_SECRET')
  );

  // ⚠ THE PLACEHOLDER CARRIED THE TICKET THAT ENDED IT, AND [[GTC-341]] ENDED IT. An
  // anchor outliving its ticket's condition points a reader at a state that is gone
  // (BUG-TICKET-TEMPLATE.md, Citations: delete it when the ticket that owns it closes).
  const footerSrc = read('src/lib/email-footer.ts');
  assert(
    'M',
    "the placeholder's ANCHOR is gone with the placeholder (GTC-341)",
    !footerSrc.includes('ANCHOR(' + 'GTC-296)')
  );
}

// ── Teardown ────────────────────────────────────────────────────────────────
main()
  .catch((err) => {
    console.error('\x1b[31mSUITE CRASHED\x1b[0m', err);
    failed++;
    redAssertions.push(`suite crashed: ${err?.message ?? err}`);
  })
  .finally(async () => {
    try {
      const del = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch (e) {
          console.error('cleanup step failed:', (e as Error).message);
        }
      };
      await del(() =>
        prisma.emailOptOut.deleteMany({ where: { eventId: { in: created.events } } })
      );
      await del(() => prisma.wrapUpLink.deleteMany({ where: { id: { in: created.wrapUpLinks } } }));
      await del(() =>
        prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } })
      );
      await del(() => prisma.assignment.deleteMany({ where: { id: { in: created.assignments } } }));
      await del(() => prisma.item.deleteMany({ where: { id: { in: created.items } } }));
      await del(() =>
        prisma.inviteEvent.deleteMany({ where: { eventId: { in: created.events } } })
      );
      await del(() => prisma.auditEntry.deleteMany({ where: { eventId: { in: created.events } } }));
      await del(() =>
        prisma.nudgeLog.deleteMany({ where: { personEventId: { in: created.personEvents } } })
      );
      await del(() =>
        prisma.personEvent.deleteMany({ where: { id: { in: created.personEvents } } })
      );
      await del(() => prisma.team.deleteMany({ where: { id: { in: created.teams } } }));
      await del(() =>
        prisma.accessToken.deleteMany({ where: { eventId: { in: created.events } } })
      );
      await del(() => prisma.eventRole.deleteMany({ where: { id: { in: created.eventRoles } } }));
      await del(() => prisma.event.deleteMany({ where: { id: { in: created.events } } }));
      await del(() => prisma.magicLink.deleteMany({ where: { email: { contains: TAG } } }));
      await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
      await del(() => prisma.session.deleteMany({ where: { userId: { in: created.users } } }));
      await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));

      // ⚠ THE TEARDOWN IS VERIFIED, NOT ASSUMED. A suite that writes rows into
      // `gather_dev` and half-cleans them leaves the next measurement wrong.
      const leftovers = await prisma.person.count({ where: { name: { startsWith: TAG } } });
      assert('Z', 'teardown left no tagged rows behind', leftovers === 0);
    } catch (cleanupErr) {
      console.error('\x1b[31mTEARDOWN FAILED — rows may remain:\x1b[0m', cleanupErr);
      failed++;
    }
    await prisma.$disconnect();

    console.log('\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m');
    console.log(`Total tests: ${passed + failed}`);
    console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
    console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
    if (failed > 0) {
      console.log('\n\x1b[31mRED:\x1b[0m');
      redAssertions.forEach((a) => console.log(`  ${a}`));
    }
    process.exit(failed > 0 ? 1 : 0);
  });
