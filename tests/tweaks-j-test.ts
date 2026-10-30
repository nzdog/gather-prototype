/**
 * [[GTC-428]] — TWEAKS J: THE DESIGNED GUEST EMAILS (tweaks 8 and 14).
 *
 * Founder rulings, 30 Oct 2026 (in the ticket, verbatim). The guest emails (the invitation, the
 * reminder, the decide-by follow-up, the nudge and the wrap-up thank-you) and the host's own test
 * gain an html part built by src/lib/email-design.ts; the plain text, the headers, from, reply-to
 * and subject are byte for byte what they were at 541cd44 (GitHub's main when this began).
 *
 * LAYERS
 *   P  the payloads: each sender, with fetch stubbed, sends exactly the hand-written text,
 *      headers, from, reply-to and subject, plus an html part; the account senders unchanged
 *   B  the button: the last word as a button and the copy-link line, the same link in both; no
 *      button when the last word is not one safe link
 *   L  the list (the invitation only): 1 dish, 3 dishes, 2 dishes and a job, a job only; none for
 *      an itemless guest, unmatched names, a sentence found twice, or no names; a carried child's
 *      sentences and the household list lines untouched
 *   E  escaping: names with <, >, &, quotes and a script tag
 *   S  email-safe: tables, inline styles, 600px, no image, script, style sheet or fetch, every
 *      link one of the email's own
 *   F  the footer: the same words and both links, small and grey
 *   T  the host's test: a box that links nowhere, the stand-ins as they are, no real link
 *   W  the thank-you: designed, no button
 *   U  the files: the code commit changed exactly this ticket's four files, on Part 0's tip;
 *      email.ts holds five send calls and its three protected functions as at 541cd44
 *
 * SAFETY. No dev server, no browser. fetch is stubbed and the live gate opened only through
 * `liveBehindTrap` (tests/helpers/provider-trap.ts), so nothing can leave the process. The only
 * database reads are the senders' own `isDemoEvent` look-ups of made-up event ids (no row, no
 * write). Made-up settings in plain words; no provider key shape anywhere.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { liveBehindTrap, trapCount } from './helpers/provider-trap';

const ROOT = path.join(__dirname, '..');

// ── Settings for this process only, before email.ts is loaded ─────────────────
process.env.NEXT_PUBLIC_APP_URL = 'https://gather.example.test';
process.env.EMAIL_FROM = 'Gather <gather@example.test>';
process.env.UNSUBSCRIBE_TOKEN_SECRET = 'gtc428-made-up-unsubscribe-secret';
process.env.RESEND_API_KEY = 'gtc428-made-up-not-a-provider-key';

// ── Commits ──────────────────────────────────────────────────────────────────
/** GitHub's main when Batch 3 began: a fixed commit. */
const BASE = '541cd44704b9f37d28fd5189f51cc579ea865a90';
/** Part 0's tip, GTC-427's ticket commit: a fixed commit. */
const PART0_TIP = 'e57c4f8';
/** This ticket's code commit: a fixed commit. */
const CODE_J = '1e1c9c3c71105e24bba8310311deb00ad3f30a13';
const SUITE = 'tests/tweaks-j-test.ts';
const NEW_SCRIPT = 'test:tweaks-j';
const NEW_SCRIPT_VALUE = 'tsx tests/tweaks-j-test.ts';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];
const PART0_FILES = [
  'A\tdocs/tickets/GTC-427.md',
  'M\ttests/tweaks-d-test.tsx',
  'M\ttests/tweaks-h-test.tsx',
  'M\ttests/tweaks-i-test.tsx',
];
const CODE_FILES = [
  'A\tsrc/lib/email-design.ts',
  'M\tsrc/lib/email.ts',
  'M\tsrc/lib/preflight/test-email-send.ts',
  'M\tsrc/lib/press/dispatch.ts',
];

// ── Hand-written expectations ────────────────────────────────────────────────
const LINK_ANA = 'https://gather.example.test/p/tok-ana';
const LINK_BEN = 'https://gather.example.test/p/tok-ben';
const TOKEN_ANA =
  'Z3RjNDI4LXBlcnNvbi1hbmE6Z3RjNDI4LWV2ZW50LW9uZQ.kxJJbaFjZCvvLYLnF6v7ShgSuOS_jYhJacoGJwXBH5Y';
const TOKEN_BEN =
  'Z3RjNDI4LXBlcnNvbi1iZW46Z3RjNDI4LWV2ZW50LW9uZQ.vZljQ0eeLKQOuZHO0E3isC7-vEJRNl8gOZQ5ttFO5Pc';
const PAGE_ANA = `https://gather.example.test/unsubscribe/${TOKEN_ANA}`;
const PAGE_BEN = `https://gather.example.test/unsubscribe/${TOKEN_BEN}`;
const FOOTER = (page: string) =>
  `\n\n—\nDon't want emails about this event? ${page}\n\nContact Gather: hello@gatheringtogether.co.nz`;
