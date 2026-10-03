/**
 * GTC-341 — THE FOOTER'S CONTACT LINE.
 *
 * Run: npm run test:email-contact-line
 *
 * ── WHAT THIS SUITE HOLDS ─────────────────────────────────────────────────────
 *
 * [[GTC-296]] ruling 7, re-ruled 2026-09-29 and amended the same day: the last line of every
 * guest-bound email gives Gather's contact address, and no guest email carries a postal
 * address. The words were ruled at GTC-341's plan. Ruling 6 stands: sign-in mail carries no
 * footer.
 *
 * ⚠ THE FOUR KINDS OF GUEST EMAIL ARE COMPOSED THROUGH THEIR REAL SENDERS, NOT THROUGH THE
 * FOOTER FUNCTION ALONE. Today all four reach the footer by one path (`guestEmailParts` in
 * `src/lib/email.ts`). A suite that only called `guestEmailFooter` would stay green the day a
 * fifth path composed its own tail.
 *
 * ⚠ EVERY EXPORT IS READ THROUGH THE MODULE NAMESPACE, so at RED (before the exports exist)
 * each assertion fails by name instead of the suite crashing at its first import.
 *
 * ── NOTHING IS SENT ───────────────────────────────────────────────────────────
 *
 * `liveBehindTrap` raises the walls, and this suite's own `globalThis.fetch` stub captures
 * each composed payload. The only row written is the welcome email's own MagicLink, tagged
 * `GTC341` and removed in `finally`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { liveBehindTrap } from './helpers/provider-trap';

const prisma = new PrismaClient();
const TAG = 'GTC341';
const ROOT = join(__dirname, '..');

/** The ruled words, verbatim (GTC-341, ruled at the plan 2026-09-29). */
const RULED_ADDRESS = 'hello@gatheringtogether.co.nz';
const RULED_LINE = `Contact Gather: ${RULED_ADDRESS}`;

/** The placeholder at 7602e99, verbatim. No guest email may carry it. */
const OLD_PLACEHOLDER = '[Gather — registered postal address to be confirmed before launch]';

