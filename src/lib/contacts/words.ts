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
 * Remove or a Clear that did not save; W16 stays for loading). Step 3b adds W17 and W21 to W30,
 * the loading sentences, with ruling 159's fix to W27, and W43 (ruling 173, 15 Nov 2026: odd letters
 * in a file). W19 and the placement and prompt sentences (W32 to W40) arrive with 3c and 3d.
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
  /** W17: a load the browser has no room for. Nothing was added. */
  FULL: "There's no room left in this browser for these contacts, so none were added.",
  /** W21: the paste box. */
  PASTE_LABEL: 'Paste a list',
  PASTE_HELP:
    'One person per line: name, then phone, then email. Text copied from a spreadsheet or a group chat is fine.',
  PASTE_BUTTON: 'Add these people',
  /** The example in the empty box: a made-up person. */
  PASTE_EXAMPLE: 'Mere Tane, 021 555 0147, mere@example.com',
  /** W22: the file choice. */
  FILE_BUTTON: 'Choose a file',
  FILE_HELP: 'A CSV or vCard file (.csv or .vcf).',
  /** W43 (ruling 173): under the file choice, for a file whose names show odd letters. */
  FILE_ODD_LETTERS: 'If names show odd letters, save the file as CSV UTF-8 and choose it again.',
  /** W23 (ruling 158): drawn only where the phone's picker exists; nowhere else is anything drawn. */
  PICKER_BUTTON: "Choose from your phone's contacts",
  /** W24: the picker failed. Cancelling says nothing. */
  PICKER_FAILED:
    "Your phone wouldn't share its contacts just now. You can paste a list or choose a file instead.",
  /** W25: the laptop-export help note (ruling 159: stays as drafted). */
  LAPTOP_NOTE:
    'Using a laptop? Open your contacts there (the Contacts app on a Mac, icloud.com/contacts or contacts.google.com), choose Export, and save the file as vCard or CSV. Then choose that file here.',
  /** W26: nothing was found. (The other W26 sentences are `addedWords`.) */
  NOTHING_FOUND: "We couldn't find anyone in that.",
  /** W29: a refusal before reading. */
  TOO_BIG: 'That file is too big to read here (the limit is 5 MB). Try exporting without photos.',
  TOO_LONG:
    'That list is too long to paste (the limit is 100,000 characters). Try it in smaller parts.',
  WRONG_TYPE: 'We can only read .csv and .vcf files.',
  FILE_UNREADABLE: "We couldn't read that file.",
  /** W30: a row with a problem, under GTC-448's own flag sentence; the three ways forward (ruling 160). */
  FLAG_CARE: 'Gather will take care of this.',
  DOUBLE_CHECK: 'Double-check it',
  SKIP_IT: 'Skip it',
  DIFFERENT_WAY: 'Use a different way',
  /** W30: the boxes are the household form's own labels; the third way has its own. */
  FIELD_NAME: 'Name',
  FIELD_EMAIL: 'Email',
  FIELD_PHONE: 'Phone',
  FIELD_OTHER: 'Another number or email',
  DONE: 'Done',
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

/** W26: what a load did. */
export function addedWords(n: number): string {
  return n === 1 ? 'Added 1 person.' : `Added ${n} people.`;
}

/** W27: the left-out counts, each shown only when above zero. */
export function noNameWords(n: number): string {
  return n === 1
    ? '1 had no name, so they were left out.'
    : `${n} had no name, so they were left out.`;
}
export function unreadableWords(n: number): string {
  return n === 1
    ? "1 couldn't be read, so it was left out."
    : `${n} couldn't be read, so they were left out.`;
}
export function didntFitWords(n: number): string {
  return `${n} didn't fit. This page holds up to 2,000 contacts.`;
}

/** W28: names turned round from "Last, First", so a name is never changed silently. */
export function turnedWords(n: number): string {
  return n === 1
    ? 'We turned 1 name around from “Last, First” to “First Last”.'
    : `We turned ${n} names around from “Last, First” to “First Last”.`;
}
