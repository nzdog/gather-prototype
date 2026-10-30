/**
 * [[GTC-428]] — THE DESIGNED GUEST EMAIL: the html part sent beside the plain text.
 *
 * Founder rulings, 30 Oct 2026 (tweaks 8 and 14). The guest emails (the invitation, the reminder,
 * the decide-by follow-up, the by-hand nudge and the wrap-up thank-you) and the host's own test
 * carry a designed html part. The plain text is NOT changed by one byte: it is built exactly as
 * before and this module only reads it. The sign-in link email and the welcome email are not
 * designed (ruling 1).
 *
 * WHAT IT DRAWS, from the plain text and nothing else:
 *   - the paragraphs as the text has them, in order (a blank line separates paragraphs; a single
 *     line break, as in the household list, stays a line break);
 *   - THE BUTTON (ruling 3): when the last word of the message is exactly one web link, the
 *     sentence before it is kept, the link becomes a button reading BUTTON_WORDS, and under it
 *     COPY_LINK_WORDS and the same link as plain text. Not a link: no button, never a guess;
 *   - THE LIST (ruling 2, the invitation only): the guest's own "Would you bring ...?" sentence,
 *     rebuilt exactly from the names the ask was composed from and found exactly once, becomes
 *     LIST_LEAD_IN and one bullet per dish, then per job. Not found once: no list;
 *   - THE FOOTER (ruling 4): the same words and links as the plain footer, in small grey type,
 *     read back out of the plain text (`withGuestEmailFooter` must rebuild it exactly).
 *
 * SAFETY: every piece of text put into the page is escaped; a link is drawn only when it is
 * https (or the app's own http://localhost in development). Email-safe: tables for layout, inline
 * styles only, a 600px column, system fonts, explicit light colours, no image, no web font, no
 * script, nothing fetched from anywhere.
 *
 * PURE: no database, no network, no environment read. Both senders that use it decide nothing.
 */
import {
  GATHER_CONTACT_EMAIL,
  GATHER_CONTACT_LINE,
  UNSUBSCRIBE_INVITATION,
  withGuestEmailFooter,
} from '@/lib/email-footer';
import { listOf } from '@/lib/messages/ask-register';
import { TEST_STOP_LINK_STAND_IN, testLinkStandIn } from '@/lib/preflight/test-email';

/** The guest's OWN dish and job names, as the ask was composed from (ruling 6). Optional. */
export interface GuestOwnNames {
  itemNames?: readonly string[];
  jobNames?: readonly string[];
}

/** The new words a guest reads, written here once. */
export const LIST_LEAD_IN = 'Would you take care of these?';
export const BUTTON_WORDS = 'Open your invitation';
export const COPY_LINK_WORDS = 'Button not working? Copy this link: ';

/** Sage 600, the theme's "sage dark" (#6B7869): white on it is 4.6 to 1. Sage 500 is 3.6. */
export const GATHER_GREEN = '#6B7869';

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = '#1f2937';
const GREY = '#6b7280';
const PAGE = '#f6f7f6';
const RULE = '#e3e6e3';

