/**
 * [[GTC-445]] "MAKE THE GUESTS REPLY": the words (W49 to W56, approved 1 Nov 2026, Q16).
 *
 * CLIENT-SAFE: words only. The board's button reads them; replies.ts, which writes through the
 * guests' own answer writer, cannot be imported by a client file (its chain opens the database).
 */
export const REPLIES_WORDS = {
  /** W49 — the button. */
  BUTTON: 'Make the guests reply',
  /** W51 — while it works. */
  WORKING: 'Answering…',
  /** W53 — pressed again. */
  ALREADY: 'The guests have already replied.',
  /** W54 — it failed. */
  FAILED: 'The replies couldn’t be added. Try again.',
  /** W55 — any event that is not a sample copy (the route only; never on screen). */
  NOT_A_SAMPLE: 'Replies can only be made up on a sample event.',
  /** W56 — nobody to answer. */
  NOBODY: 'There’s nobody to answer yet. Add some guests in Moment 1.',
} as const;

/** W50 — under the button. `first` is the fixed guest's first name (GTC-444, Q5). */
export function repliesExplainLine(first: string): string {
  return `I’ll answer for everyone except ${first}: most say yes, a few say maybe or hand something back, and some don’t answer yet.`;
}

/** W52 — done. */
export function repliesDoneLine(n: number): string {
  return `${n} guests answered.`;
}
