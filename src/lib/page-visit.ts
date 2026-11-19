/**
 * [[GTC-466]] — THE VISIT COUNT. One plain line in the server log for each real load of the home
 * page, /demo and the new-event page (/plan/new), with no cookie and no address (founder ruling of
 * 15 Nov 2026, "a simple daily count, no cookies or addresses", and the rulings of 19 Nov 2026,
 * verbatim in docs/tickets/GTC-466.md):
 *
 *   [page-visit] <page> <source>[ tag=<label>]
 *
 *   page    home, demo or new: from the code, never from the request.
 *   source  where the browser says the visitor came from, cut to the site's main name
 *           (facebook.com, instagram.com, google.com, nzherald.co.nz); "internal" for Gather's
 *           own pages and for a move inside the site; "direct" when no Referer comes; "other"
 *           when what comes is not a usable website name.
 *   tag     on the home page and /demo only: utm_source, lowercased, when it is one of
 *           CAMPAIGN_LABELS. Nothing else of the query is read.
 *
 * Read from the request: the Referer, the Host, and the browser's and Next's own fetch headers,
 * nothing else. Never the browser's description of itself, a cookie or an internet address.
 * Nothing is stored; the line goes to the server log, which the host (Railway) keeps.
 *
 * The Referer comes from outside and is treated as hostile: the line is built from fixed words and
 * a name of a-z, 0-9, dots and hyphens only, and is checked against VISIT_LINE before it is
 * printed, so it can never carry a newline, a space or a "[" from outside.
 */
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { SITE_URL } from '@/lib/share-preview';

export const VISIT_PAGES = ['home', 'demo', 'new'] as const;
export type VisitPage = (typeof VISIT_PAGES)[number];

/** Founder ruling Q8 (19 Nov 2026): the only campaign labels a line may carry. */
export const CAMPAIGN_LABELS = [
  'facebook',
  'instagram',
  'email',
  'flyer',
  'podcast',
  'magazine',
] as const;

/** Founder ruling Q9 (19 Nov 2026): at most this many lines a minute from one server. */
export const CAP_PER_MINUTE = 120;

/** Next's query for a page, read here for utm_source only. */
export type VisitSearchParams = Promise<Record<string, string | string[] | undefined>>;
/** A counted page's props: its query, which only the home page and /demo hand over. */
export type VisitPageProps = { searchParams: VisitSearchParams };

/** The one shape a line may have. Nothing else is ever printed as a visit. */
export const VISIT_LINE =
  /^\[page-visit\] (home|demo|new) (direct|internal|other|[a-z0-9][a-z0-9.-]{0,63})( tag=(facebook|instagram|email|flyer|podcast|magazine))?$/;

interface HeaderReader {
  get(name: string): string | null;
}

const MAX_REFERER = 2000;
const MAX_SOURCE = 64;

/** Gather's own site, with and without www. */
const SITE_HOST = new URL(SITE_URL).hostname;
const OWN_HOSTS = new Set([SITE_HOST, SITE_HOST.replace(/^www\./, '')]);

/** Endings of two parts, so a name keeps three: nzherald.co.nz, bbc.co.uk. */
const TWO_PART_ENDINGS = new Set([
  'co.nz',
  'org.nz',
  'net.nz',
  'govt.nz',
  'ac.nz',
  'school.nz',
  'geek.nz',
  'gen.nz',
  'kiwi.nz',
  'maori.nz',
  'iwi.nz',
  'health.nz',
  'mil.nz',
  'parliament.nz',
  'cri.nz',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'asn.au',
  'id.au',
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'me.uk',
  'ltd.uk',
  'plc.uk',
  'net.uk',
  'sch.uk',
  'nhs.uk',
]);

/** Private machines' names, which can carry a person's name: written as "other". */
const PRIVATE_ENDINGS = ['local', 'lan', 'internal', 'localhost', 'home.arpa'];

const FACEBOOK_NAMES = new Set(['facebook.com', 'fb.com', 'fb.me', 'm.me', 'messenger.com']);
const X_NAMES = new Set(['x.com', 't.co', 'twitter.com']);

/** Android apps that name themselves as the Referer (android-app://<app>/). */
const APPS: Record<string, string> = {
  'com.facebook.katana': 'facebook.com',
  'com.facebook.orca': 'facebook.com',
  'com.instagram.android': 'instagram.com',
  'com.google.android.gm': 'google.com',
};