/** Text made safe to put in html, in a tag or in a quoted attribute. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** One web link and nothing else: https, or the app's own http://localhost in development. */
export function isSafeLink(s: string): boolean {
  return (
    /^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[^\s"'<>`\\]*)?$/.test(s) ||
    /^http:\/\/localhost(:\d+)?(\/[^\s"'<>`\\]*)?$/.test(s)
  );
}

/**
 * The guest's own item sentence exactly as the ask register builds it ("Would you bring the A and
 * the B, and do the C?"): `whatIsAsked` in src/lib/messages/ask-register.ts, decision 22's comma
 * included. Null with no names.
 */
export function itemSentence(
  itemNames: readonly string[],
  jobNames: readonly string[]
): string | null {
  const the = (names: readonly string[]) => listOf(names.map((n) => `the ${n}`));
  const bring = itemNames.length > 0 ? `bring ${the(itemNames)}` : null;
  const doing = jobNames.length > 0 ? `do ${the(jobNames)}` : null;
  if (!bring && !doing) return null;
  const joiner = itemNames.length > 1 ? ', and ' : ' and ';
  return `Would you ${[bring, doing].filter((p): p is string => p !== null).join(joiner)}?`;
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'button'; href: string | null; shown: string };

/** Paragraphs (split at blank lines), each a list of lines. */
function paragraphsOf(body: string): string[][] {
  return body
    .split('\n\n')
    .map((p) => p.split('\n'))
    .filter((lines) => lines.some((l) => l.trim() !== ''));
}

/** Where `needle` sits in `hay` as whole words, exactly once; -1 otherwise. */
function onceAt(hay: string, needle: string): number {
  const at: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    const before = i === 0 ? '' : hay[i - 1];
    const after = hay[i + needle.length] ?? '';
    if (/^\s?$/.test(before) && /^\s?$/.test(after)) at.push(i);
  }
  return at.length === 1 ? at[0] : -1;
}

/** The list to draw: the one sentence it replaces, and its bullets (dishes, then jobs). */
interface OwnList {
  sentence: string;
  items: string[];
}

/** The list for these names, or null when there are none. */
function ownList(names: GuestOwnNames): OwnList | null {
  if (!Array.isArray(names.itemNames ?? []) || !Array.isArray(names.jobNames ?? [])) return null;
  const sentence = itemSentence(names.itemNames ?? [], names.jobNames ?? []);
  return sentence
    ? { sentence, items: [...(names.itemNames ?? []), ...(names.jobNames ?? [])] }
    : null;
}

/**
 * The message as blocks: the paragraphs, the list in place of the one item sentence (when it is
 * found in the body exactly once), and the button after the last line (when `trailing` names
 * what ends the message: its text and the link, or null for a box that links nowhere).
 */
function blocksOf(
  body: string,
  own: OwnList | null,
  trailing: (lastLine: string) => { rest: string; href: string | null; shown: string } | null
): Block[] {
  const paras = paragraphsOf(body);
  let button: Block | null = null;
  const last = paras[paras.length - 1];
  if (last) {
    while (last.length > 0 && last[last.length - 1].trim() === '') last.pop();
    const end = last.length > 0 ? trailing(last[last.length - 1]) : null;
    if (end) {
      button = { kind: 'button', href: end.href, shown: end.shown };
      if (end.rest === '') last.pop();
      else last[last.length - 1] = end.rest;
      if (last.length === 0) paras.pop();
    }
  }
  const list = own && onceAt(body, own.sentence) >= 0 ? own : null;
  const blocks: Block[] = [];
  for (const lines of paras) {
    const j = list ? lines.findIndex((l) => onceAt(l, list.sentence) >= 0) : -1;
    if (!list || j < 0) {
      blocks.push({ kind: 'p', lines });
      continue;
    }
    const sentence = list.sentence;
    const at = onceAt(lines[j], sentence);
    const before = [...lines.slice(0, j), lines[j].slice(0, at).trimEnd()].filter((l) => l !== '');
    const after = [lines[j].slice(at + sentence.length).trimStart(), ...lines.slice(j + 1)].filter(
      (l) => l !== ''
    );
    if (before.length) blocks.push({ kind: 'p', lines: before });
    blocks.push({ kind: 'p', lines: [LIST_LEAD_IN] }, { kind: 'list', items: list.items });
    if (after.length) blocks.push({ kind: 'p', lines: after });
  }
  if (button) blocks.push(button);
  return blocks;
}

/** The trailing link of a guest message: its last word, when that word is one safe link. */
function guestLink(lastLine: string) {
  const line = lastLine.trimEnd();
  const space = line.lastIndexOf(' ');
  const word = line.slice(space + 1);
  if (!isSafeLink(word) || word.split('http').length !== 2) return null;
  return { rest: space < 0 ? '' : line.slice(0, space).trimEnd(), href: word, shown: word };
}

const STAND_IN_END = "'s own link goes here]";
/** The trailing stand-in of the host's test ("[Mere's own link goes here]"): a box, no link. */
function standInLink(lastLine: string) {
  const line = lastLine.trimEnd();
  const open = line.lastIndexOf('[');
  const tail = open < 0 ? '' : line.slice(open);
  if (!tail.endsWith(STAND_IN_END)) return null;
  const name = tail.slice(1, -STAND_IN_END.length);
  if (tail !== testLinkStandIn(name) || (open > 0 && line[open - 1] !== ' ')) return null;
  return { rest: line.slice(0, open).trimEnd(), href: null, shown: tail };
}

function para(lines: string[], style = ''): string {
  return `<p style="margin:0 0 16px 0;${style}">${lines.map(escapeHtml).join('<br>')}</p>`;
}

function blockHtml(b: Block): string {
  if (b.kind === 'p') return para(b.lines);
  if (b.kind === 'list') {
    const lis = b.items.map((i) => `<li style="margin:0 0 6px 0;">${escapeHtml(i)}</li>`).join('');
    return `<ul style="margin:0 0 16px 0;padding:0 0 0 24px;">${lis}</ul>`;
  }
  const look =
    `display:inline-block;padding:14px 28px;font-family:${FONT};font-size:17px;` +
    `line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;` +
    `background-color:${GATHER_GREEN};border-radius:6px;`;
  const inner = b.href
    ? `<a href="${escapeHtml(b.href)}" target="_blank" style="${look}">${escapeHtml(BUTTON_WORDS)}</a>`
    : `<span style="${look}">${escapeHtml(BUTTON_WORDS)}</span>`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px 0;">` +
    `<tr><td align="center" bgcolor="${GATHER_GREEN}" style="background-color:${GATHER_GREEN};border-radius:6px;">` +
    `${inner}</td></tr></table>` +
    para(
      [`${COPY_LINK_WORDS}${b.shown}`],
      `font-size:14px;line-height:20px;color:${GREY};word-break:break-all;`
    )
  );
}

/** The footer: the invitation sentence (a link when `pageUrl` is one) and the contact line. */
function footerHtml(pageUrl: string): string {
  const small = `margin:0 0 6px 0;font-size:12px;line-height:18px;color:${GREY};`;
  const link = `color:${GREY};text-decoration:underline;`;
  const wayOut = isSafeLink(pageUrl)
    ? `<a href="${escapeHtml(pageUrl)}" target="_blank" style="${link}">${escapeHtml(UNSUBSCRIBE_INVITATION)}</a>`
    : `${escapeHtml(UNSUBSCRIBE_INVITATION)} ${escapeHtml(pageUrl)}`;
  const at = GATHER_CONTACT_LINE.indexOf(GATHER_CONTACT_EMAIL);
  const contact =
    at < 0
      ? escapeHtml(GATHER_CONTACT_LINE)
      : `${escapeHtml(GATHER_CONTACT_LINE.slice(0, at))}<a href="mailto:${escapeHtml(GATHER_CONTACT_EMAIL)}" style="${link}">${escapeHtml(GATHER_CONTACT_EMAIL)}</a>${escapeHtml(GATHER_CONTACT_LINE.slice(at + GATHER_CONTACT_EMAIL.length))}`;
  return (
    `<tr><td style="padding:16px 28px 24px 28px;border-top:1px solid ${RULE};font-family:${FONT};">` +
    `<p style="${small}">${wayOut}</p><p style="${small}">${contact}</p></td></tr>`
  );
}

function page(subject: string, blocks: Block[], footer: string): string {
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    `<title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:${PAGE};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE};">` +
    '<tr><td align="center" style="padding:24px 12px;">' +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid ${RULE};border-radius:8px;">` +
    `<tr><td style="padding:28px 28px 12px 28px;font-family:${FONT};font-size:16px;line-height:24px;color:${INK};">` +
    blocks.map(blockHtml).join('') +
    `</td></tr>${footer}</table></td></tr></table></body></html>`
  );
}

