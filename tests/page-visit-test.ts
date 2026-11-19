/**
 * [[GTC-466]] — THE VISIT COUNT: one plain line in the server log for each real load of the home
 * page, /demo and the new-event page (/plan/new), with no cookie and no address.
 *
 * The founder's rulings: 15 Nov 2026 ("a simple daily count, no cookies or addresses") and 19 Nov
 * 2026 (the pages home, demo and new; in-app moves written "internal"; the user agent never read;
 * the campaign tag from utm_source only, on the home page and /demo only, from a fixed list; at
 * most 120 lines a minute), verbatim in docs/tickets/GTC-466.md.
 *
 *   [page-visit] <page> <source>[ tag=<label>]
 *
 * Layers:
 *   L  the line: what a Referer becomes.
 *   R  which requests count.
 *   U  the campaign tag.
 *   C  the cap.
 *   S  the code, read as text: who calls the counter, and what the counter reads.
 *
 * No database, no server, no network: the counter's pure parts are called in this process and the
 * code is read as text. Its async part (countPageVisit) needs Next's request scope and is proved
 * on a production build instead (see the ticket).
 *
 * PAGE_VISIT_DRY_RUN=1: every check is also run on an input made to fail it (the counter or a file
 * changed). Each must go red there, and each breaking change must really change the input;
 * otherwise the dry run fails.
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DRY_RUN = process.env.PAGE_VISIT_DRY_RUN === '1';

// ── The files ──────────────────────────────────────────────────────────────────────────────────
const COUNTER = 'src/lib/page-visit.ts';
const HOME = 'src/app/page.tsx';
const DEMO = 'src/app/demo/page.tsx';
const NEW_LAYOUT = 'src/app/plan/new/layout.tsx';
const NEW_PAGE = 'src/app/plan/new/page.tsx';
const MIDDLEWARE = 'middleware.ts';
const ROOT_LAYOUT = 'src/app/layout.tsx';
const BILLING_DIR = 'src/app/billing';
const SHARE_PREVIEW = 'src/lib/share-preview.ts';
const PRIVACY = 'src/app/privacy/page.tsx';

// ── The ruled words and numbers ────────────────────────────────────────────────────────────────
const LABELS = ['facebook', 'instagram', 'email', 'flyer', 'podcast', 'magazine'];
const CAP = 120;
/** The one shape a line may have (this suite's own copy, typed from the rulings). */
const LINE =
  /^\[page-visit\] (home|demo|new) (direct|internal|other|[a-z0-9][a-z0-9.-]{0,63})( tag=(facebook|instagram|email|flyer|podcast|magazine))?$/;
const CAP_NOTE = /^\[page-visit-cap\] dropped [1-9][0-9]*$/;
/** The headers the counter may read, and no others. */
const ALLOWED_HEADERS = [
  'host',
  'next-router-prefetch',
  'purpose',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-purpose',
  'x-purpose',
];
const FORBIDDEN_HEADER_WORDS =
  /user-agent|cookie|x-forwarded|x-real-ip|\bforwarded\b|cf-connecting|true-client-ip/i;

// ── The counter, as this suite calls it ────────────────────────────────────────────────────────
interface HeaderReader {
  get(name: string): string | null;
}
interface Mod {
  pageVisitLine: (page: string, h: HeaderReader, utmSource?: unknown) => string | null;
  makeVisitCap: (limit?: number) => (nowMs: number) => { allow: boolean; note: string | null };
  CAP_PER_MINUTE: number;
}

interface Input {
  mod: Mod | null;
  read: (file: string) => string;
  files: string[];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

function loadCounter(): Mod | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require(path.join(ROOT, COUNTER));
    return typeof m?.pageVisitLine === 'function' ? (m as Mod) : null;
  } catch (e) {
    console.log(`    (the counter did not load: ${(e as Error).message.split('\n')[0]})`);
    return null;
  }
}