/** Postal-address wording in any form this ruling excludes. */
const POSTAL_WORDING = /postal|registered|P\.?\s?O\.?\s?Box|to be confirmed|\[Gather/i;

// Built by concatenation so this file does not itself name them (layer D greps tests/).
const OLD_NAMES = ['GATHER_' + 'POSTAL_ADDRESS', 'POSTAL_ADDRESS_' + 'IS_PLACEHOLDER'];
const OLD_ANCHOR = 'ANCHOR(' + 'GTC-296)';

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

function lastLine(text: unknown): string | undefined {
  return typeof text === 'string' ? text.split('\n').at(-1) : undefined;
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// ── LAYER A — the module. Pure. ─────────────────────────────────────────────
async function runModuleLayer() {
  const footer = (await import('../src/lib/email-footer')) as Record<string, unknown>;
  const guestEmailFooter = footer.guestEmailFooter as (url: string) => string;

  assert(
    'A',
    `GATHER_CONTACT_EMAIL is exactly ${RULED_ADDRESS}`,
    footer.GATHER_CONTACT_EMAIL === RULED_ADDRESS
  );
  assert(
    'A',
    `GATHER_CONTACT_LINE is exactly the ruled words: "${RULED_LINE}"`,
    footer.GATHER_CONTACT_LINE === RULED_LINE
  );
  assert(
    'A',
    'GATHER_CONTACT_LINE carries GATHER_CONTACT_EMAIL',
    typeof footer.GATHER_CONTACT_LINE === 'string' &&
      typeof footer.GATHER_CONTACT_EMAIL === 'string' &&
      (footer.GATHER_CONTACT_LINE as string).includes(footer.GATHER_CONTACT_EMAIL as string)
  );

  const pageUrl = 'https://example.test/unsubscribe/abc.def';
  const text = guestEmailFooter(pageUrl);
  const lines = text.split('\n');

  assert('A', "the footer's last line is the contact line", lines.at(-1) === RULED_LINE);
  assert('A', 'one blank line sits above the contact line', lines.at(-2) === '');
  assert('A', 'the contact line appears exactly once', occurrences(text, RULED_LINE) === 1);
  assert(
    'A',
    'the unsubscribe line keeps its place above the blank',
    lines.at(-3) === `${footer.UNSUBSCRIBE_INVITATION} ${pageUrl}`
  );
  for (const name of OLD_NAMES) {
    assert('A', `the module no longer exports ${name}`, !(name in footer));
  }
  assert('A', 'the footer carries no postal-address wording', !POSTAL_WORDING.test(text));
}

// ── LAYERS B and C — the composed emails. `fetch` stubbed. ──────────────────
async function runSenderLayers() {
  const email = await import('../src/lib/email');
  const wrapUp = await import('../src/lib/sms/wrap-up-templates');

  process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || `${TAG}-secret`;
  // `new Resend(undefined)` throws; a syntactically valid sentinel lets the client construct.
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_gtc341_sentinel_key';
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

  const hostVoiced = {
    to: 'guest@example.test',
    replyTo: 'host@example.test',
    fromName: 'Alice',
    personId: 'p-341',
    eventId: 'e-341',
  };
  const thanks = wrapUp.buildEmailWrapUpMessage({
    guestFirstName: 'Kim',
    eventName: 'Christmas Lunch',
    hostFirstName: 'Alice',
    guestTaskItem: 'a salad',
  });

  // The four kinds of guest email, each through its real sender.
  const kinds: Array<[string, string, () => Promise<unknown>]> = [
    [
      'the ask (sendAskEmail)',
      'Would you bring a salad?',
      () =>
        email.sendAskEmail({
          ...hostVoiced,
          subject: 'An ask',
          body: 'Would you bring a salad?',
        }),
    ],
    [
      "the chase's email leg (sendChaseEmail)",
      'A reminder about the salad.',
      () =>
        email.sendChaseEmail({
          ...hostVoiced,
          subject: 'A reminder',
          body: 'A reminder about the salad.',
        }),
    ],
    [
      'the by-hand nudge (sendNudgeEmail)',
      'Just checking in.',
      () =>
        email.sendNudgeEmail({
          to: 'guest@example.test',
          subject: 'Reminder about Christmas Lunch',
          body: 'Just checking in.',
          eventId: 'e-341',
          personId: 'p-341',
        }),
    ],
    [
      'the wrap-up thank-you (sendNudgeEmail + buildEmailWrapUpMessage)',
      thanks.body,
      () =>
        email.sendNudgeEmail({
          to: 'guest@example.test',
          subject: thanks.subject,
          body: thanks.body,
          eventId: 'e-341',
          personId: 'p-341',
        }),
    ],
  ];

  try {
    for (const [label, body, send] of kinds) {
      sent.length = 0;
      await send();
      const text = sent[0]?.text;
      assert('B', `${label}: composed exactly one payload`, sent.length === 1);
      assert('B', `${label}: its last line is the contact line`, lastLine(text) === RULED_LINE);
      assert(
        'B',
        `${label}: its body survives the footer`,
        typeof text === 'string' && text.startsWith(body)
      );
      assert(
        'B',
        `${label}: it carries no placeholder`,
        typeof text === 'string' && !text.includes(OLD_PLACEHOLDER)
      );
      assert(
        'B',
        `${label}: it carries no postal-address wording`,
        typeof text === 'string' && !POSTAL_WORDING.test(text)
      );
    }

    // ── LAYER C — ruling 6: sign-in mail carries no footer. ──────────────────
    sent.length = 0;
    await email.sendMagicLinkEmail('user@example.test', `${TAG}-token`);
    const magic = sent[0] ?? {};
    assert('C', 'sendMagicLinkEmail composed a payload', typeof magic.text === 'string');
    assert(
      'C',
      'sendMagicLinkEmail carries no contact line',
      typeof magic.text === 'string' && !magic.text.includes(RULED_LINE)
    );
    assert(
      'C',
      'sendMagicLinkEmail carries no contact address',
      typeof magic.text === 'string' && !magic.text.includes(RULED_ADDRESS)
    );
    assert(
      'C',
      'sendMagicLinkEmail carries no unsubscribe link',
      typeof magic.text === 'string' && !magic.text.includes('/unsubscribe/')
    );
    assert('C', 'sendMagicLinkEmail carries no headers', magic.headers === undefined);

    sent.length = 0;
    const welcomeTo = `${TAG.toLowerCase()}-welcome@example.test`;
    try {
      await email.sendWelcomeEmail(welcomeTo, 'Christmas Lunch', 'e-341');
    } finally {
      await prisma.magicLink.deleteMany({ where: { email: welcomeTo } });
    }
    const welcome = sent[0] ?? {};
    assert('C', 'sendWelcomeEmail composed a payload', typeof welcome.html === 'string');
    assert(
      'C',
      'sendWelcomeEmail carries no contact line',
      typeof welcome.html === 'string' && !welcome.html.includes(RULED_LINE)
    );
    assert(
      'C',
      'sendWelcomeEmail carries no contact address',
      typeof welcome.html === 'string' && !welcome.html.includes(RULED_ADDRESS)
    );
    assert(
      'C',
      'sendWelcomeEmail carries no unsubscribe link',
      typeof welcome.html === 'string' && !welcome.html.includes('/unsubscribe/')
    );
    assert('C', 'sendWelcomeEmail carries no headers', welcome.headers === undefined);
  } finally {
    globalThis.fetch = realFetch;
  }

  // The claim-account email is sent inline by a Zone 2 route, which this suite reads and
  // does not drive: a sign-in link, so ruling 6 reaches it (ruled at GTC-341's plan).
  const claim = read('src/app/api/auth/claim/route.ts');
  assert(
    'C',
    'the claim-account email route does not import the footer module',
    !claim.includes('email-footer')
  );
  assert(
    'C',
    'the claim-account email route carries no contact address',
    !claim.includes(RULED_ADDRESS)
  );
}

// ── LAYER D — one place. Reads the tree. ────────────────────────────────────
async function runOnePlaceLayer() {
  const srcFiles = walk(join(ROOT, 'src'));
  const testFiles = walk(join(ROOT, 'tests'));

  const holders = srcFiles
    .map((f) => [f.slice(ROOT.length + 1), occurrences(readFileSync(f, 'utf8'), RULED_ADDRESS)])
    .filter(([, n]) => (n as number) > 0) as Array<[string, number]>;
  assert(
    'D',
    `the address appears exactly once under src/, in src/lib/email-footer.ts (found: ${
      holders.map(([f, n]) => `${f}×${n}`).join(', ') || 'none'
    })`,
    holders.length === 1 && holders[0][0] === 'src/lib/email-footer.ts' && holders[0][1] === 1
  );

  for (const name of OLD_NAMES) {
    const namers = [...srcFiles, ...testFiles]
      .filter((f) => readFileSync(f, 'utf8').includes(name))
      .map((f) => f.slice(ROOT.length + 1));
    assert(
      'D',
      `${name} is named nowhere in src/ or tests/ (found: ${namers.join(', ') || 'none'})`,
      namers.length === 0
    );
  }

  const anchored = srcFiles
    .filter((f) => readFileSync(f, 'utf8').includes(OLD_ANCHOR))
    .map((f) => f.slice(ROOT.length + 1));
  assert(
    'D',
    `${OLD_ANCHOR} is gone from src/ (found: ${anchored.join(', ') || 'none'})`,
    anchored.length === 0
  );
}

async function main() {
  liveBehindTrap(); // [[GTC-274]] the gate opened for this process only, behind the trap
  const layers: Array<[string, () => Promise<void>]> = [
    ['A', runModuleLayer],
    ['B/C', runSenderLayers],
    ['D', runOnePlaceLayer],
  ];
  for (const [name, fn] of layers) {
    try {
      await fn();
    } catch (err) {
      assert(name, `layer ran to completion (threw: ${(err as Error)?.message ?? err})`, false);
    }
  }
}

main()
  .catch((err) => {
    console.error('\x1b[31mSUITE CRASHED\x1b[0m', err);
    failed++;
    redAssertions.push(`suite crashed: ${err?.message ?? err}`);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(`\nGTC-341: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.error('\nRED:');
      for (const r of redAssertions) console.error(`  ${r}`);
      process.exit(1);
    }
    process.exit(0);
  });
