/**
 * [[GTC-464]] — THE PRIVACY PAGE SAYS ONLY WHAT GATHER DOES.
 *
 * The founder's rulings: 15 Nov 2026 (1 "Change the page", 2 browser text "Keep it, say so, stop
 * sending it to the host", 5 "Change the words, and no automatic deletion", 7 "Twilio isn't used,
 * leave it off") and 16 Nov 2026 (the W lines, Q7, Q11, Q12, Q15, and W9 with "mobile" dropped),
 * verbatim in docs/tickets/GTC-464.md. The founder checked Railway on 16 Nov 2026: no TWILIO
 * variables, so ruling 7 stands; a test cannot see Railway, so F13 reads the code only.
 *
 * [[GTC-466]] (the founder's rulings of 19 Nov 2026, verbatim in docs/tickets/GTC-466.md): the
 * visit count's words, W14 to W17, in the same commit as the counter. W17 is Railway's own record,
 * which no test can see.
 *
 * Layers:
 *   W  each ruled line (W0 to W17) is on the page, in its place.
 *   O  the old claims are gone from the whole page.
 *   K  CONTROLS, green before and after the page changes: what stays.
 *   F  CONTROLS, green before and after the page changes: the code facts the words rest on, read
 *      from the files as text. They go red later if the code moves away from the words.
 *
 * No database, no server: the page is rendered in this process and the code is read as text.
 *
 * PRIVACY_WORDS_DRY_RUN=1: every check is also run on an input made to fail it (its sentence
 * taken out or put back, its code fact changed). Each must go red there, and each breaking change
 * must really change the input; otherwise the dry run fails.
 */

import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPolicy from '../src/app/privacy/page';

const ROOT = process.cwd();
const DRY_RUN = process.env.PRIVACY_WORDS_DRY_RUN === '1';

// ── The words, as ruled (16 Nov 2026) ────────────────────────────────────────────────────────
// [[GTC-466]] (founder, 19 Nov 2026): the deploy day, 20 November 2026.
// [[GTC-486]] (founder ruling, 26 Nov 2026: 'Update the "Last updated" date'; 27 Nov 2026: "the
// deploy day, 27 November 2026"): 27 November 2026.
const W0_DATE = 'Last updated: 27 November 2026';
const W1 = 'Usage data: when someone first opens a link we sent them, and when they answer';
const W2 =
  'Browser details: when someone first opens a link we sent them, we keep the description their ' +
  'browser sends of itself (such as the browser and device type), cut to 200 characters. Hosts do ' +
  'not see it.';
const W3 =
  'Cookies: a sign-in cookie, and a cookie for the invitation link you opened (no tracking cookies)';
const W4_OLD = 'Analytics: usage data may be collected via analytics services';
const W5 = [
  'Event data is kept until the host deletes the event, or until you ask us to delete it. ' +
    'Nothing deletes it automatically.',
  'Deleting an event removes its plan, guest list, answers, invitation links, messages and text ' +
    "replies. People's names and contact details are kept.",
  'Sample events made on the demo page are deleted by Gather the next day.',
];
const W6 = [
  'A sign-in cookie keeps you signed in. It lasts 30 days, or 2 hours for a sample event. Signing ' +
    'out removes it.',
  "When you open an invitation link, your browser keeps that link's code in a cookie for 8 hours. " +
    "It is sent only to Gather's pages for that kind of link.",
];
const W7_OLD = 'Analytics cookies may be used';
const W8 =
  'Payment data: Stripe handles payment processing. Card details go to Stripe, not to Gather. We ' +
  "keep Stripe's reference numbers for your payment or subscription, the amount paid and the dates.";
// W9, "mobile" dropped (no sending path checks for a mobile; founder ruling, 16 Nov 2026).
const W9 =
  'Invitations and reminders are texted only to New Zealand numbers. A thank-you after the event ' +
  'can also go to an Australian number.';
