/**
 * [[GTC-468]] — "YOUR CONTACTS" IN THE SAMPLE: THE WORDS, AND THE ONE PRESS. Founder rulings,
 * 22 Nov 2026 (R1, R2, A).
 *
 * In a sample (a visitor's own copy, or any sample event) the contacts list does not work: a list she
 * loaded would stay in her browser after Gather deletes the sample, and the privacy line (W58) says
 * Gather deletes "everything you type into it". So the menu bar's "Your contacts" and Moment 1's two
 * links show this notice, once, and go nowhere. R2 is the founder's own sentence and is not reworded.
 * The contacts page itself shows it too, so a typed or new-tab address says the same thing.
 *
 * The notice is the app's own toast (the small notice that slides in), as W59 is. It stays 8 seconds,
 * not the usual 4, because it is long. CLIENT-SAFE: words and one small function, no imports.
 */
export const CONTACTS_SAMPLE = {
  /** R2. */
  TOAST:
    "Your contacts isn't part of the demo. In a real event you can load your guests from your phone or a spreadsheet, then pick them as you type.",
  /** How long it stays on screen, in milliseconds. */
  TOAST_MS: 8000,
} as const;

/** The two things of the app's toast this file uses. */
interface InfoToast {
  info: (message: string, options?: { duration?: number }) => void;
}

/** Shows R2 once. */
export function showSampleContactsToast(toast: InfoToast): void {
  toast.info(CONTACTS_SAMPLE.TOAST, { duration: CONTACTS_SAMPLE.TOAST_MS });
}

/**
 * A press on a "Your contacts" link. In a sample it stops the click (so nothing opens) and shows R2;
 * it answers true. For a real account it does nothing and answers false, so the link opens as before.
 */
export function contactsPress(
  sample: boolean,
  event: { preventDefault: () => void },
  toast: InfoToast
): boolean {
  if (!sample) return false;
  event.preventDefault();
  showSampleContactsToast(toast);
  return true;
}
