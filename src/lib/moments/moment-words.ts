/**
 * [[GTC-368]] (item 5) — WHAT EACH MOMENT DOES, AND WHAT DONE LOOKS LIKE, in the founder's words.
 *
 * Asked at the walkthrough sort (GTC-189's Fourth ruling), *"Before launch or after?"*: *"Before
 * launch (Recommended)"*. His words as he pasted them on 2026-10-05, used as written, with curly
 * apostrophes (Q12 at GTC-367's plan: the characters change, the words don't). Where they sit is
 * Q10's A: "What this does" where each Moment starts, "When it’s done" where it finishes, and on the
 * board both behind a closed "What this does" (GTC-192's Ruling 1). W15 is his own two labels.
 *
 * CLIENT-SAFE: no imports. The board reads it, so it is in `test:glance-read`'s fence (Q16); change
 * none of these words without a ruling (`tests/walkthrough-batch5-words-test.tsx` types every one).
 */

/** W15 — the founder's own labels, as headings; on the board "What this does" is also the button. */
export const MOMENT_HEADINGS = {
  DOES: 'What this does',
  DONE: 'When it’s done',
} as const;

export const MOMENT_WORDS = {
  1: {
    does: 'Gets everyone who’s coming out of your head and into one list. Names, how to reach them, and who’s in each household.',
    done: 'You won’t need to remember who you’ve asked. I’ve got the list, and I’ll handle the invites and nudges from here.',
  },
  2: {
    does: 'Gets the plan out of your head and onto the page. Tell me about the event and any dietary needs, and I’ll draft the full list of what’s needed: food, drinks and everything else. You decide what stays.',
    done: 'You won’t need to worry you’ve forgotten something. The whole plan is in one place, it’s yours, and it’s ready to hand out.',
  },
  3: {
    does: 'Puts a name next to every job. You decide who’s on what, and I keep track of it all.',
    done: 'Every job has an owner, and you’re not carrying the plan anymore. I’ll ask each person and follow up, so you don’t have to.',
  },
  4: {
    does: 'Shows you where everything stands on one screen: who’s said yes, what’s covered, and what’s still open. I nudge anyone who hasn’t replied and flag anything that needs you.',
    done: 'You stop wondering. Every job is confirmed, and you know your event is sorted.',
  },
} as const;
