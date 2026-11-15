/**
 * [[GTC-460]] Stage 3 — EVERY SENTENCE THE CONTACTS PAGE SAYS, IN ONE FILE.
 *
 * Each is a ruled W-line of the Stage 3 plan (docs/tickets/GTC-460.md, section 7): A5 by ruling 155,
 * W10 to W41 by ruling 159, with its three fixes (W16, W27, W41). `tests/contacts-page-test.tsx`
 * reads the ticket and is red if a word here differs from the ruled one. A sentence that is not on
 * the ticket's list is not added here without the founder's ruling (ruling 7). Straight apostrophes,
 * as W2, W3 and W9 have them (ruling 103).
 *
 * Step 3a uses A5, W10 to W16, W18, W20, W31, W41 and W42 (W42 by ruling 172, 15 Nov 2026, for a
 * Remove or a Clear that did not save; W16 stays for loading). The loading sentences (W17, W19,
 * W21 to W30) arrive with step 3b, and the placement and prompt sentences (W32 to W40) with 3c
 * and 3d.
 */
export const CONTACTS_WORDS = {
  /** A5 (ruling 155): the line at the top of the page, not reworded. */
  A5: "Your contacts stay in this browser. Gather only gets someone's details when you add them to a household.",
  /** W10: the page's title. */
  TITLE: 'Your contacts',
  /** W12: the Clear button, always drawn, greyed at zero. */
  CLEAR: 'Clear all contacts',
  /** W13: the two buttons under the question Clear asks. */
  CLEAR_YES: 'Yes, clear',
  CLEAR_KEEP: 'Keep them',
  /** W14: the empty state. */
  EMPTY:
    'No contacts yet. Paste a list, choose a file, or (on some phones) pick from your contacts.',
  /** W15: signed out. The link after it is the menu bar's existing sign-in link and its label. */
  SIGNED_OUT: 'Sign in to see your contacts.',
  SIGN_IN_LABEL: 'Host Sign In',
  SIGN_IN_HREF: '/auth/signin',
  /** W16: the browser refuses storage (ruling 159's fix). */
  REFUSED:
    "This browser won't save your contacts, so they can't be loaded here. A private window can cause this. Try a normal window.",
  /** W18: the way back (from an event only). */
  BACK: 'Back to your households',
  /** W20: remove one person (read out as "Remove {name}"). */
  REMOVE: 'Remove',
  /** W42 (ruling 172): a Remove or a Clear that did not save, whether the browser refused or was full. */
  SAVE_FAILED: "That change didn't save. A private window can cause this. Try a normal window.",
  /** W31: the entry on the household form, large when only her own household is saved. */
  ENTRY_LARGE:
    'Got your guests in your phone or a spreadsheet? Load them as contacts, then pick them as you type.',
  ENTRY_LINK: 'Your contacts',
  /** W41: the menu bar item (ruling 159's fix: a lower-case c). */
  NAV: 'Your contacts',
} as const;

/** W11: the live count, always on screen. */
export function countWords(n: number): string {
  return n === 1 ? '1 contact' : `${n} contacts`;
}

/** W13: what Clear asks first, in the page and not in a browser pop-up. */
export function clearAsk(n: number): string {
  return n === 1
    ? 'Clear 1 contact? You would need to load it again.'
    : `Clear ${n} contacts? You would need to load them again.`;
}

/** W20, read out. */
export function removeLabel(name: string): string {
  return `Remove ${name}`;
}
