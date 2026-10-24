/**
 * [[GTC-394]] tweak 2 — THE TITLES OF THE TRANSITION PAGES: each Moment's name, big (founder,
 * 19 Oct 2026: "The moment's name, big (Recommended)").
 *
 * They are the strip's own labels for Moments 1 and 2, typed exactly as `MomentArc.tsx` reads them,
 * with the straight apostrophes the strip shows. Not imported from there: its list is private, and
 * the founder ruled that `MomentArc.tsx` is not edited (walkthrough-batch14 Z2 guards it).
 * `test:demo-tweaks` O1 reads `MomentArc.tsx` and proves these equal its first three labels.
 * [[GTC-399]] item 2: Moment 3's opening page takes the third, the same way.
 */
export const OPENING_TITLES = {
  1: "Who's coming?",
  2: "What's the plan?",
  3: "Who's on what?",
} as const;
