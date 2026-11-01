import { checkEmail, type EmailCheck } from './check-email';
import { checkPhone, type PhoneCheck } from './check-phone';
import { collapseSpaces, tidyName } from './tidy-name';
import { WORDS, type ContactPerson, type ReadOptions } from './types';

/**
 * [[GTC-448]] — the one place a person is made. Paste, file and vCard all end here, so every reader
 * flags the same way: it tidies the name, checks the email and the number, and (ruling 5) keeps ONE
 * email and ONE number when several came with a person.
 *
 * The chooser, the same for all three readers:
 *   - email: one that passes the check, then the card's own PREF, then the first listed;
 *   - phone: one that passes the check, then a New Zealand mobile (+642…), then PREF, then the
 *     first listed.
 * If none passes, the same order picks the one kept and flagged. A dropped extra gives W4 (emails)
 * or W5 (numbers). The same address or number written twice is one candidate, not an extra.
 */
export type Candidate = { value: string; pref?: boolean };

export type ContactInput = {
  name: string;
  /** Run the name through the flip rule (a name already built First Last is not). */
  tidy: boolean;
  /** The name was joined from cells split at a comma; if it is then left as typed, W6. */
  commaSplit?: boolean;
  emails: Candidate[];
  phones: Candidate[];
  /** Problems the reader already found (W7). */
  extraProblems?: string[];
};

export type MadeContact = { person: ContactPerson; flipped: boolean };

type EmailPick = {
  index: number;
  pref: boolean;
  result: Exclude<EmailCheck, { kind: 'none' }>;
};
type PhonePick = {
  index: number;
  pref: boolean;
  result: Exclude<PhoneCheck, { kind: 'none' }>;
};

let counter = 0;
function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  counter += 1;
  return `c${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** The id maker for a read: the caller's, or a random one. Never sent anywhere. */
export function makeIdMaker(opts?: ReadOptions): () => string {
  return opts?.newId ?? randomId;
}

function pickEmail(candidates: Candidate[]): { pick: EmailPick; extra: boolean } | null {
  const picks: EmailPick[] = [];
  candidates.forEach((c, index) => {
    const result = checkEmail(c.value);
    if (result.kind === 'none') return;
    if (picks.some((p) => p.result.email === result.email)) return;
    picks.push({ index, pref: !!c.pref, result });
  });
  if (picks.length === 0) return null;
  const rank = (p: EmailPick) => [p.result.kind === 'ok' ? 0 : 1, p.pref ? 0 : 1, p.index];
  picks.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
  return { pick: picks[0], extra: picks.length > 1 };
}

function pickPhone(candidates: Candidate[]): { pick: PhonePick; extra: boolean } | null {
  const picks: PhonePick[] = [];
  candidates.forEach((c, index) => {
    const result = checkPhone(c.value);
    if (result.kind === 'none') return;
    if (picks.some((p) => p.result.phone === result.phone)) return;
    picks.push({ index, pref: !!c.pref, result });
  });
  if (picks.length === 0) return null;
  const rank = (p: PhonePick) => [
    p.result.kind === 'ok' ? 0 : 1,
    p.result.kind === 'ok' && p.result.phone.startsWith('+642') ? 0 : 1,
    p.pref ? 0 : 1,
    p.index,
  ];
  picks.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
  return { pick: picks[0], extra: picks.length > 1 };
}

/** A person, or null when there is no name (the reader counts that, and never names a person). */
export function makeContact(input: ContactInput, newId: () => string): MadeContact | null {
  const tidied = input.tidy
    ? tidyName(input.name)
    : { name: collapseSpaces(input.name), flipped: false };
  if (!tidied.name) return null;

  const problems: string[] = [];
  if (input.tidy && input.commaSplit && !tidied.flipped) problems.push(WORDS.W6);

  const person: ContactPerson = { tempId: newId(), name: tidied.name, problems };

  const email = pickEmail(input.emails);
  if (email) {
    person.email = email.pick.result.email;
    if (email.pick.result.kind === 'bad') problems.push(email.pick.result.problem);
    if (email.extra) problems.push(WORDS.W4);
  }
  const phone = pickPhone(input.phones);
  if (phone) {
    person.phone = phone.pick.result.phone;
    if (phone.pick.result.kind !== 'ok') problems.push(phone.pick.result.problem);
    if (phone.extra) problems.push(WORDS.W5);
  }
  for (const p of input.extraProblems ?? []) problems.push(p);

  return { person, flipped: tidied.flipped };
}
