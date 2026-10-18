import { DEMO_COPY_EMAIL_DOMAIN } from '@/lib/demo/copy';

/**
 * [[GTC-392]] part B — A SAMPLE COPY'S ADDRESSES, AND THE WORDS THAT STAND IN FOR THEM. Founder
 * plan rulings, 18 Oct 2026 (QB3, QB7; W38 to W41).
 *
 * A copy's account is `<32 hex>@demo-copy.invalid` (part A); its crowd's people are
 * `<first>.<last>@<8 hex>.demo-copy.invalid`, the 8 hex being the start of that account's address,
 * so every crowd differs from every other. Neither can ever be delivered.
 *
 * Every tidy keys on the address itself, so it needs no new read, and every real account and every
 * test fixture shows exactly what it did. CLIENT-SAFE: no database, no sender.
 */

/** W38 to W41 — what a sample shows where a copy's throwaway address would be. */
export const COPY_WORDS = {
  /** W38 — step 4, in place of "Replies to an email come to {address}. ..." */
  REPLY_LINE:
    'On a real event, an email reply comes to you. Here nothing is sent, so nobody can reply.',
  /** W39 — step 4, the "Reply-to" row's value. */
  REPLY_TO: 'You',
  /** W40 — the menu bar, and Moment 1's read-only Email box. */
  ACCOUNT: 'Sample account',
  /** W41 — under that box, in place of "Your account email — it’s how this event stays yours." */
  ACCOUNT_LINE: 'Your sample has a made-up account, so there’s no email to fill in.',
} as const;

const COPY_ACCOUNT = new RegExp(`^[^@\\s]+@${DEMO_COPY_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`, 'i');
const CROWD_PERSON = new RegExp(
  `^[^@\\s]+@[0-9a-f]{8}\\.${DEMO_COPY_EMAIL_DOMAIN.replace(/\./g, '\\.')}$`,
  'i'
);

/** A sample copy's own account address. Anything else, or nothing, is not. */
export function isCopyAddress(address: unknown): boolean {
  return typeof address === 'string' && COPY_ACCOUNT.test(address.trim());
}

/** One of a copy's crowd. */
export function isCrowdAddress(address: unknown): boolean {
  return typeof address === 'string' && CROWD_PERSON.test(address.trim());
}

/** The crowd's tag for a copy: the first 8 characters of its account's random address. */
export function crowdTagOf(copyAccountAddress: string): string {
  return copyAccountAddress.split('@')[0].slice(0, 8).toLowerCase();
}

/** "Megan O'Neill" at tag `3f9a2c1b` → `megan.oneill@3f9a2c1b.demo-copy.invalid`. */
export function crowdAddress(name: string, tag: string): string {
  const local = name
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z]/g, ''))
    .filter(Boolean)
    .join('.');
  return `${local}@${tag}.${DEMO_COPY_EMAIL_DOMAIN}`;
}