const W10 =
  "Gather also saves some things in your own browser so you don't lose them: an unsaved household " +
  "form for up to 7 days, and a new event's details until you finish creating it.";
// [[GTC-466]] (founder, 19 Nov 2026): W11's last sentence says it is Gather that does not store
// the address, since W17 says Railway keeps one.
const W11 =
  'Sample events: if you start one on the demo page, Gather keeps a short code made from your ' +
  'internet address with a secret key, to allow 3 samples an hour. It is deleted with the sample. ' +
  'Gather does not store your internet address itself.';
const W11_OLD_SENTENCE = 'Your internet address itself is not stored.';
const W12 =
  'Records of email addresses and phone numbers that cannot receive our messages are kept ' +
  'permanently, so we stop trying them.';
const W13 =
  'Anthropic — AI plan making (event details and dietary needs; sometimes the names of guests ' +
  'bringing items)';
// [[GTC-466]] (founder, 19 Nov 2026): the visit count's words.
// [[GTC-486]] (founder ruling, 26 Nov 2026): "each time the home page, the demo page, the sample's
// start page or the new-event page is opened".
const W14 =
  "Visit counts: each time the home page, the demo page, the sample's start page or the new-event " +
  'page is opened, Gather ' +
  "writes one line to its server log with the page's name and where the visitor came from: the " +
  'name of the website their browser reports (such as facebook.com), "internal" for one of ' +
  'Gather\'s own pages, or "direct" if the browser does not say. Nothing else about the visitor is ' +
  'written: no internet address, no browser description, no cookie and no full web address. If ' +
  "the link carried one of Gather's own campaign labels (such as facebook), that label is written " +
  'too.';
const W15 =
  'We only collect information needed to coordinate your events, and a count of visits to a few ' +
  'of our pages:';
const W15_OLD = 'We only collect information needed to coordinate your events:';
const W16 =
  "Visit-count lines are kept in our hosting provider's logs (Railway) for up to 90 days, then " +
  'deleted. Daily totals, which say nothing about any visitor, may be kept longer.';
const W17 =
  'Our hosting provider (Railway) also keeps its own record of each request to the site, including ' +
  "the visitor's internet address and browser description, for up to 90 days.";

// ── What stays (the controls) ─────────────────────────────────────────────────────────────────
const K1 = 'No tracking cookies';
const K2 = 'SMS opt-out records are retained permanently to respect opt-out preferences';
const K3 = 'Account data is retained while the account is active';
// GTC-350's bullet, as test:reply-board C10 pins it.
const K4 =
  'If you reply to one of our texts, we show your reply to the person who invited you, keep it ' +
  "with the event it was about, and delete it with that event's data.";
// GTC-356's sentence, as test:household-list F1 pins it.
const K5 =
  "If you're part of a household, Gather tells its contact person what you've been asked to bring.";
const K6 = [
  'TNZ — text message delivery',
  'Resend — email delivery',
  'Stripe — payment processing',
  'Railway — hosting and infrastructure',
];

// ── The files the F layer reads ────────────────────────────────────────────────────────────────
const MIDDLEWARE = 'middleware.ts';
const VERIFY = 'src/app/api/auth/verify/route.ts';
const DEMO_SESSION = 'src/app/api/demo/session/route.ts';
const LOGOUT = 'src/app/api/auth/logout/route.ts';
const P_ROUTE = 'src/app/api/p/[token]/route.ts';
const C_ROUTE = 'src/app/api/c/[token]/route.ts';
const INVITE_DETAIL = 'src/app/api/events/[id]/people/[personId]/invite-detail/route.ts';
const LAYOUT = 'src/app/layout.tsx';
const PACKAGE = 'package.json';
const CRON_DIR = 'src/app/api/cron';
const EVENT_ROUTE = 'src/app/api/events/[id]/route.ts';
const CLEANUP = 'src/lib/demo/cleanup.ts';
const SCHEMA = 'prisma/schema.prisma';
const DRAFT = 'src/lib/households/form-draft.ts';
const START_LIMIT = 'src/lib/demo/start-limit.ts';
const GENERATE = 'src/lib/ai/generate.ts';
const SEND_SMS = 'src/lib/sms/send-sms.ts';
const PHONE = 'src/lib/phone.ts';
const CHOOSER = 'src/lib/eligibility/channel-chooser.ts';
const NUDGE_ELIGIBILITY = 'src/lib/sms/nudge-eligibility.ts';
const MANUAL_NUDGE = 'src/lib/sms/manual-nudge-recipient.ts';
const WRAP_UP = 'src/lib/wrap-up.ts';