const HEADERS = (token: string) => ({
  'List-Unsubscribe': `<https://gather.example.test/api/unsubscribe/${token}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});
const AUTHOR = 'Christmas lunch at ours, would love you there.';
const ASK_TEXT =
  "Hi Ana - Christmas lunch at ours, would love you there.\n\nI've got Gather helping me put it together - I'll let Gather take it from here.\n\n" +
  "Hi - Gather here, helping Kate with this one. Would you bring the pavlova and the trifle, and do the dishes? I'll check back if I haven't heard from you. " +
  `One tap to say yes, no or maybe - the details are on the page: ${LINK_ANA}`;
const ASK_SUBJECT = 'Christmas Lunch — from Kate';
const CHASE_TEXT = `Hi Ana - Gather here again, helping Kate with this one. I haven't heard from you yet. One tap to say yes, no or maybe: ${LINK_ANA}`;
const DECIDE_TEXT = `Hi Ana - Gather here, helping Kate with this one. Still good for the pavlova? Kate needs to know by Friday. One tap to let Kate know: ${LINK_ANA}`;
const NUDGE_TEXT = `Hi Ben, just a reminder about Christmas Lunch. Can you let me know? ${LINK_BEN}`;
const THANKS_TEXT =
  'Hi Ben, Kate asked me (Gather — the app they used to organise Christmas Lunch) to pass on a thanks for bringing pavlova. Much appreciated.';
const TEST_TOP =
  "This is a test, sent only to you. It's the email Ana will get when you send, word for word, except that their own links are left out.";
const STAND_IN = "[Ana's own link goes here]";
const STOP_STAND_IN = '[their own link to stop these emails]';
const TEST_TEXT = `${TEST_TOP}\n\n${ASK_TEXT.replace(LINK_ANA, STAND_IN)}${FOOTER(STOP_STAND_IN)}`;
const LEAD_IN = 'Would you take care of these?';
const BUTTON = 'Open your invitation';
const COPY = 'Button not working? Copy this link: ';

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
  } else {
    failed++;
    reds.push(`[${layer}] ${label}`);
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const ok = (f: () => boolean) => {
  try {
    return f();
  } catch {
    return false;
  }
};
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const count = (s: string, needle: string) => (needle === '' ? 0 : s.split(needle).length - 1);
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ── CHECKS: every condition, pure, so each can be tried on a passing and a failing input ─────
export const CHECKS = {
  /** A captured payload equals the expected one, key for key (html checked apart). */
  payload(
    got: Record<string, unknown> | undefined,
    want: Record<string, unknown>,
    html: 'html' | 'no html'
  ): boolean {
    if (!got) return false;
    const { html: h, ...rest } = got;
    const keys = Object.keys(rest).sort().join(',');
    return (
      keys === Object.keys(want).sort().join(',') &&
      Object.entries(want).every(([k, v]) => JSON.stringify(rest[k]) === JSON.stringify(v)) &&
      (html === 'html' ? typeof h === 'string' && h.startsWith('<!DOCTYPE html>') : h === undefined)
    );
  },
  /** The button: one link to `link`, the words, then the copy line with the same link. */
  button(html: string, link: string): boolean {
    const href = `<a href="${esc(link)}" target="_blank"`;
    const at = html.indexOf(href);
    const words = html.indexOf(`>${BUTTON}</a>`, at);
    const copy = html.indexOf(`${esc(COPY)}${esc(link)}</p>`, words);
    return (
      at > 0 &&
      words > at &&
      copy > words &&
      count(html, href) === 1 &&
      count(html, esc(link)) === 2 &&
      count(html, BUTTON) === 1 &&
      count(html, esc(COPY)) === 1
    );
  },
  /** No button and no copy line at all. */
  noButton(html: string): boolean {
    return (
      !html.includes(BUTTON) &&
      !html.includes(esc(COPY)) &&
      !/<a href="(?!mailto:|https:\/\/gather\.example\.test\/unsubscribe\/)/.test(html)
    );
  },
  /** The list: the lead-in, then exactly these bullets in order, the sentence gone. */
  list(html: string, items: string[], sentence: string): boolean {
    const m = /<p style="[^"]*">Would you take care of these\?<\/p><ul[^>]*>([\s\S]*?)<\/ul>/.exec(
      html
    );
    if (!m) return false;
    const lis = [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => x[1]);
    return (
      JSON.stringify(lis) === JSON.stringify(items.map(esc)) &&
      count(html, LEAD_IN) === 1 &&
      count(html, '<ul') === 1 &&
      !html.includes(esc(sentence))
    );
  },
  /** No list: no lead-in, no bullets. */
  noList(html: string): boolean {
    return !html.includes(LEAD_IN) && !html.includes('<ul') && !html.includes('<li');
  },
  /** Every line given is in the html as a whole escaped run, in order. */
  inOrder(html: string, parts: string[]): boolean {
    let from = 0;
    for (const p of parts) {
      const at = html.indexOf(esc(p), from);
      if (at < 0) return false;
      from = at + esc(p).length;
    }
    return true;
  },
  /** Email-safe: no image, script, style sheet, frame, form or fetch; tables; inline styles. */
  safe(html: string): boolean {
    return (
      !/<script|<img|<link|<style|<iframe|<object|<embed|<form|<video|<audio|url\(|@import|\ssrc=|background=|javascript:/i.test(
        html
      ) &&
      /max-width:600px/.test(html) &&
      /<table role="presentation"/.test(html) &&
      /<meta name="color-scheme" content="light">/.test(html) &&
      /<body style="[^"]*background-color:#/.test(html) &&
      !/class="/.test(html)
    );
  },
  /** Every web address and link in the html is one of `allowed` (or the contact mailto). */
  onlyLinks(html: string, allowed: string[]): boolean {
    const urls = [...html.matchAll(/https?:\/\/[^\s"<>]+/g)].map((m) => m[0]);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    const okUrl = (u: string) => allowed.map(esc).includes(u);
    return (
      urls.every(okUrl) &&
      hrefs.every((h) => okUrl(h) || h === 'mailto:hello@gatheringtogether.co.nz')
    );
  },
  /** The footer: the way out as a link on the invitation words, then the contact line. */
  footer(html: string, page: string): boolean {
    const wayOut = `<a href="${esc(page)}" target="_blank" style="color:#6b7280;text-decoration:underline;">Don&#39;t want emails about this event?</a>`;
    const contact =
      'Contact Gather: <a href="mailto:hello@gatheringtogether.co.nz" style="color:#6b7280;text-decoration:underline;">hello@gatheringtogether.co.nz</a>';
    const w = html.indexOf(wayOut);
    return (
      w > 0 &&
      html.indexOf(contact) > w &&
      /font-size:12px;line-height:18px;color:#6b7280;/.test(html)
    );
  },
  /** The span of a function from its first line to its closing `}` at the same indent. */
  spanOf(src: string, start: string): string {
    const lines = src.split('\n');
    const at = lines.map((l, i) => (l.startsWith(start) ? i : -1)).filter((i) => i >= 0);
    if (at.length !== 1) return '';
    for (let j = at[0] + 1; j < lines.length; j++) {
      if (lines[j].startsWith('}')) return lines.slice(at[0], j + 1).join('\n');
    }
    return '';
  },
  /** The same set of lines, none twice. */
  sameList(found: string | null, expected: string[]): boolean {
    if (found === null) return false;
    const a = found.split('\n').filter(Boolean).sort();
    const b = [...expected].sort();
    return a.length === b.length && new Set(a).size === a.length && a.every((x, i) => x === b[i]);
  },
  /** `now` is `base` with exactly `lines` inserted right after the one run `after`. */
  insertedAfter(base: string, now: string, after: string, lines: string[]): boolean {
    return (
      base !== '' && count(base, after) === 1 && now === base.replace(after, after + lines.join(''))
    );
  },
  /** package.json differs by exactly one added line: the new script. */
  oneScriptLine(now: string, before: string): boolean {
    const a = before.split('\n');
    const b = now.split('\n');
    if (b.length !== a.length + 1) return false;
    const i = b.findIndex((l, k) => l !== a[k]);
    return (
      i >= 0 &&
      b[i] === `    "${NEW_SCRIPT}": "${NEW_SCRIPT_VALUE}",` &&
      [...b.slice(0, i), ...b.slice(i + 1)].join('\n') === before
    );
  },
};

// ── The stub ─────────────────────────────────────────────────────────────────
type Body = Record<string, unknown>;
let sent: Body[] = [];
let nonResend = 0;
function stub() {
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    if (String(url).includes('resend')) {
      sent.push(JSON.parse(init?.body ?? '{}'));
      return new Response(JSON.stringify({ id: `gtc428-${sent.length}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    nonResend++;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
}

async function main() {
  const trapBefore = trapCount();
  const close = liveBehindTrap();
  stub();
  const email = await import('../src/lib/email');
  const D = await import('../src/lib/email-design');
  const AR = await import('../src/lib/messages/ask-register');
  const CR = await import('../src/lib/messages/chase-register');
  const DR = await import('../src/lib/messages/decide-by-register');
  const WT = await import('../src/lib/sms/wrap-up-templates');
  const TE = await import('../src/lib/preflight/test-email');
  const OL = await import('../src/lib/sms/opt-out-line');

  const event = { name: 'Christmas Lunch', startDate: new Date('2026-12-25T00:00:00Z') };
  const ask = (
    itemNames: string[],
    jobNames: string[],
    more: { carried?: any[]; household?: any[]; first?: string; link?: string } = {}
  ) =>
    AR.composeAsk({
      event,
      hostName: 'Kate Host',
      storedAuthorLine: AUTHOR,
      recipient: {
        firstName: more.first ?? 'Ana',
        itemNames,
        jobNames,
        carried: more.carried ?? [],
        household: more.household ?? [],
        link: more.link ?? LINK_ANA,
      },
    });
  const guestText = (body: string) => `${body}${FOOTER(PAGE_ANA)}`;
  const design = (body: string, names?: { itemNames?: string[]; jobNames?: string[] }) =>
    D.designGuestEmail(guestText(body), ASK_SUBJECT, names) ?? '';

  // ══ P — the payloads ══════════════════════════════════════════════════════
  section('P — each sender sends the same text, headers, from, reply-to and subject, plus html');
  const a = ask(['pavlova', 'trifle'], ['dishes']);
  assert(
    'P',
    'P0 CONTROL: the real composer makes the hand-written invitation',
    a.text === ASK_TEXT && a.subject === ASK_SUBJECT,
    a.text
  );
  const voiced = {
    to: 'ana@example.test',
    replyTo: 'kate@example.test',
    fromName: 'Kate Host',
    personId: 'gtc428-person-ana',
    eventId: 'gtc428-event-one',
  };
  const want = (text: string, subject: string, token: string, page: string) => ({
    from: 'Kate Host <gather@example.test>',
    to: 'ana@example.test',
    reply_to: 'kate@example.test',
    subject,
    text: `${text}${FOOTER(page)}`,
    headers: HEADERS(token),
  });
  sent = [];
  const r1 = await email.sendAskEmail({
    ...voiced,
    subject: ASK_SUBJECT,
    body: ASK_TEXT,
    itemNames: ['pavlova', 'trifle'],
    jobNames: ['dishes'],
  });
  const r2 = await email.sendChaseEmail({ ...voiced, subject: ASK_SUBJECT, body: CHASE_TEXT });
  const r3 = await email.sendDecideByEmail({ ...voiced, subject: ASK_SUBJECT, body: DECIDE_TEXT });
  const nudge = {
    to: 'ben@example.test',
    personId: 'gtc428-person-ben',
    eventId: 'gtc428-event-one',
  };
  const r4 = await email.sendNudgeEmail({
    ...nudge,
    subject: 'Reminder about Christmas Lunch',
    body: NUDGE_TEXT,
  });
  const thanks = WT.buildEmailWrapUpMessage({
    guestFirstName: 'Ben',
    eventName: 'Christmas Lunch',
    hostFirstName: 'Kate',
    guestTaskItem: 'pavlova',
  });
  const r5 = await email.sendNudgeEmail({ ...nudge, subject: thanks.subject, body: thanks.body });
  const testMail = TE.composeTestEmail({
    name: 'Ana',
    texted: false,
    subject: ASK_SUBJECT,
    text: ASK_TEXT.replace(LINK_ANA, STAND_IN),
  });
  const r6 = await email.sendHostTestEmail({
    to: 'kate@example.test',
    subject: testMail.subject,
    body: testMail.body,
    replyTo: 'kate@example.test',
    fromName: 'Kate Host',
    itemNames: ['pavlova', 'trifle'],
    jobNames: ['dishes'],
  });
  const r7 = await email.sendMagicLinkEmail('kate@example.test', 'gtc428-made-up-token');
  const all = [r1, r2, r3, r4, r5, r6, r7];
  assert(
    'P',
    'P1 CONTROL: seven sends reached the stub, each a success with its id',
    sent.length === 7 && all.every((r) => r.success),
    JSON.stringify(all)
  );
  const bodies = [...sent];
  const nudgeWant = (text: string, subject: string) => ({
    from: 'Gather <gather@example.test>',
    to: 'ben@example.test',
    subject,
    text: `${text}${FOOTER(PAGE_BEN)}`,
    headers: HEADERS(TOKEN_BEN),
  });
  assert(
    'P',
    'P2 the invitation: the same text, headers, from, reply-to and subject as at 541cd44, plus html',
    CHECKS.payload(bodies[0], want(ASK_TEXT, ASK_SUBJECT, TOKEN_ANA, PAGE_ANA), 'html'),
    JSON.stringify({ ...bodies[0], html: undefined })
  );
  assert(
    'P',
    'P3 the reminder: the same, plus html',
    CHECKS.payload(bodies[1], want(CHASE_TEXT, ASK_SUBJECT, TOKEN_ANA, PAGE_ANA), 'html')
  );
  assert(
    'P',
    'P4 the decide-by follow-up: the same, plus html',
    CHECKS.payload(bodies[2], want(DECIDE_TEXT, ASK_SUBJECT, TOKEN_ANA, PAGE_ANA), 'html')
  );
  assert(
    'P',
    'P5 the nudge: the same, plus html',
    CHECKS.payload(bodies[3], nudgeWant(NUDGE_TEXT, 'Reminder about Christmas Lunch'), 'html')
  );
  assert(
    'P',
    'P6 the wrap-up thank-you: the same words, plus html',
    thanks.body === THANKS_TEXT &&
      thanks.subject === 'Thanks from Kate' &&
      CHECKS.payload(bodies[4], nudgeWant(THANKS_TEXT, 'Thanks from Kate'), 'html')
  );
  assert(
    'P',
    'P7 the host test: the same text (stand-ins in place), no headers, plus html',
    testMail.body === TEST_TEXT &&
      CHECKS.payload(
        bodies[5],
        {
          from: 'Kate Host <gather@example.test>',
          to: 'kate@example.test',
          reply_to: 'kate@example.test',
          subject: `Test: ${ASK_SUBJECT}`,
          text: TEST_TEXT,
        },
        'html'
      )
  );
  assert(
    'P',
    'P8 the sign-in link email: unchanged, plain text only, no headers, no html',
    CHECKS.payload(
      bodies[6],
      {
        from: 'Gather <gather@example.test>',
        to: 'kate@example.test',
        subject: 'Sign in to Gather',
        text: 'Click here to sign in to Gather:\n\nhttps://gather.example.test/auth/verify?token=gtc428-made-up-token\n\nThis link expires in 15 minutes.',
      },
      'no html'
    )
  );
  assert(
    'P',
    'P9 each html part is what email-design.ts draws from that text (the list on the invitation only)',
    bodies[0]?.html ===
      D.designGuestEmail(bodies[0]?.text as string, ASK_SUBJECT, {
        itemNames: ['pavlova', 'trifle'],
        jobNames: ['dishes'],
      }) &&
      bodies[1]?.html === D.designGuestEmail(bodies[1]?.text as string, ASK_SUBJECT) &&
      bodies[3]?.html ===
        D.designGuestEmail(bodies[3]?.text as string, 'Reminder about Christmas Lunch') &&
      bodies[5]?.html ===
        D.designHostTestEmail(TEST_TEXT, `Test: ${ASK_SUBJECT}`, {
          itemNames: ['pavlova', 'trifle'],
          jobNames: ['dishes'],
        })
  );
  // A reminder given names (no caller does) still gets no list: the list is the ask's alone.
  sent = [];
  await email.sendChaseEmail({
    ...voiced,
    subject: ASK_SUBJECT,
    body: ASK_TEXT,
    itemNames: ['pavlova', 'trifle'],
    jobNames: ['dishes'],
  });
  assert(
    'P',
    'P10 the list is the invitation’s alone: a reminder carrying names draws none',
    sent.length === 1 && CHECKS.noList(String(sent[0]?.html))
  );

  // ══ B — the button ════════════════════════════════════════════════════════
  section('B — the button and the copy-link line');
  const h1 = String(bodies[0]?.html);
  assert(
    'B',
    'B1 the invitation: the button links to her link and the copy line shows the same link',
    CHECKS.button(h1, LINK_ANA)
  );
  assert(
    'B',
    'B2 the sentence before the link is kept, without the link',
    h1.includes(esc('One tap to say yes, no or maybe - the details are on the page:') + '</p>') &&
      !h1.includes(`page: ${LINK_ANA}`)
  );
  assert(
    'B',
    'B3 the reminder, the decide-by and the nudge each end with the button',
    CHECKS.button(String(bodies[1]?.html), LINK_ANA) &&
      CHECKS.button(String(bodies[2]?.html), LINK_ANA) &&
      CHECKS.button(String(bodies[3]?.html), LINK_BEN)
  );
  const noBtn: Array<[string, string]> = [
    ['the last word is a word', 'Hi Ana. See you soon.'],
    ['a link not at the end', `Hi Ana. ${LINK_ANA} is your link. See you soon.`],
    ['plain http to another host', 'Hi Ana. One tap: http://gather.example.test/p/tok-ana'],
    ['a script address', 'Hi Ana. One tap: javascript:alert(1)'],
    ['a link holding a quote', `Hi Ana. One tap: ${LINK_ANA}"onmouseover="x`],
    ['two links run together', `Hi Ana. One tap: ${LINK_ANA}https://gather.example.test/p/x`],
  ];
  for (const [what, body] of noBtn) {
    assert(
      'B',
      `B4 no button when ${what}`,
      CHECKS.noButton(design(body)) && design(body).length > 0
    );
  }
  assert(
    'B',
    'B5 the app’s own http://localhost link (development) makes the button',
    CHECKS.button(
      design('Hi Ana. One tap: http://localhost:3000/p/tok'),
      'http://localhost:3000/p/tok'
    )
  );
  assert(
    'B',
    'B6 a link alone on the last line: the button, and no empty paragraph',
    CHECKS.button(design(`Hi Ana.\n${LINK_ANA}`), LINK_ANA) &&
      !design(`Hi Ana.\n${LINK_ANA}`).includes('<br></p>')
  );

  // ══ L — the list ══════════════════════════════════════════════════════════
  section('L — the list, on the invitation only');
  const cases: Array<[string, string[], string[], string]> = [
    ['one dish', ['pavlova'], [], 'Would you bring the pavlova?'],
    [
      'three dishes',
      ['pavlova', 'trifle', 'ham'],
      [],
      'Would you bring the pavlova, the trifle and the ham?',
    ],
    [
      'two dishes and a job',
      ['pavlova', 'trifle'],
      ['dishes'],
      'Would you bring the pavlova and the trifle, and do the dishes?',
    ],
    ['a job only', [], ['dishes'], 'Would you do the dishes?'],
  ];
  for (const [what, items, jobs, sentence] of cases) {
    const t = ask(items, jobs).text;
    const h = design(t, { itemNames: items, jobNames: jobs });
    assert(
      'L',
      `L1 ${what}: "${sentence}" is in the text and becomes the lead-in and ${items.length + jobs.length} bullet(s), dishes first`,
      t.includes(sentence) &&
        CHECKS.list(h, [...items, ...jobs], sentence) &&
        CHECKS.inOrder(h, [
          'Hi - Gather here, helping Kate with this one.',
          LEAD_IN,
          ...(items.length ? [items[0]] : []),
          "I'll check back if I haven't heard from you. One tap to say yes, no or maybe - the details are on the page:",
        ])
    );
  }
  const itemless = ask([], []);
  assert(
    'L',
    'L2 an itemless guest: no list, "Nothing for you to bring." stays',
    CHECKS.noList(design(itemless.text, { itemNames: [], jobNames: [] })) &&
      design(itemless.text, { itemNames: [], jobNames: [] }).includes('Nothing for you to bring.')
  );
  assert(
    'L',
    'L3 names that do not match the sentence: no list, the sentence stays',
    CHECKS.noList(design(ASK_TEXT, { itemNames: ['salad'] })) &&
      design(ASK_TEXT, { itemNames: ['salad'] }).includes(
        esc('Would you bring the pavlova and the trifle, and do the dishes?')
      )
  );
  const once1 = ask(['pavlova'], []).text;
  const twice = once1.replace(
    'Hi - Gather here,',
    'Would you bring the pavlova? Hi - Gather here,'
  );
  assert(
    'L',
    'L4 the sentence found twice: no list, both stay',
    count(once1, 'Would you bring the pavlova?') === 1 &&
      count(twice, 'Would you bring the pavlova?') === 2 &&
      CHECKS.noList(design(twice, { itemNames: ['pavlova'] })) &&
      count(design(twice, { itemNames: ['pavlova'] }), 'Would you bring the pavlova?') === 2
  );
  assert(
    'L',
    'L5 no names passed: no list (the reminder, decide-by, nudge and thank-you never pass them)',
    CHECKS.noList(design(ASK_TEXT)) &&
      CHECKS.noList(String(bodies[1]?.html)) &&
      CHECKS.noList(String(bodies[2]?.html)) &&
      CHECKS.noList(String(bodies[3]?.html)) &&
      CHECKS.noList(String(bodies[4]?.html))
  );
  const carriedAsk = ask(['pavlova'], [], {
    carried: [{ childFirstName: 'Ollie', itemNames: ['trifle'], jobNames: [] }],
    household: [
      { firstName: 'Ross', itemNames: ['cabbage'], jobNames: [] },
      { firstName: 'Mia', itemNames: [], jobNames: ['dishes'] },
    ],
  });
  const hc = design(carriedAsk.text, { itemNames: ['pavlova'], jobNames: [] });
  assert(
    'L',
    'L6 a carried child: her own list made; "Ollie has been asked to bring the trifle." and "Would you also answer on Ollie’s behalf?" stay as written',
    carriedAsk.text.includes('Ollie has been asked to bring the trifle.') &&
      CHECKS.list(hc, ['pavlova'], 'Would you bring the pavlova?') &&
      CHECKS.inOrder(hc, [
        LEAD_IN,
        'pavlova',
        "Ollie has been asked to bring the trifle. Would you also answer on Ollie's behalf?",
      ])
  );
  assert(
    'L',
    'L7 the household list stays as its own lines, in order, after the list',
    carriedAsk.text.includes(
      "Others in your household have been asked too:\nRoss: bring the cabbage\nMia: do the dishes\nThat's just so you know."
    ) &&
      hc.includes(
        `${esc('Others in your household have been asked too:')}<br>${esc('Ross: bring the cabbage')}<br>${esc('Mia: do the dishes')}<br>${esc("That's just so you know.")}<br>${esc("I'll check back if I haven't heard from you.")}`
      )
  );
  assert(
    'L',
    'L8 the household list case keeps the button after its last line',
    CHECKS.button(hc, LINK_ANA) &&
      hc.indexOf(esc("I'll check back if I haven't heard from you.")) < hc.indexOf(BUTTON)
  );

  // ══ E — escaping ══════════════════════════════════════════════════════════
  section('E — escaping');
  const evilItem = '<script>alert("x")</script> & "chips"';
  const evilJob = "Tom's <b>washing</b>";
  const evil = AR.composeAsk({
    event: { name: 'Fish & <Chips> "Night"', startDate: event.startDate },
    hostName: 'Kate <img src=x> Host',
    storedAuthorLine: 'Bring <i>friends</i> & "family"',
    recipient: {
      firstName: 'Ana',
      itemNames: [evilItem],
      jobNames: [evilJob],
      carried: [],
      household: [],
      link: LINK_ANA,
    },
  });
  const he =
    D.designGuestEmail(guestText(evil.text), evil.subject, {
      itemNames: [evilItem],
      jobNames: [evilJob],
    }) ?? '';
  assert(
    'E',
    'E1 a script tag, angle brackets, & and quotes in names arrive escaped; no live tag of theirs is in the page',
    he.length > 0 &&
      !/<script|<img|<b>|<i>/i.test(he) &&
      he.includes(esc(evilItem)) &&
      he.includes(esc(evilJob)) &&
      he.includes(esc('Bring <i>friends</i> & "family"')) &&
      he.includes(`<title>${esc(evil.subject)}</title>`)
  );
  assert(
    'E',
    'E2 the escaped names are still the list',
    CHECKS.list(he, [evilItem, evilJob], `Would you bring the ${evilItem} and do the ${evilJob}?`)
  );
  assert(
    'E',
    'E3 D.escapeHtml writes each of & < > " \' as an entity',
    D.escapeHtml(`&<>"'`) === '&amp;&lt;&gt;&quot;&#39;'
  );

  // ══ S — email-safe ════════════════════════════════════════════════════════
  section('S — email-safe');
  const pages = [
    h1,
    String(bodies[1]?.html),
    String(bodies[2]?.html),
    String(bodies[3]?.html),
    String(bodies[4]?.html),
    String(bodies[5]?.html),
    he,
    hc,
  ];
  assert(
    'S',
    'S1 every designed email: tables, inline styles, 600px, light colours; no image, script, style sheet, frame, form or fetched file',
    pages.every(CHECKS.safe)
  );
  assert(
    'S',
    'S2 every web address and link is the email’s own: her link, her way-out page, the contact address',
    CHECKS.onlyLinks(h1, [LINK_ANA, PAGE_ANA]) &&
      CHECKS.onlyLinks(String(bodies[3]?.html), [LINK_BEN, PAGE_BEN]) &&
      CHECKS.onlyLinks(String(bodies[4]?.html), [PAGE_BEN]) &&
      CHECKS.onlyLinks(String(bodies[5]?.html), [])
  );
  assert(
    'S',
    'S3 the button is bulletproof: a link inside a table cell, the colour and padding on the link, the Gather green #6B7869',
    /<td align="center" bgcolor="#6B7869" style="background-color:#6B7869;border-radius:6px;"><a href="[^"]+" target="_blank" style="display:inline-block;padding:14px 28px;[^"]*background-color:#6B7869;/.test(
      h1
    )
  );
  assert(
    'S',
    'S4 a text whose footer cannot be read back gets no html at all (the plain text alone, as before)',
    D.designGuestEmail(ASK_TEXT, ASK_SUBJECT) === null &&
      D.designGuestEmail(
        `${ASK_TEXT}\n\nContact Gather: hello@gatheringtogether.co.nz`,
        ASK_SUBJECT
      ) === null
  );
  assert(
    'S',
    'S5 the design never throws: odd input gives null, never an error that would stop a send',
    ok(
      () =>
        D.designGuestEmail(undefined as any, undefined as any, { itemNames: 'x' as any }) === null
    )
  );

  // ══ F — the footer ════════════════════════════════════════════════════════
  section('F — the footer');
  assert(
    'F',
    'F1 the invitation: "Don’t want emails about this event?" links to her own page; the contact line links to the address; small and grey',
    CHECKS.footer(h1, PAGE_ANA)
  );
  assert(
    'F',
    'F2 the reminder, the decide-by, the nudge and the thank-you carry the same footer',
    CHECKS.footer(String(bodies[1]?.html), PAGE_ANA) &&
      CHECKS.footer(String(bodies[2]?.html), PAGE_ANA) &&
      CHECKS.footer(String(bodies[3]?.html), PAGE_BEN) &&
      CHECKS.footer(String(bodies[4]?.html), PAGE_BEN)
  );

  // ══ T — the host's test ═══════════════════════════════════════════════════
  section('T — the host’s test');
  const ht = String(bodies[5]?.html);
  assert(
    'T',
    'T1 the test top line first, then the guest’s message',
    CHECKS.inOrder(ht, [
      TEST_TOP,
      'Hi Ana - Christmas lunch at ours, would love you there.',
      "I've got Gather helping me put it together",
    ])
  );
  assert(
    'T',
    'T2 the button-shaped box links nowhere: the words in a span, no href',
    ht.includes(`>${BUTTON}</span>`) &&
      !ht.includes(`>${BUTTON}</a>`) &&
      !/<a href="(?!mailto:)/.test(ht)
  );
  assert(
    'T',
    'T3 the copy-link line shows the stand-in as it is',
    ht.includes(`${esc(COPY)}${esc(STAND_IN)}</p>`) && count(ht, esc(STAND_IN)) === 1
  );
  assert(
    'T',
    'T4 the footer: both lines, the stop stand-in as plain text',
    ht.includes(`Don&#39;t want emails about this event? ${esc(STOP_STAND_IN)}</p>`) &&
      ht.includes('Contact Gather: <a href="mailto:hello@gatheringtogether.co.nz"')
  );
  assert(
    'T',
    'T5 the list, as the guest’s email shows it',
    CHECKS.list(
      ht,
      ['pavlova', 'trifle', 'dishes'],
      'Would you bring the pavlova and the trifle, and do the dishes?'
    )
  );
  assert(
    'T',
    'T6 nothing in it can answer for a guest or opt anyone out: no /p/, no /unsubscribe/, no guest link',
    !/\/p\/|\/unsubscribe\//.test(ht) && !ht.includes(LINK_ANA)
  );
  const texted = TE.composeTestEmail({
    name: 'Ana',
    texted: true,
    subject: null,
    text: OL.withOptOutLine(ASK_TEXT.replace(LINK_ANA, STAND_IN)),
  });
  const htx =
    D.designHostTestEmail(texted.body, texted.subject, {
      itemNames: ['pavlova', 'trifle'],
      jobNames: ['dishes'],
    }) ?? '';
  assert(
    'T',
    'T7 a texted guest’s test: the text as paragraphs only; no box, no list, no footer',
    htx.length > 0 &&
      !htx.includes(BUTTON) &&
      CHECKS.noList(htx) &&
      !htx.includes('Contact Gather') &&
      htx.includes(esc('Reply STOP to opt out'))
  );

  // ══ W — the thank-you ═════════════════════════════════════════════════════
  section('W — the wrap-up thank-you');
  const hw = String(bodies[4]?.html);
  assert(
    'W',
    'W1 designed, its sentence as written, no button (it ends with no link)',
    hw.includes(esc(THANKS_TEXT)) && CHECKS.noButton(hw) && CHECKS.safe(hw)
  );

  // ══ U — the files ═════════════════════════════════════════════════════════
  section('U — the files and the commits');
  const src = read('src/lib/email.ts');
  assert(
    'U',
    'U1 email.ts still holds exactly five .emails.send( calls',
    count(src, '.emails.send(') === 5
  );
  const SPANS = [
    'export async function sendMagicLinkEmail(',
    'function guestEmailParts(',
    'export async function sendWelcomeEmail(',
  ];
  assert(
    'U',
    'U2 sendMagicLinkEmail, guestEmailParts and sendWelcomeEmail are byte for byte as at 541cd44 (working folder and the code commit)',
    SPANS.every((s) => {
      const base = CHECKS.spanOf(atRef(BASE, 'src/lib/email.ts'), s);
      return (
        base.split('\n').length > 3 &&
        CHECKS.spanOf(src, s) === base &&
        CHECKS.spanOf(atRef(CODE_J, 'src/lib/email.ts'), s) === base
      );
    })
  );
  const p0 = git(['diff', '--name-status', '--no-renames', BASE, PART0_TIP]);
  assert(
    'U',
    'U3 Part 0 (541cd44 to its ticket commit) changed exactly its three suites and its ticket',
    p0.status === 0 && CHECKS.sameList(p0.stdout, PART0_FILES),
    p0.stdout
  );
  const d1 = git(['diff', '--name-status', '--no-renames', PART0_TIP, CODE_J]);
  assert(
    'U',
    'U4 the code commit stands on Part 0’s tip and changed exactly email-design.ts (new), email.ts and the two call sites',
    git(['rev-parse', `${CODE_J}^`]).stdout.trim() ===
      git(['rev-parse', PART0_TIP]).stdout.trim() &&
      CHECKS.sameList(d1.status === 0 ? d1.stdout : null, CODE_FILES),
    d1.stdout
  );
  const ASK_AFTER = '          personId: composedRow.recipient.personId,\n          eventId,\n';
  const TEST_AFTER = '    replyTo: preview.replyTo,\n    fromName: preview.hostName,\n';
  assert(
    'U',
    'U5 each call site gained exactly the two name lines and nothing else (ruling 6)',
    CHECKS.insertedAfter(
      atRef(BASE, 'src/lib/press/dispatch.ts'),
      atRef(CODE_J, 'src/lib/press/dispatch.ts'),
      ASK_AFTER,
      [
        '          itemNames: composedRow.recipient.itemNames,\n',
        '          jobNames: composedRow.recipient.jobNames,\n',
      ]
    ) &&
      CHECKS.insertedAfter(
        atRef(BASE, 'src/lib/preflight/test-email-send.ts'),
        atRef(CODE_J, 'src/lib/preflight/test-email-send.ts'),
        TEST_AFTER,
        ['    itemNames: row.recipient.itemNames,\n', '    jobNames: row.recipient.jobNames,\n']
      )
  );
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'U',
    `U6 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from the code commit’s by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(CODE_J, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BASE}..${CODE_J}`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'U',
    'U7 neither untracked script is in any commit from 541cd44 to the code commit',
    tracked.length === 0 && git(['cat-file', '-t', CODE_J]).stdout.trim() === 'commit',
    tracked.join(', ')
  );

  close();
  assert(
    'U',
    'U8 CONTROL: nothing left the process: no trap hit, no request but the stub’s',
    trapCount() === trapBefore && nonResend === 0,
    `trap ${trapCount() - trapBefore}, other ${nonResend}`
  );

  const { prisma } = await import('../src/lib/prisma');
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS only (TWEAKS_J_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_J_DRY_RUN !== '1') {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
