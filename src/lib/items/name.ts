/**
 * GTC-302 — an item's name, as it is stored.
 *
 * THE ONE MECHANICAL TIDY, AND ONLY THAT. The ask says "Would you bring the pavlova?", and `theItems`
 * in `src/lib/messages/ask-register.ts` puts "the" before every name exactly as stored — a founder
 * ruling, so the composer never tidies a noun. A name stored as "The pavlova" therefore reads "the
 * The pavlova", and the fix belongs where names are made (GTC-302, "Founder answers — scoping").
 *
 * So this trims, collapses runs of whitespace, and strips ONE leading "the", "a" or "an" — nothing
 * more. Stripping "the" is always safe for the ask, because the composer puts one back.
 *
 * ⚠ IT DOES NOT CHANGE CASE. Proper nouns and brands — Marlborough Sauvignon Blanc, L&P, Whittaker's
 * — cannot be told apart mechanically. Unknown 4 stores lower case and capitalises on display, and
 * both that and the prompt's casing are ordered after GTC-189 slice 3.
 *
 * ⚠ IT DOES NOT REWRITE A VERB. "Wash the dishes" stays as typed: "Set up the chairs" has no
 * mechanical noun form. What stops a host typing a verb is the job field's "Do the ___" label
 * (Unknown 8), not code.
 *
 * ⚠ ONLY WHAT IS SUBMITTED. Unknown 5 leaves the stored rows as they are, so a write site calls this
 * on a name that arrived, never on the one already stored. `restoreFromRevision` in
 * `src/lib/workflow.ts` does not call it at all: a restore puts back what was there.
 *
 * KNOWN COST, ACCEPTED BY THE FOUNDER (GTC-302): a name that genuinely begins with the word "A"
 * loses it — "A la carte platter" is stored as "la carte platter". Recorded so the trade is visible
 * rather than discovered.
 *
 * CLIENT-SAFE, so an add form may import it. No Prisma.
 *
 * Returns null for anything that is not a non-blank string; a write site refuses that.
 */

const LEADING_ARTICLE = /^(?:the|a|an)\s+(?=\S)/i;

export function itemNameForStorage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const tidy = raw.trim().replace(/\s+/g, ' ');
  if (!tidy) return null;
  return tidy.replace(LEADING_ARTICLE, '') || tidy;
}