/** The body and the page link read back out of a text built by `withGuestEmailFooter`. */
function splitFooter(text: string): { body: string; pageUrl: string } | null {
  const tail = `\n\n${GATHER_CONTACT_LINE}`;
  if (!text.endsWith(tail)) return null;
  const rest = text.slice(0, -tail.length);
  const nl = rest.lastIndexOf('\n');
  const lead = `${UNSUBSCRIBE_INVITATION} `;
  const line = rest.slice(nl + 1);
  if (!line.startsWith(lead)) return null;
  const pageUrl = line.slice(lead.length);
  const sep = '\n\n—\n';
  const head = rest.slice(0, nl + 1);
  if (!head.endsWith(sep)) return null;
  const body = head.slice(0, -sep.length);
  return withGuestEmailFooter(body, pageUrl) === text ? { body, pageUrl } : null;
}

/**
 * A guest email's html, from its plain text exactly as sent (footer included). Null when the
 * footer cannot be read back exactly, or on anything unexpected: the guest then gets the plain
 * text alone, as before. It never throws, so it can never stop a send. `names` (the invitation
 * only) makes the list.
 */
export function designGuestEmail(
  text: string,
  subject: string,
  names: GuestOwnNames = {}
): string | null {
  try {
    const parts = splitFooter(String(text ?? ''));
    if (!parts) return null;
    const blocks = blocksOf(parts.body, ownList(names), guestLink);
    return page(String(subject ?? ''), blocks, footerHtml(parts.pageUrl));
  } catch {
    return null;
  }
}

/**
 * The host's test, designed as the guest's email is (ruling 5). Its body is the test's top line,
 * the guest's message with "[Name's own link goes here]" where the link goes, and the guest
 * footer with "[their own link to stop these emails]" where the way out goes. So: the stand-in
 * makes a button-shaped box that links nowhere, the copy-link line shows the stand-in as it is,
 * and the footer shows both lines with the stand-in as plain text. A texted guest's test carries
 * no footer (a text has none): it is drawn as paragraphs only, no box and no list.
 */
export function designHostTestEmail(
  body: string,
  subject: string,
  names: GuestOwnNames = {}
): string | null {
  try {
    const text = String(body ?? '');
    const title = String(subject ?? '');
    const parts = splitFooter(text);
    if (!parts || parts.pageUrl !== TEST_STOP_LINK_STAND_IN) {
      const paras = paragraphsOf(text).map((lines): Block => ({ kind: 'p', lines }));
      return page(title, paras, '');
    }
    const blocks = blocksOf(parts.body, ownList(names), standInLink);
    return page(title, blocks, footerHtml(parts.pageUrl));
  } catch {
    return null;
  }
}