/** What the Referer becomes: a site's main name, "internal", "direct" or "other". */
export function visitSource(referer: string | null, host: string | null): string {
  if (referer === null || referer.trim() === '') return 'direct';
  if (referer.length > MAX_REFERER || !/^[\x21-\x7e]+$/.test(referer)) return 'other';
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return 'other';
  }
  if (url.protocol === 'android-app:') return APPS[url.hostname] ?? 'other';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'other';
  const name = url.hostname.replace(/\.$/, '');
  const own = (host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (OWN_HOSTS.has(name) || (own !== '' && name === own)) return 'internal';
  if (!/^[a-z0-9.-]+$/.test(name) || /^[0-9.]+$/.test(name)) return 'other';
  const labels = name.split('.');
  if (labels.length < 2 || labels.some((label) => label === '')) return 'other';
  if (PRIVATE_ENDINGS.some((end) => name === end || name.endsWith(`.${end}`))) return 'other';
  const lastTwo = labels.slice(-2).join('.');
  const twoPart = TWO_PART_ENDINGS.has(lastTwo);
  if (twoPart && labels.length < 3) return 'other';
  const main = twoPart ? labels.slice(-3).join('.') : lastTwo;
  let source = main;
  if (FACEBOOK_NAMES.has(main)) source = 'facebook.com';
  else if (main === 'instagram.com') source = 'instagram.com';
  else if (main.split('.')[0] === 'google') source = 'google.com';
  else if (X_NAMES.has(main)) source = 'x.com';
  return source.length <= MAX_SOURCE && /^[a-z0-9][a-z0-9.-]*$/.test(source) ? source : 'other';
}

/**
 * Whether a request is a visit: "load" for a real page load, "move" for a move inside the site
 * (Next fetching the next page for a click), null for anything else — a prefetch, a background
 * preview, or a request without the browser's own fetch headers (link previews, monitors, HEAD).
 */
export function visitKind(h: HeaderReader): 'load' | 'move' | null {
  const purpose = `${h.get('sec-purpose') ?? ''} ${h.get('purpose') ?? ''} ${h.get('x-purpose') ?? ''}`;
  if (/prefetch|prerender|preview/i.test(purpose)) return null;
  if (h.get('next-router-prefetch') !== null) return null;
  const dest = h.get('sec-fetch-dest');
  if (dest === 'document' && h.get('sec-fetch-mode') === 'navigate') return 'load';
  if (dest === 'empty' && h.get('sec-fetch-site') === 'same-origin') return 'move';
  return null;
}

/** The campaign label for a utm_source value, or null: only an exact, listed label counts. */
export function campaignTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.toLowerCase();
  return (CAMPAIGN_LABELS as readonly string[]).includes(label) ? label : null;
}

/** The line for one request, or null when it is not a visit (or the line would not be clean). */
export function pageVisitLine(
  page: VisitPage,
  h: HeaderReader,
  utmSource?: unknown
): string | null {
  if (!(VISIT_PAGES as readonly string[]).includes(page)) return null;
  const kind = visitKind(h);
  if (kind === null) return null;
  const source = kind === 'move' ? 'internal' : visitSource(h.get('referer'), h.get('host'));
  const tag = page === 'new' ? null : campaignTag(utmSource);
  const line = `[page-visit] ${page} ${source}${tag === null ? '' : ` tag=${tag}`}`;
  return VISIT_LINE.test(line) ? line : null;
}

/**
 * The flood guard: at most `limit` lines a minute. A minute that follows one with drops starts
 * with one note, "[page-visit-cap] dropped N", so a reader of the log can see the cap was hit.
 */
export function makeVisitCap(limit: number = CAP_PER_MINUTE) {
  let minute = -1;
  let used = 0;
  let dropped = 0;
  return (nowMs: number): { allow: boolean; note: string | null } => {
    const thisMinute = Math.floor(nowMs / 60_000);
    let note: string | null = null;
    if (thisMinute !== minute) {
      if (dropped > 0) note = `[page-visit-cap] dropped ${dropped}`;
      minute = thisMinute;
      used = 0;
      dropped = 0;
    }
    if (used < limit) {
      used++;
      return { allow: true, note };
    }
    dropped++;
    return { allow: false, note };
  };
}

const cap = makeVisitCap();

/**
 * Writes the page's one line for this request, if it is a visit. It never throws and never stops
 * a page drawing; Next's own signals (a page drawn per request, not ahead of time) pass through.
 */
export async function countPageVisit(
  page: VisitPage,
  searchParams?: VisitSearchParams
): Promise<void> {
  try {
    const h = await headers();
    if (visitKind(h) === null) return;
    const utmSource =
      page === 'new' || !searchParams ? undefined : (await searchParams)?.utm_source;
    const line = pageVisitLine(page, h, utmSource);
    if (line === null) return;
    const { allow, note } = cap(Date.now());
    if (note !== null) console.log(note);
    if (allow) console.log(line);
  } catch (err) {
    unstable_rethrow(err);
  }
}