function realInput(): Input {
  const cache = new Map<string, string>();
  return {
    mod: loadCounter(),
    read: (file) => {
      if (!cache.has(file)) {
        const full = path.join(ROOT, file);
        cache.set(file, fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '');
      }
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
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A request's headers, as a plain reader (so hostile values with newlines can be tried). */
const H = (o: Record<string, string | undefined>): HeaderReader => ({
  get: (name) => {
    const v = o[name.toLowerCase()];
    return v === undefined ? null : v;
  },
});
const LOAD = {
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
};
const MOVE = {
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};
const SITE = 'www.gatheringtogether.co.nz';

/** The line for a real page load with this Referer (undefined: none) and Host. */
function lineOf(
  i: Input,
  page: string,
  referer: string | undefined,
  host: string | undefined = SITE,
  utm?: unknown
): string | null {
  if (!i.mod) return null;
  return i.mod.pageVisitLine(page, H({ ...LOAD, referer, host }), utm);
}
/** Every case gives `[page-visit] <page> <want>`, on each of the three pages. */
function allGive(i: Input, cases: Array<[string | undefined, string]>, host?: string): boolean {
  if (!i.mod) return false;
  return cases.every(([ref, want]) =>
    ['home', 'demo', 'new'].every((p) => lineOf(i, p, ref, host) === `[page-visit] ${p} ${want}`)
  );
}

// ── Breaking an input, for the dry run ─────────────────────────────────────────────────────────
const withMod = (i: Input, patch: Partial<Mod>): Input => ({
  ...i,
  mod: { ...((i.mod ?? {}) as Mod), ...patch },
});
/** The counter's line, changed afterwards by `f`. */
const wrapLine = (i: Input, f: (line: string | null, page: string) => string | null): Input =>
  withMod(i, {
    pageVisitLine: (page, h, utm) => f(i.mod ? i.mod.pageVisitLine(page, h, utm) : null, page),
  });
/** The counter handed changed headers. */
const wrapHeaders = (i: Input, f: (h: HeaderReader) => HeaderReader): Input =>
  withMod(i, {
    pageVisitLine: (page, h, utm) => (i.mod ? i.mod.pageVisitLine(page, f(h), utm) : null),
  });
/** A counter that writes the Referer as it came. */
const rawReferer = (i: Input): Input =>
  withMod(i, {
    pageVisitLine: (page, h) => `[page-visit] ${page} ${h.get('referer') ?? 'direct'}`,
  });
const editFile = (i: Input, file: string, from: string | RegExp, to: string): Input => ({
  ...i,
  read: (f) => (f === file ? i.read(f).replace(from, to) : i.read(f)),
});

// ── The cases ──────────────────────────────────────────────────────────────────────────────────
const FACEBOOK: Array<[string, string]> = [
  ['https://l.facebook.com/', 'facebook.com'],
  ['https://lm.facebook.com/l.php?u=https%3A%2F%2Fwww.gatheringtogether.co.nz%2F', 'facebook.com'],
  ['http://m.facebook.com/', 'facebook.com'],
  ['https://www.facebook.com/', 'facebook.com'],
  ['https://web.facebook.com/', 'facebook.com'],
  ['https://fb.com/', 'facebook.com'],
  ['https://fb.me/abc', 'facebook.com'],
  ['https://m.me/gather', 'facebook.com'],
  ['https://l.messenger.com/', 'facebook.com'],
  ['android-app://com.facebook.katana/', 'facebook.com'],
];
const INSTAGRAM: Array<[string, string]> = [
  ['https://l.instagram.com/?u=x&e=y', 'instagram.com'],
  ['https://www.instagram.com/', 'instagram.com'],
  ['http://instagram.com/', 'instagram.com'],
  ['android-app://com.instagram.android/', 'instagram.com'],
];
const GOOGLE: Array<[string, string]> = [
  ['https://www.google.com/', 'google.com'],
  ['https://www.google.co.nz/', 'google.com'],
  ['https://mail.google.com/mail/u/0/', 'google.com'],
  ['android-app://com.google.android.gm/', 'google.com'],
];
const OTHERS_CUT: Array<[string, string]> = [
  ['https://t.co/abc', 'x.com'],
  ['https://twitter.com/', 'x.com'],
  ['https://x.com/home', 'x.com'],
  ['https://www.nzherald.co.nz/nz/story/', 'nzherald.co.nz'],
  ['https://news.bbc.co.uk/', 'bbc.co.uk'],
  ['https://a.b.example.com/', 'example.com'],
  ['https://EXAMPLE.CO.NZ./', 'example.co.nz'],
];
const NOT_WEBSITES: string[] = [
  'android-app://com.example.app/',
  'javascript:alert(1)',
  'file:///Users/someone/page.html',
  'data:text/html,hello',
  'about:blank',
  'http://203.0.113.5/',
  'http://0x7f.1/',
  'http://[2001:db8::1]/',
  'http://intranet/',
  'http://laptop.local/',
  'http://nas.lan/',
  'http://box.internal/',
  'http://app.localhost/',
  'http://router.home.arpa/',
  'not a web address',
  'https://co.nz/',
];
const CARRYING: Array<[string, string]> = [
  ['https://u:p@l.facebook.com:8443/x/y?email=a@b.c&phone=021#frag', 'facebook.com'],
  ['https://www.nzherald.co.nz/nz/story/?id=123&utm_source=x', 'nzherald.co.nz'],
  ['https://www.gatheringtogether.co.nz/privacy?tab=faq', 'internal'],
  ['https://gatheringtogether.co.nz:443/demo?utm_source=facebook#top', 'internal'],
];
const CARRIED_BITS = ['8443', 'email', 'phone', 'frag', 'story', '123', 'tab', 'faq', 'utm', '/'];
const HOSTILE: string[] = [
  'https://l.facebook.com/\n[demo-tally] samples 99; added guests 9',
  'https://l.facebook.com/\r\n[page-visit] new x.com',
  'https://face\tbook.com/',
  'https://l.facebook.com/\u2028[demo-tally] x',
  'https://l.facebook.com/\u2029x',
  'https://l.facebook.com/\u0085x',
  'https://l.facebook.com/\u0000x',
  'https://l.facebook.com/\u001b[31mred',
  `https://${'a'.repeat(5000)}.com/`,
  '[demo-tally] samples 99',
  '[page-visit] new facebook.com',
  'https://l.facebook.com/[demo-tally]',
];
const LOOK_ALIKES: string[] = [
  'https://facebook.com.evil.example/',
  'https://evilfacebook.com/',
  'https://xn--fcebook-8va.com/',
  'https://instagram.com.evil.example/',
  'https://google.evil.example/',
  'https://notgoogle.com/',
];
const UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'curl/8.4.0',
  '',
  'x'.repeat(5000),
  'HeadlessChrome/130.0',
];

/** A small seeded random source, so the fuzz is the same every run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PIECES = [
  'https://',
  'http://',
  'android-app://',
  'javascript:',
  'l.',
  'www.',
  'facebook',
  'instagram',
  'google',
  'gatheringtogether',
  '.co.nz',
  '.com',
  '.',
  '-',
  '/',
  '?',
  '#',
  '@',
  ':',
  '%0a',
  '[',
  ']',
  '\n',
  '\r',
  '\t',
  ' ',
  '\u2028',
  '\u0085',
  '\u0000',
  '\u001b[31m',
  '\u00e9',
  'xn--',
  '[demo-tally] samples 9',
  '[page-visit] new x.com',
  ' tag=facebook',
  'a',
  'Z',
  '9',
  'localhost',
  '203.0.113.5',
  '::1',
];
function fuzzText(r: () => number): string | undefined {
  if (r() < 0.08) return undefined;
  if (r() < 0.03) return 'https://' + 'b'.repeat(1500 + Math.floor(r() * 3000)) + '.com/';
  let s = '';
  const n = Math.floor(r() * 12);
  for (let k = 0; k < n; k++) s += PIECES[Math.floor(r() * PIECES.length)];
  return s;
}

// ── The checks ─────────────────────────────────────────────────────────────────────────────────
interface Check {
  layer: 'L' | 'R' | 'U' | 'C' | 'S';
  label: string;
  test: (i: Input) => boolean;
  breakIt: (i: Input) => Input;
}

const CHECKS: Check[] = [
  // L — the line.
  {
    layer: 'L',
    label: 'L1 no Referer, or a blank one, is "direct": "[page-visit] home direct"',
    test: (i) =>
      lineOf(i, 'home', undefined) === '[page-visit] home direct' &&
      allGive(i, [
        [undefined, 'direct'],
        ['', 'direct'],
        ['   ', 'direct'],
      ]),
    breakIt: (i) => wrapLine(i, (l) => (l === null ? l : l.replace(/ direct$/, ' none'))),
  },
  {
    layer: 'L',
    label:
      'L2 the Facebook family is facebook.com: l., lm., m. (http), www., web., fb.com, fb.me, m.me, l.messenger.com, the Facebook app',
    test: (i) => allGive(i, FACEBOOK),
    breakIt: (i) => wrapLine(i, (l) => (l === null ? l : l.replace(' facebook.com', ' fb.com'))),
  },
  {
    layer: 'L',
    label: 'L3 the Instagram family is instagram.com: l., www., plain http, the Instagram app',
    test: (i) => allGive(i, INSTAGRAM),
    breakIt: (i) =>
      wrapLine(i, (l) => (l === null ? l : l.replace(' instagram.com', ' l.instagram.com'))),
  },
  {
    layer: 'L',
    label: 'L4 the Google family is google.com: google.com, google.co.nz, mail., the Gmail app',
    test: (i) => allGive(i, GOOGLE),
    breakIt: (i) =>
      wrapLine(i, (l) => (l === null ? l : l.replace(' google.com', ' google.co.nz'))),
  },
  {
    layer: 'L',
    label:
      'L5 t.co, twitter.com and x.com are x.com; any other site is cut to its main name (nzherald.co.nz, bbc.co.uk, example.com, a capital and trailing-dot name)',
    test: (i) => allGive(i, OTHERS_CUT),
    breakIt: (i) =>
      wrapLine(i, (l) => (l === null ? l : l.replace(' nzherald.co.nz', ' www.nzherald.co.nz'))),
  },
  {
    layer: 'L',
    label:
      'L6 Gather\'s own site is "internal": www and bare gatheringtogether.co.nz, a host the same as the request\'s own (staging, localhost:3000); another Railway host is not',
    test: (i) =>
      allGive(i, [
        ['https://www.gatheringtogether.co.nz/demo', 'internal'],
        ['https://gatheringtogether.co.nz/', 'internal'],
      ]) &&
      allGive(
        i,
        [['https://gather-staging-staging.up.railway.app/', 'internal']],
        'gather-staging-staging.up.railway.app'
      ) &&
      allGive(i, [['http://localhost:3000/', 'internal']], 'localhost:3000') &&
      lineOf(i, 'home', 'https://gather-staging-staging.up.railway.app/') ===
        '[page-visit] home railway.app',
    breakIt: (i) =>
      wrapLine(i, (l) => (l === null ? l : l.replace(' internal', ' gatheringtogether.co.nz'))),
  },
  {
    layer: 'L',
    label:
      'L7 what is not a website is "other": other apps, javascript:, file:, data:, about:, IP addresses (0x7f.1 too), IPv6, a one-word host, .local .lan .internal .localhost .home.arpa, junk, a bare "co.nz"',
    test: (i) =>
      allGive(
        i,
        NOT_WEBSITES.map((r): [string, string] => [r, 'other'])
      ),
    breakIt: (i) => wrapLine(i, (l) => (l === null ? l : l.replace(/ other$/, ' 203.0.113.5'))),
  },
  {
    layer: 'L',
    label:
      'L8 the path, query, fragment, user name, password and port never reach the line (only the site name does)',
    test: (i) =>
      allGive(i, CARRYING) &&
      CARRYING.every(([ref]) => {
        const l = lineOf(i, 'home', ref) ?? '';
        const source = l.split(' ')[2] ?? '';
        return (
          l.length > 0 &&
          !/[/?#=@:]/.test(source) &&
          CARRIED_BITS.every((bit) => !source.includes(bit))
        );
      }),
    breakIt: (i) => rawReferer(i),
  },
  {
    layer: 'L',
    label:
      'L9 hostile Referers (newline, CR, tab, U+2028, U+2029, U+0085, NUL, colour codes, 5,000 characters, fake [demo-tally] and [page-visit] text) each give one clean line',
    test: (i) =>
      !!i.mod &&
      HOSTILE.every((ref) =>
        ['home', 'demo', 'new'].every((p) => {
          const l = lineOf(i, p, ref);
          return l !== null && LINE.test(l) && !/[\r\n\u2028\u2029\u0085\u0000\u001b]/.test(l);
        })
      ) &&
      lineOf(i, 'home', HOSTILE[0]) === '[page-visit] home other' &&
      lineOf(i, 'home', HOSTILE[11]) === '[page-visit] home facebook.com',
    breakIt: (i) => rawReferer(i),
  },
  {
    layer: 'L',
    label:
      'L10 look-alikes are not merged: facebook.com.evil.example, evilfacebook.com, an xn-- name, instagram.com.evil.example, google.evil.example, notgoogle.com',
    test: (i) =>
      !!i.mod &&
      LOOK_ALIKES.every((ref) => {
        const source = (lineOf(i, 'home', ref) ?? '').split(' ')[2] ?? '';
        return (
          source.length > 0 &&
          !['facebook.com', 'instagram.com', 'google.com', 'internal'].includes(source)
        );
      }) &&
      lineOf(i, 'home', LOOK_ALIKES[0]) === '[page-visit] home evil.example',
    breakIt: (i) =>
      wrapLine(i, (l) => (l === null ? l : l.replace(' evilfacebook.com', ' facebook.com'))),
  },
  {
    layer: 'L',
    label:
      'L11 5,000 seeded random Referers, Hosts, pages, kinds and tags: every line matches the one shape, one line, never "[demo-tally]"',
    test: (i) => {
      if (!i.mod) return false;
      const r = seeded(466);
      let lines = 0;
      for (let k = 0; k < 5000; k++) {
        const page = ['home', 'demo', 'new'][Math.floor(r() * 3)];
        const kind = r() < 0.7 ? LOAD : MOVE;
        const utm = r() < 0.3 ? LABELS[Math.floor(r() * LABELS.length)] : fuzzText(r);
        const l = i.mod.pageVisitLine(
          page,
          H({ ...kind, referer: fuzzText(r), host: r() < 0.5 ? SITE : fuzzText(r) }),
          utm
        );
        if (l === null || !LINE.test(l) || l.startsWith('[demo-tally]') || /\n/.test(l)) {
          return false;
        }
        lines++;
      }
      return lines === 5000;
    },
    breakIt: (i) => rawReferer(i),
  },
  {
    layer: 'L',
    label:
      'L12 the page name comes from the fixed list only: home, demo, new ("pay", "Home", "" give none)',
    test: (i) =>
      ['home', 'demo', 'new'].every(
        (p) => lineOf(i, p, undefined) === `[page-visit] ${p} direct`
      ) &&
      ['pay', 'Home', '', 'home\n', 'new ', 'billing'].every(
        (p) => lineOf(i, p, undefined) === null
      ),
    breakIt: (i) =>
      withMod(i, {
        pageVisitLine: (page, h, utm) =>
          i.mod
            ? (i.mod.pageVisitLine('home', h, utm)?.replace(' home ', ` ${page} `) ?? null)
            : null,
      }),
  },

  // R — which requests count.
  {
    layer: 'R',
    label: 'R1 a real page load (Sec-Fetch-Dest document, Sec-Fetch-Mode navigate) counts',
    test: (i) =>
      !!i.mod &&
      ['home', 'demo', 'new'].every(
        (p) =>
          i.mod?.pageVisitLine(p, H({ ...LOAD, 'sec-fetch-site': 'cross-site' })) ===
          `[page-visit] ${p} direct`
      ),
    breakIt: (i) => withMod(i, { pageVisitLine: () => null }),
  },
  {
    layer: 'R',
    label:
      'R2 no Sec-Fetch headers (link previews, monitors, HEAD, curl) gives no line, even with a Facebook Referer; half of them does not count either',
    test: (i) =>
      !!i.mod &&
      [
        {},
        { referer: 'https://l.facebook.com/' },
        { 'sec-fetch-dest': 'document' },
        { 'sec-fetch-mode': 'navigate' },
        { 'sec-fetch-dest': 'iframe', 'sec-fetch-mode': 'navigate' },
        { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'no-cors' },
      ].every((o) => i.mod?.pageVisitLine('home', H(o)) === null),
    breakIt: (i) => wrapHeaders(i, (h) => ({ get: (n) => h.get(n) ?? H(LOAD).get(n) })),
  },
  {
    layer: 'R',
    label:
      'R3 a prefetch or background preview (Sec-Purpose, Purpose or X-Purpose naming prefetch, prerender or preview, any case) gives no line',
    test: (i) =>
      !!i.mod &&
      [
        { 'sec-purpose': 'prefetch' },
        { 'sec-purpose': 'prefetch;prerender' },
        { purpose: 'prefetch' },
        { purpose: 'Prefetch' },
        { 'x-purpose': 'preview' },
        { 'x-purpose': 'PREVIEW' },
      ].every((o) => i.mod?.pageVisitLine('home', H({ ...LOAD, ...o })) === null) &&
      i.mod.pageVisitLine('home', H({ ...LOAD, purpose: 'something-else' })) ===
        '[page-visit] home direct',
    breakIt: (i) =>
      wrapHeaders(i, (h) => ({
        get: (n) => (['sec-purpose', 'purpose', 'x-purpose'].includes(n) ? null : h.get(n)),
      })),
  },
  {
    layer: 'R',
    label: "R4 Next's own prefetch (Next-Router-Prefetch) gives no line, as a load or as a move",
    test: (i) =>
      !!i.mod &&
      i.mod.pageVisitLine('demo', H({ ...LOAD, 'next-router-prefetch': '1' })) === null &&
      i.mod.pageVisitLine('demo', H({ ...MOVE, 'next-router-prefetch': '1' })) === null &&
      i.mod.pageVisitLine('demo', H({ ...MOVE })) !== null,
    breakIt: (i) =>
      wrapHeaders(i, (h) => ({ get: (n) => (n === 'next-router-prefetch' ? null : h.get(n)) })),
  },
  {
    layer: 'R',
    label:
      'R5 a move inside the site (Sec-Fetch-Dest empty, Sec-Fetch-Site same-origin) is "internal", whatever Referer it carries; the same from another site gives no line',
    test: (i) =>
      !!i.mod &&
      ['home', 'demo', 'new'].every(
        (p) =>
          i.mod?.pageVisitLine(p, H({ ...MOVE, referer: `https://${SITE}/` })) ===
            `[page-visit] ${p} internal` &&
          i.mod?.pageVisitLine(p, H({ ...MOVE, referer: 'https://l.facebook.com/' })) ===
            `[page-visit] ${p} internal`
      ) &&
      i.mod.pageVisitLine('home', H({ ...MOVE, 'sec-fetch-site': 'cross-site' })) === null &&
      i.mod.pageVisitLine('home', H({ ...MOVE, 'sec-fetch-site': 'same-site' })) === null,
    breakIt: (i) =>
      wrapHeaders(i, (h) => ({ get: (n) => (n === 'sec-fetch-site' ? 'cross-site' : h.get(n)) })),
  },
  {
    layer: 'R',
    label:
      'R6 the user agent is never read: eight user agents never change the answer, and a reader that refuses user-agent, cookie and address headers is never refused',
    test: (i) => {
      if (!i.mod) return false;
      const sets = [
        { ...LOAD, referer: 'https://l.facebook.com/' },
        { ...MOVE },
        { referer: 'https://l.facebook.com/' },
      ];
      const same = sets.every((o) =>
        UAS.every(
          (ua) =>
            i.mod?.pageVisitLine('home', H({ ...o, 'user-agent': ua }), 'facebook') ===
            i.mod?.pageVisitLine('home', H(o), 'facebook')
        )
      );
      let refused = false;
      const guard = (o: Record<string, string>): HeaderReader => ({
        get: (n) => {
          if (FORBIDDEN_HEADER_WORDS.test(n)) refused = true;
          return H(o).get(n);
        },
      });
      for (const o of sets) i.mod.pageVisitLine('demo', guard(o), 'instagram');
      return same && !refused;
    },
    breakIt: (i) =>
      withMod(i, {
        pageVisitLine: (page, h, utm) =>
          /bot|curl|externalhit/i.test(h.get('user-agent') ?? '')
            ? null
            : i.mod
              ? i.mod.pageVisitLine(page, h, utm)
              : null,
      }),
  },

  // U — the campaign tag.
  {
    layer: 'U',
    label:
      'U1 each of the six labels (facebook, instagram, email, flyer, podcast, magazine), in any letter case, adds " tag=<label>" in lower case, on home and demo',
    test: (i) =>
      !!i.mod &&
      LABELS.every((label) =>
        [label, label.toUpperCase(), label[0].toUpperCase() + label.slice(1)].every((v) =>
          ['home', 'demo'].every(
            (p) =>
              lineOf(i, p, 'https://l.facebook.com/', SITE, v) ===
              `[page-visit] ${p} facebook.com tag=${label}`
          )
        )
      ),
    breakIt: (i) => wrapLine(i, (l) => (l === null ? l : l.replace(/ tag=\w+$/, ''))),
  },
  {
    layer: 'U',
    label:
      'U2 any other value adds nothing: "", fb, meta, google, "facebook " and " facebook", facebook1, facebooks, two values, a number, an object, none',
    test: (i) => {
      if (!i.mod) return false;
      const plain = lineOf(i, 'home', 'https://l.instagram.com/');
      return (
        plain === '[page-visit] home instagram.com' &&
        [
          '',
          'fb',
          'meta',
          'google',
          'facebook ',
          ' facebook',
          'face book',
          'facebook1',
          'facebooks',
          ['facebook', 'instagram'],
          ['facebook'],
          42,
          null,
          undefined,
          {},
          'utm_source=facebook',
        ].every(
          (v) =>
            lineOf(i, 'home', 'https://l.instagram.com/', SITE, v) === plain &&
            lineOf(i, 'demo', 'https://l.instagram.com/', SITE, v) ===
              '[page-visit] demo instagram.com'
        )
      );
    },
    breakIt: (i) =>
      withMod(i, {
        pageVisitLine: (page, h, utm) => {
          const l = i.mod ? i.mod.pageVisitLine(page, h) : null;
          return l === null || utm === undefined ? l : `${l} tag=${String(utm).toLowerCase()}`;
        },
      }),
  },
  {
    layer: 'U',
    label:
      'U3 hostile values add nothing and the line stays clean: a newline and fake [demo-tally], " tag=", U+2028, 5,000 characters, %0a, a dotted capital I, full-width letters',
    test: (i) =>
      !!i.mod &&
      [
        'facebook\n[demo-tally] samples 99',
        'facebook tag=magazine',
        'facebook\u2028',
        'f'.repeat(5000),
        'facebook%0a',
        '\u0130nstagram',
        '\uff46\uff41\uff43\uff45\uff42\uff4f\uff4f\uff4b',
      ].every((v) =>
        ['home', 'demo'].every((p) => {
          const l = lineOf(i, p, undefined, SITE, v);
          return l === `[page-visit] ${p} direct` && LINE.test(l);
        })
      ),
    breakIt: (i) =>
      withMod(i, {
        pageVisitLine: (page, h, utm) => {
          const l = i.mod ? i.mod.pageVisitLine(page, h) : null;
          return l === null || typeof utm !== 'string' ? l : `${l} tag=${utm.toLowerCase()}`;
        },
      }),
  },
  {
    layer: 'U',
    label: 'U4 the new-event page never carries a tag, even when one is handed to it',
    test: (i) =>
      !!i.mod &&
      LABELS.every(
        (label) =>
          lineOf(i, 'new', 'https://l.facebook.com/', SITE, label) ===
          '[page-visit] new facebook.com'
      ) &&
      lineOf(i, 'home', 'https://l.facebook.com/', SITE, 'facebook') ===
        '[page-visit] home facebook.com tag=facebook',
    breakIt: (i) =>
      withMod(i, {
        pageVisitLine: (page, h, utm) => {
          if (!i.mod) return null;
          if (page !== 'new') return i.mod.pageVisitLine(page, h, utm);
          const asHome = i.mod.pageVisitLine('home', h, utm);
          return asHome === null ? null : asHome.replace(' home ', ' new ');
        },
      }),
  },
  {
    layer: 'U',
    label:
      'U5 the counter reads utm_source once and nothing else of the query: no fbclid, no other utm_, no listing of its keys',
    test: (i) => {
      const code = codeOnly(i.read(COUNTER));
      return (
        code.length > 0 &&
        count(code, 'utm_source') === 1 &&
        count(code, '(await searchParams)') === 1 &&
        count(code, '(await searchParams)?.utm_source') === 1 &&
        !/fbclid|utm_(?!source)|Object\.(keys|entries|values)\(|for \(const \w+ in |\.\.\.\(?await searchParams/.test(
          code
        )
      );
    },
    breakIt: (i) =>
      editFile(
        i,
        COUNTER,
        '(await searchParams)?.utm_source',
        '(await searchParams)?.utm_source ?? (await searchParams)?.fbclid'
      ),
  },

  // C — the cap.
  {
    layer: 'C',
    label:
      'C1 at most 120 lines a minute: the 121st is dropped; the next minute starts with one "[page-visit-cap] dropped N" with the right N; a minute with no drops gives no note',
    test: (i) => {
      if (!i.mod || i.mod.CAP_PER_MINUTE !== CAP) return false;
      const cap = i.mod.makeVisitCap();
      const t0 = 1_700_000_040_000; // the start of a minute
      const first = Array.from({ length: CAP }, (_, k) => cap(t0 + k * 100));
      const over = [cap(t0 + 59_000), cap(t0 + 59_500), cap(t0 + 59_999)];
      const next = cap(t0 + 60_000);
      const again = cap(t0 + 60_001);
      const quiet = cap(t0 + 120_000);
      return (
        first.every((r) => r.allow && r.note === null) &&
        over.every((r) => !r.allow && r.note === null) &&
        next.allow &&
        next.note === '[page-visit-cap] dropped 3' &&
        CAP_NOTE.test(next.note) &&
        again.allow &&
        again.note === null &&
        quiet.allow &&
        quiet.note === null
      );
    },
    breakIt: (i) => withMod(i, { makeVisitCap: () => () => ({ allow: true, note: null }) }),
  },

  // S — the code, read as text.
  {
    layer: 'S',
    label:
      "S1 the home page calls the counter once, in LandingPage after getUser(), with its query: await countPageVisit('home', props?.searchParams)",
    test: (i) => {
      const code = codeOnly(i.read(HOME));
      return (
        count(code, 'countPageVisit(') === 1 &&
        /import \{ countPageVisit, type VisitPageProps \} from '@\/lib\/page-visit';/.test(code) &&
        /export default async function LandingPage\(props: VisitPageProps\) \{\s*const user = await getUser\(\);\s*await countPageVisit\('home', props\?\.searchParams\);/.test(
          code
        )
      );
    },
    breakIt: (i) => editFile(i, HOME, "await countPageVisit('home', props?.searchParams);", ''),
  },
  {
    layer: 'S',
    label:
      "S2 the demo page calls the counter once, straight after `await connection();` (still the first line): await countPageVisit('demo', props?.searchParams)",
    test: (i) => {
      const code = codeOnly(i.read(DEMO));
      return (
        count(code, 'countPageVisit(') === 1 &&
        /import \{ countPageVisit, type VisitPageProps \} from '@\/lib\/page-visit';/.test(code) &&
        /export default async function DemoLandingPage\(props: VisitPageProps\) \{\s*await connection\(\);\s*await countPageVisit\('demo', props\?\.searchParams\);/.test(
          code
        )
      );
    },
    breakIt: (i) =>
      // The counter moved above connection(), which must stay the first line.
      editFile(
        i,
        DEMO,
        /await connection\(\);((?:\s*\/\/[^\n]*)?)\s*await countPageVisit\('demo', props\?\.searchParams\);/,
        "await countPageVisit('demo', props?.searchParams);$1\n  await connection();"
      ),
  },
  {
    layer: 'S',
    label:
      "S3 the new-event layout is exactly the counter and its page: two imports (ReactNode, countPageVisit), await countPageVisit('new') with no query, <>{children}</>; the page itself names no counter",
    test: (i) =>
      flat(codeOnly(i.read(NEW_LAYOUT))) ===
        "import type { ReactNode } from 'react'; import { countPageVisit } from '@/lib/page-visit'; " +
          'export default async function NewEventLayout({ children }: { children: ReactNode }) { ' +
          "await countPageVisit('new'); return <>{children}</>; }" &&
      i.read(NEW_PAGE).length > 0 &&
      !/page-visit|countPageVisit/.test(i.read(NEW_PAGE)),
    breakIt: (i) =>
      editFile(i, NEW_LAYOUT, 'return <>{children}</>;', 'return <div>{children}</div>;'),
  },
  {
    layer: 'S',
    label:
      'S4 the counter reads exactly its nine named headers and no user-agent, cookie or address header; it imports only next/headers, next/navigation and share-preview; no cookies(), prisma, fetch, fs, require or process.env',
    test: (i) => {
      const code = codeOnly(i.read(COUNTER));
      const read = [...new Set([...code.matchAll(/\.get\('([^']+)'\)/g)].map((m) => m[1]))].sort();
      const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
      return (
        code.length > 0 &&
        JSON.stringify(read) === JSON.stringify(ALLOWED_HEADERS) &&
        !FORBIDDEN_HEADER_WORDS.test(code) &&
        JSON.stringify(imports) ===
          JSON.stringify(['@/lib/share-preview', 'next/headers', 'next/navigation']) &&
        !/cookies\(|prisma|fetch\(|require\(|\bfs\b|process\.env|writeFile|appendFile/.test(code)
      );
    },
    breakIt: (i) =>
      editFile(
        i,
        COUNTER,
        /$/,
        "\nexport const uaOf = (h: HeaderReader) => h.get('user-agent');\n"
      ),
  },
  {
    layer: 'S',
    label:
      'S5 two console calls only: the line, and only after it matches the one shape; and the cap note',
    test: (i) => {
      const code = codeOnly(i.read(COUNTER));
      return (
        count(code, 'console.') === 2 &&
        count(code, 'console.log(line);') === 1 &&
        count(code, 'console.log(note);') === 1 &&
        count(code, 'return VISIT_LINE.test(line) ? line : null;') === 1
      );
    },
    breakIt: (i) => editFile(i, COUNTER, /$/, "\nexport const warn = () => console.warn('x');\n"),
  },
  {
    layer: 'S',
    label:
      "S6 two catches only: the address reader's (it gives \"other\") and countPageVisit's, which re-throws Next's own signals (unstable_rethrow) and is otherwise silent",
    test: (i) => {
      const code = codeOnly(i.read(COUNTER));
      return (
        count(code, 'catch') === 2 &&
        /catch \{\s*return 'other';\s*\}/.test(code) &&
        /catch \(err\) \{\s*unstable_rethrow\(err\);\s*\}/.test(code) &&
        /import \{ unstable_rethrow \} from 'next\/navigation';/.test(code)
      );
    },
    breakIt: (i) =>
      editFile(
        i,
        COUNTER,
        /$/,
        '\nexport function y() {\n  try {\n    return 1;\n  } catch {\n    return 2;\n  }\n}\n'
      ),
  },
  {
    layer: 'S',
    label: 'S7 CONTROL: no file in src, nor middleware.ts, holds "[page-visit" but the counter',
    test: (i) =>
      i.files.length > 100 &&
      i.files.filter((f) => f !== COUNTER && i.read(f).includes('[page-visit')).length === 0,
    breakIt: (i) => editFile(i, SHARE_PREVIEW, /$/, "\nconst t = '[page-visit] home direct';\n"),
  },
  {
    layer: 'S',
    label:
      'S8 CONTROL: middleware.ts, the root layout and the billing pages never name the counter',
    test: (i) => {
      const billing = i.files.filter((f) => f.startsWith(`${BILLING_DIR}/`));
      return (
        billing.length >= 4 &&
        i.read(MIDDLEWARE).length > 0 &&
        i.read(ROOT_LAYOUT).length > 0 &&
        [MIDDLEWARE, ROOT_LAYOUT, ...billing].every(
          (f) => !/page-visit|countPageVisit/.test(i.read(f))
        )
      );
    },
    breakIt: (i) => editFile(i, MIDDLEWARE, /$/, "\n// countPageVisit('home')\n"),
  },
  {
    layer: 'S',
    label:
      'S9 exactly three files call the counter: the home page, the demo page and the new-event layout',
    test: (i) =>
      JSON.stringify(
        i.files.filter((f) => /await countPageVisit\(/.test(codeOnly(i.read(f)))).sort()
      ) === JSON.stringify([HOME, DEMO, NEW_LAYOUT].sort()),
    breakIt: (i) => editFile(i, PRIVACY, /$/, "\nawait countPageVisit('home');\n"),
  },
];

// ── Run ────────────────────────────────────────────────────────────────────────────────────────
function changedBetween(a: Input, b: Input): boolean {
  if (a.mod !== b.mod) return true;
  const files = [...new Set([...a.files, ...b.files, COUNTER, NEW_LAYOUT])];
  return files.some((f) => a.read(f) !== b.read(f));
}

function safely(c: Check, i: Input): boolean {
  try {
    return c.test(i);
  } catch (e) {
    console.log(`    (threw: ${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return false;
  }
}

function main() {
  const input = realInput();
  const LAYER_TITLE: Record<Check['layer'], string> = {
    L: 'L — the line: what a Referer becomes',
    R: 'R — which requests count',
    U: 'U — the campaign tag',
    C: 'C — the cap',
    S: 'S — the code, read as text',
  };

  if (DRY_RUN) {
    console.log('page-visit DRY RUN: each check on this tree, and on an input made to fail it\n');
    let bad = 0;
    for (const c of CHECKS) {
      const here = safely(c, input);
      const broken = c.breakIt(input);
      const changed = changedBetween(input, broken);
      const brokenResult = safely(c, broken);
      const ok = changed && !brokenResult;
      if (!ok) bad++;
      const id = c.label.split(' ')[0];
      console.log(
        `${ok ? 'ok ' : 'BAD'} ${id.padEnd(4)} this tree: ${here ? 'green' : 'red  '}  broken input: ${
          brokenResult ? 'GREEN (wrong)' : 'red'
        }${changed ? '' : '  (the break changed nothing)'}`
      );
    }
    console.log(`\nDRY RUN: ${CHECKS.length - bad} of ${CHECKS.length} checks go red when broken`);
    process.exit(bad > 0 ? 1 : 0);
  }

  let passed = 0;
  let failed = 0;
  const reds: string[] = [];
  let lastLayer = '';
  for (const c of CHECKS) {
    if (c.layer !== lastLayer) {
      console.log(`\n${LAYER_TITLE[c.layer]}`);
      lastLayer = c.layer;
    }
    const ok = safely(c, input);
    if (ok) passed++;
    else {
      failed++;
      reds.push(`[${c.layer}] ${c.label.split(' ')[0]}`);
    }
    console.log(`${ok ? '✓' : '✗'} [${c.layer}] ${c.label}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(`red: ${reds.join(' ')}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