// ── Inputs ─────────────────────────────────────────────────────────────────────────────────────
interface Input {
  page: string;
  read: (file: string) => string;
  files: string[];
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

function realInput(): Input {
  const cache = new Map<string, string>();
  return {
    page: textOf(renderToStaticMarkup(createElement(PrivacyPolicy))),
    read: (file) => {
      if (!cache.has(file)) cache.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
      return cache.get(file) as string;
    },
    files: [MIDDLEWARE, ...walk('src')].sort(),
  };
}

/** Source with comments removed (block comments, and line comments that start a line). */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const count = (s: string, part: string) => s.split(part).length - 1;
/** The text from one heading to the next one named, searched after the first. */
function between(page: string, from: string, to: string): string {
  const i = page.indexOf(from);
  if (i < 0) return '';
  const j = page.indexOf(to, i + from.length);
  return j < 0 ? '' : page.slice(i, j);
}
const collect = (p: string) => between(p, 'What We Collect', 'How We Use It');
const share = (p: string) => between(p, 'Who We Share It With', 'Data Storage');
const retention = (p: string) => between(p, 'Data Retention', 'Changes to This Policy');
/** Data Retention alone: up to the Cookies heading that follows it. */
const retentionOnly = (p: string) => {
  const r = retention(p);
  const k = r.indexOf('Cookies');
  return k < 0 ? '' : r.slice(0, k);
};
/** The Cookies section: from its heading (after Data Retention) to Changes to This Policy. */
const cookiesSection = (p: string) => {
  const r = retention(p);
  const k = r.indexOf('Cookies');
  return k < 0 ? '' : r.slice(k);
};
const inOrder = (hay: string, parts: string[]) => {
  let at = -1;
  for (const part of parts) {
    const i = hay.indexOf(part, at + 1);
    if (i < 0 || i <= at) return false;
    at = i;
  }
  return true;
};

// Breaking an input, for the dry run.
const withPage = (i: Input, page: string): Input => ({ ...i, page });
const without = (i: Input, part: string): Input => withPage(i, i.page.split(part).join(''));
const plus = (i: Input, part: string): Input => withPage(i, `${i.page} ${part}`);
const editFile = (i: Input, file: string, from: string | RegExp, to: string): Input => ({
  ...i,
  read: (f) => (f === file ? i.read(f).replace(from, to) : i.read(f)),
});

// ── The checks ─────────────────────────────────────────────────────────────────────────────────
interface Check {
  layer: 'W' | 'O' | 'K' | 'F';
  label: string;
  test: (i: Input) => boolean;
  breakIt: (i: Input) => Input;
}

const COOKIE_SETTING = /cookies\(\)\)\.set\(|\.cookies\.set\(|['"]Set-Cookie['"]|document\.cookie/;
const COOKIE_FILES = [LOGOUT, DEMO_SESSION, VERIFY, MIDDLEWARE].sort();
const ANALYTICS_PACKAGES =
  /analytics|gtag|posthog|segment|mixpanel|plausible|hotjar|amplitude|sentry|datadog|fullstory|heap|speed-insights/i;

const CHECKS: Check[] = [
  // W — the ruled lines.
  {
    layer: 'W',
    label: `W0 the date reads "${W0_DATE}", and it is the page's only "Last updated"`,
    test: (i) => i.page.includes(W0_DATE) && count(i.page, 'Last updated:') === 1,
    breakIt: (i) => withPage(i, i.page.replace('27 November 2026', '28 November 2026')),
  },
  {
    layer: 'W',
    label: 'W1 "Usage data: when someone first opens a link we sent them, and when they answer"',
    test: (i) => collect(i.page).includes(W1),
    breakIt: (i) => without(i, W1),
  },
  {
    layer: 'W',
    label: 'W2 "Browser details: ..." (cut to 200 characters; hosts do not see it), right after W1',
    test: (i) => collect(i.page).includes(`${W1} ${W2}`),
    breakIt: (i) => without(i, W2),
  },
  {
    layer: 'W',
    label: 'W3 "Cookies: a sign-in cookie, and a cookie for the invitation link you opened ..."',
    test: (i) => collect(i.page).includes(W3),
    breakIt: (i) => without(i, W3),
  },
  {
    layer: 'W',
    label: 'W4 the item "Analytics: usage data may be collected via analytics services" is gone',
    test: (i) => i.page.length > 0 && !i.page.includes(W4_OLD),
    breakIt: (i) => plus(i, W4_OLD),
  },
  {
    layer: 'W',
    label: 'W5 the three Data Retention bullets, in order (kept until deleted; what goes; samples)',
    test: (i) => inOrder(retentionOnly(i.page), W5),
    breakIt: (i) => without(i, W5[1]),
  },
  {
    layer: 'W',
    label: 'W6 the two Cookies bullets, in order (sign-in: 30 days or 2 hours; link: 8 hours)',
    test: (i) => inOrder(cookiesSection(i.page), W6),
    breakIt: (i) => without(i, W6[1]),
  },
  {
    layer: 'W',
    label: 'W7 the bullet "Analytics cookies may be used" is gone',
    test: (i) => i.page.length > 0 && !i.page.includes(W7_OLD),
    breakIt: (i) => plus(i, W7_OLD),
  },
  {
    layer: 'W',
    label: 'W8 "Payment data: ... Card details go to Stripe, not to Gather. We keep ..."',
    test: (i) => collect(i.page).includes(W8),
    breakIt: (i) => without(i, W8),
  },
  {
    layer: 'W',
    label:
      'W9 "Invitations and reminders are texted only to New Zealand numbers. A thank-you ... Australian number." under SMS Communications',
    test: (i) => between(i.page, 'SMS Communications', 'Your Rights').includes(W9),
    breakIt: (i) => without(i, W9),
  },
  {
    layer: 'W',
    label: 'W10 the browser storage bullet, under Cookies, after "No tracking cookies"',
    test: (i) => inOrder(cookiesSection(i.page), [K1, W10]),
    breakIt: (i) => without(i, W10),
  },
  {
    layer: 'W',
    label:
      'W11 "Sample events: ..." is the last item under What We Collect, after the Cookies item; its old last sentence is gone (GTC-466)',
    test: (i) => {
      const c = collect(i.page);
      return inOrder(c, [W3, W11]) && c.trim().endsWith(W11) && !i.page.includes(W11_OLD_SENTENCE);
    },
    breakIt: (i) => without(i, W11),
  },
  {
    layer: 'W',
    label: 'W12 the blocks bullet, under Data Retention, after the SMS opt-out bullet',
    test: (i) => inOrder(retentionOnly(i.page), [K2, W12]),
    breakIt: (i) => without(i, W12),
  },
  {
    layer: 'W',
    label: 'W13 "Anthropic — AI plan making (event details and dietary needs; sometimes ...)"',
    test: (i) => share(i.page).includes(W13),
    breakIt: (i) => without(i, W13),
  },
  {
    layer: 'W',
    label:
      'W14 "Visit counts: ..." (GTC-466), right after Browser details and right before Cookies',
    test: (i) => collect(i.page).includes(`${W2} ${W14} ${W3}`),
    breakIt: (i) => without(i, W14),
  },
  {
    layer: 'W',
    label:
      'W15 "We only collect information needed to coordinate your events, and a count of visits to a few of our pages:" opens What We Collect; the old sentence is gone',
    test: (i) =>
      collect(i.page).includes(`What We Collect ${W15} Account information:`) &&
      !i.page.includes(W15_OLD),
    breakIt: (i) => withPage(i, i.page.replace(W15, W15_OLD)),
  },
  {
    layer: 'W',
    label:
      'W16 "Visit-count lines are kept ... for up to 90 days ..." is the last Data Retention bullet, after the blocks bullet',
    test: (i) => {
      const r = retentionOnly(i.page);
      return inOrder(r, [K2, W12, W16]) && r.trim().endsWith(W16);
    },
    breakIt: (i) => without(i, W16),
  },
  {
    layer: 'W',
    label:
      'W17 "Our hosting provider (Railway) also keeps its own record of each request ..." under Who We Share It With, right after the providers, before "We do not sell"',
    test: (i) => share(i.page).includes(`${W13} ${W17} We do not sell personal data.`),
    breakIt: (i) => without(i, W17),
  },

  // O — the old claims, gone from the whole page.
  ...(
    [
      ['O1', 'page visits', /page visits/i],
      ['O2', 'analytics (any mention)', /analytics/i],
      ['O3', 'a single session cookie', /single session cookie/i],
      ['O4', '12 months', /12 months/i],
      ['O5', 'the Stripe session ID', /session ID/i],
      ['O6', 'event details sent to generate plans', /event details sent to generate plans/i],
      // W9: no sending path checks for a mobile, so the page names no kind of number.
      ['O7', 'mobile (any mention)', /mobile/i],
    ] as Array<[string, string, RegExp]>
  ).map(
    ([id, words, re]): Check => ({
      layer: 'O',
      label: `${id} the page no longer says: ${words}`,
      test: (i) => i.page.length > 0 && !re.test(i.page),
      breakIt: (i) => plus(i, re.source.replace(/\\/g, '')),
    })
  ),

  // K — CONTROLS: what stays.
  {
    layer: 'K',
    label: `K1 CONTROL: "${K1}" stays under Cookies`,
    test: (i) => cookiesSection(i.page).includes(K1),
    breakIt: (i) => withPage(i, i.page.replace(`• ${K1}`, '')),
  },
  {
    layer: 'K',
    label: 'K2 CONTROL: "SMS opt-out records are retained permanently ..." stays',
    test: (i) => retentionOnly(i.page).includes(K2),
    breakIt: (i) => without(i, K2),
  },
  {
    layer: 'K',
    label: 'K3 CONTROL: "Account data is retained while the account is active" stays',
    test: (i) => retentionOnly(i.page).includes(K3),
    breakIt: (i) => without(i, K3),
  },
  {
    layer: 'K',
    label: "K4 CONTROL: GTC-350's text-reply bullet stays, word for word",
    test: (i) => i.page.includes(K4),
    breakIt: (i) => without(i, K4),
  },
  {
    layer: 'K',
    label: "K5 CONTROL: GTC-356's household sentence stays under How We Use It",
    test: (i) => between(i.page, 'How We Use It', 'Who We Share It With').includes(K5),
    breakIt: (i) => without(i, K5),
  },
  {
    layer: 'K',
    label: 'K6 CONTROL: the TNZ, Resend, Stripe and Railway lines stay as they are',
    test: (i) => K6.every((line) => share(i.page).includes(line)),
    breakIt: (i) => without(i, K6[1]),
  },
  {
    layer: 'K',
    label: 'K7 CONTROL: Twilio is not named on the page (ruling 7)',
    test: (i) => i.page.length > 0 && !/twilio/i.test(i.page),
    breakIt: (i) => plus(i, 'Twilio'),
  },

  // F — CONTROLS: the code facts the words rest on.
  {
    layer: 'F',
    label:
      'F1 CONTROL: cookies are set in four files only, and the link cookies are gather_p_token, gather_h_token and gather_c_token (W3, W6)',
    test: (i) => {
      const setters = i.files.filter((f) => COOKIE_SETTING.test(codeOnly(i.read(f)))).sort();
      const mw = i.read(MIDDLEWARE);
      const names = [...mw.matchAll(/name: '(gather_[a-z]_token)'/g)].map((m) => m[1]).sort();
      return (
        JSON.stringify(setters) === JSON.stringify(COOKIE_FILES) &&
        JSON.stringify(names) ===
          JSON.stringify(['gather_c_token', 'gather_h_token', 'gather_p_token']) &&
        /cookies\(\)\)\.set\('session'/.test(i.read(VERIFY)) &&
        /cookies\(\)\)\.set\('session'/.test(i.read(DEMO_SESSION))
      );
    },
    breakIt: (i) => editFile(i, MIDDLEWARE, "name: 'gather_c_token'", "name: 'gather_x_token'"),
  },
  {
    layer: 'F',
    label:
      'F2 CONTROL: the lifetimes: sign-in 30 days, a sample sign-in 2 hours, a link cookie 8 hours (W6)',
    test: (i) =>
      /maxAge: 30 \* 24 \* 60 \* 60,/.test(i.read(VERIFY)) &&
      /DEMO_SESSION_MAX_AGE_SECONDS = 2 \* 60 \* 60;/.test(i.read(DEMO_SESSION)) &&
      /maxAge: DEMO_SESSION_MAX_AGE_SECONDS,/.test(i.read(DEMO_SESSION)) &&
      /maxAge: 60 \* 60 \* 8,/.test(i.read(MIDDLEWARE)),
    breakIt: (i) => editFile(i, MIDDLEWARE, 'maxAge: 60 * 60 * 8,', 'maxAge: 60 * 60 * 9,'),
  },
  {
    layer: 'F',
    label: 'F3 CONTROL: signing out clears the sign-in cookie (W6, "Signing out removes it")',
    test: (i) => /'session=;[^']*Max-Age=0'/.test(i.read(LOGOUT)),
    breakIt: (i) => editFile(i, LOGOUT, 'Max-Age=0', 'Max-Age=60'),
  },
  {
    layer: 'F',
    label:
      'F4 CONTROL: browser text is read in the p and c link routes only, and cut to 200 characters (W2)',
    test: (i) => {
      const readers = i.files.filter((f) => /headers\.get\(['"]user-agent['"]\)/.test(i.read(f)));
      return (
        JSON.stringify(readers) === JSON.stringify([C_ROUTE, P_ROUTE].sort()) &&
        readers.every((f) => i.read(f).includes('userAgent.substring(0, 200)'))
      );
    },
    breakIt: (i) =>
      editFile(i, P_ROUTE, 'userAgent.substring(0, 200)', 'userAgent.substring(0, 300)'),
  },
  {
    layer: 'F',
    label:
      'F5 CONTROL: invite-detail sends each log row as type and time only, no metadata (W2, GTC-463)',
    test: (i) => {
      const code = codeOnly(i.read(INVITE_DETAIL));
      return (
        !/metadata/.test(code) && /type: true,\s*createdAt: true,/.test(code) && code.length > 0
      );
    },
    breakIt: (i) =>
      editFile(
        i,
        INVITE_DETAIL,
        'createdAt: true,',
        'createdAt: true,\n            metadata: true,'
      ),
  },
  {
    layer: 'F',
    label:
      'F6 CONTROL: no analytics package, no next/script anywhere, no script tag in the root layout (W4, W7, O1, O2)',
    test: (i) => {
      const pkg = JSON.parse(i.read(PACKAGE));
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      return (
        deps.length > 0 &&
        !deps.some((d) => ANALYTICS_PACKAGES.test(d)) &&
        !i.files.some((f) => /from ['"]next\/script['"]/.test(i.read(f))) &&
        !/<script|<Script/i.test(i.read(LAYOUT))
      );
    },
    breakIt: (i) =>
      editFile(i, PACKAGE, '"dependencies": {', '"dependencies": {\n    "posthog-js": "1.0.0",'),
  },
  {
    layer: 'F',
    label:
      'F7 CONTROL: no scheduled deletion but the sample clean-up: of the cron routes only demo-cleanup calls it, none deletes itself, and events are deleted only by DELETE /api/events/[id] and the clean-up (W5)',
    test: (i) => {
      const cron = i.files.filter((f) => f.startsWith(`${CRON_DIR}/`) && f.endsWith('/route.ts'));
      const callsCleanup = cron.filter((f) => /lib\/demo\/cleanup/.test(i.read(f)));
      const deletesItself = cron.filter((f) => /\.delete(Many)?\(/.test(codeOnly(i.read(f))));
      const eventDeleters = i.files
        .filter((f) => /\.event\.delete(Many)?\(/.test(codeOnly(i.read(f))))
        .sort();
      return (
        cron.length === 6 &&
        JSON.stringify(callsCleanup) === JSON.stringify([`${CRON_DIR}/demo-cleanup/route.ts`]) &&
        deletesItself.length === 0 &&
        JSON.stringify(eventDeleters) === JSON.stringify([EVENT_ROUTE, CLEANUP].sort())
      );
    },
    breakIt: (i) =>
      editFile(
        i,
        `${CRON_DIR}/nudges/route.ts`,
        /^/,
        'async function x() { await prisma.event.deleteMany({}); }\n'
      ),
  },
  {
    layer: 'F',
    label:
      'F8 CONTROL: Stripe: payment and subscription ids, amount and date are kept; no session id column (W8)',
    test: (i) => {
      const schema = i.read(SCHEMA);
      return (
        ['stripePaymentIntentId', 'paidAt', 'amountPaid', 'stripeCustomerId'].every((f) =>
          new RegExp(`^\\s+${f}\\s`, 'm').test(schema)
        ) &&
        /^\s+stripeSubscriptionId\s/m.test(schema) &&
        !/^\s+(stripe\w*Session\w*|checkoutSession\w*)\s/im.test(schema)
      );
    },
    breakIt: (i) =>
      editFile(
        i,
        SCHEMA,
        /^(\s+)stripePaymentIntentId(\s)/m,
        '$1stripeSessionId String?\n$1stripePaymentIntentId$2'
      ),
  },
  {
    layer: 'F',
    label: 'F9 CONTROL: an unsaved household form is kept for 7 days (W10)',
    test: (i) => /DRAFT_MAX_AGE_MS = 7 \* 24 \* 60 \* 60 \* 1000;/.test(i.read(DRAFT)),
    breakIt: (i) => editFile(i, DRAFT, 'DRAFT_MAX_AGE_MS = 7 *', 'DRAFT_MAX_AGE_MS = 30 *'),
  },
  {
    layer: 'F',
    label:
      'F10 CONTROL: the demo start keeps an 8-character keyed HMAC of the address, 3 samples an hour (W11)',
    test: (i) => {
      const s = i.read(START_LIMIT);
      return (
        /perVisitorHour: 3,/.test(s) &&
        /name: 'HMAC', hash: 'SHA-256'/.test(s) &&
        /hex\(\(await hmac\(key, address\)\)\.subarray\(0, 4\)\)/.test(s)
      );
    },
    breakIt: (i) => editFile(i, START_LIMIT, 'perVisitorHour: 3,', 'perVisitorHour: 5,'),
  },
  {
    layer: 'F',
    label:
      "F11 CONTROL: deleting an event deletes no person, so people's names and contact details are kept (W5)",
    test: (i) => {
      const route = codeOnly(i.read(EVENT_ROUTE));
      const at = route.indexOf('export async function DELETE');
      return at >= 0 && !/\.person\.delete(Many)?\(/.test(route.slice(at));
    },
    breakIt: (i) =>
      editFile(
        i,
        EVENT_ROUTE,
        'await tx.event.delete({',
        'await tx.person.deleteMany({});\n      await tx.event.delete({'
      ),
  },
  {
    layer: 'F',
    label:
      'F12 CONTROL: re-making part of a plan sends the assigned guest\'s name to the AI (W13, "sometimes the names")',
    test: (i) => i.read(GENERATE).includes('assignedTo: item.assignment?.person.name,'),
    breakIt: (i) =>
      editFile(i, GENERATE, 'assignedTo: item.assignment?.person.name,', 'assignedTo: undefined,'),
  },
  {
    layer: 'F',
    label:
      'F13 CONTROL: invitations and reminders pass the +64-only check (the chooser twice, nudges, manual nudges); TNZ takes +64 and +61; the thank-you texts any number (W9)',
    test: (i) =>
      i.read(PHONE).includes('const nzPattern = /^\\+64\\d{8,10}$/;') &&
      count(i.read(CHOOSER), 'isValidNZNumber(person.phoneNumber)') === 2 &&
      i.read(NUDGE_ELIGIBILITY).includes('isValidNZNumber(phone)') &&
      i.read(MANUAL_NUDGE).includes('isValidNZNumber(person.phoneNumber)') &&
      i.read(SEND_SMS).includes("const TNZ_COUNTRY_CODES = ['+64', '+61'] as const;") &&
      i.read(WRAP_UP).includes('if (phone && !person.smsOptedOut && !textBlocks.has(phone)) {'),
    breakIt: (i) =>
      editFile(
        i,
        SEND_SMS,
        "const TNZ_COUNTRY_CODES = ['+64', '+61'] as const;",
        "const TNZ_COUNTRY_CODES = ['+64'] as const;"
      ),
  },
];

// ── Run ────────────────────────────────────────────────────────────────────────────────────────
function main() {
  const input = realInput();
  let passed = 0;
  let failed = 0;
  const reds: string[] = [];
  let lastLayer = '';
  const LAYER_TITLE: Record<Check['layer'], string> = {
    W: 'W — the ruled lines are on the page',
    O: 'O — the old claims are gone',
    K: 'K — CONTROLS: what stays',
    F: 'F — CONTROLS: the code facts the words rest on',
  };

  if (DRY_RUN) {
    console.log(
      'privacy-words DRY RUN: each check on this page, and on an input made to fail it\n'
    );
    let bad = 0;
    for (const c of CHECKS) {
      const here = c.test(input);
      const broken = c.breakIt(input);
      const changed =
        broken.page !== input.page ||
        [...input.files, PACKAGE, SCHEMA].some((f) => broken.read(f) !== input.read(f));
      const brokenResult = c.test(broken);
      const ok = changed && !brokenResult;
      if (!ok) bad++;
      const id = c.label.split(' ')[0];
      console.log(
        `${ok ? 'ok ' : 'BAD'} ${id.padEnd(4)} this page: ${here ? 'green' : 'red  '}  broken input: ${
          brokenResult ? 'GREEN (wrong)' : 'red'
        }${changed ? '' : '  (the break changed nothing)'}`
      );
    }
    console.log(`\nDRY RUN: ${CHECKS.length - bad} of ${CHECKS.length} checks go red when broken`);
    process.exit(bad > 0 ? 1 : 0);
  }

  for (const c of CHECKS) {
    if (c.layer !== lastLayer) {
      console.log(`\n${LAYER_TITLE[c.layer]}`);
      lastLayer = c.layer;
    }
    let ok = false;
    try {
      ok = c.test(input);
    } catch (e) {
      ok = false;
      console.log(`    (threw: ${e instanceof Error ? e.message : String(e)})`);
    }
    if (ok) passed++;
    else {
      failed++;
      reds.push(`[${c.layer}] ${c.label}`);
    }
    console.log(`${ok ? '✓' : '✗'} [${c.layer}] ${c.label}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

main();
