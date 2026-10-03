/**
 * GTC-192 (J1, phase 3) — the assistant's one critical-red message.
 *
 * Moment 4 §3, which fixes both the trigger and the register:
 *
 * > When a critical item is red, one message appears on the screen — one message
 * > regardless of how many critical reds it covers ("two things need you"), in plain
 * > register (not the playful guest-facing voice), naming the thing, admitting what the
 * > system couldn't do, handing it over. It disappears when resolved.
 *
 * §8.3 is what keeps it rare: "criticality does exactly two things (the badge, and the
 * assistant's message at red) and touches nothing else."
 *
 * ── THE CONDITION IS TWO CLAUSES AND BOTH EARN THEIR PLACE ────────────────────
 *
 * The ITEM must be critical AND red, and the PERSON holding it must be red.
 *
 * The item clause stops the message naming a critical that is perfectly fine — a person
 * can be red for one row while holding a settled critical, and pointing at the settled one
 * would be worse than saying nothing. §8.2: non-critical reds sit in the grid without a
 * message.
 *
 * The person clause looks redundant, because worst-colour-wins means a red row usually
 * makes its holder red. It is not redundant in exactly one case, and that case is the
 * point: under Ruling 14 the don't-chase mark greys the STRIP while the rows underneath
 * stay red. So a person the host has taken off the system's hands can hold a red critical
 * and read neutral — and this message must not fire for them, because the host is handling
 * that person personally and the message would be the system second-guessing her.
 *
 * ⚠ THAT EXCLUSION IS BY CONSTRUCTION, NOT BY A SECOND CHECK. Nothing here names the mark;
 * it reads the person's state, and Ruling 14 has already been applied upstream in
 * `derivePersonState`. A `nudgeMark !== ...` test here would be a second definition of the
 * same rule, free to drift from the first. `tests/glance-grid-test.tsx` asserts on this
 * file's source that the mark is never named.
 *
 * ── WHAT IT READS ─────────────────────────────────────────────────────────────
 *
 * Only what the board already carries: a person's name and state, an item's name,
 * criticality and state. No new field, no second query, and nothing that would need the
 * behaviour fence relaxed.
 */

import type { EventGlance } from '@/lib/glance/state';

/** One critical row, stuck with a holder only the host can move it away from. */
export interface CriticalRedHit {
  personName: string;
  itemName: string;
}

/**
 * Every critical row that is red in the hands of a red person.
 *
 * Board order — households in Ruling 3's fixed order, then the unhoused — so the message
 * names things in the order the eye will find them below it, and so the wording is stable
 * across reads rather than reshuffling with the data.
 *
 * The unhoused are included deliberately: having no household is not having no person, and
 * an ownerless-looking guest who is in fact holding the ham is exactly the case this
 * message exists for.
 */
export function findCriticalRedHits(glance: EventGlance): CriticalRedHit[] {
  const hits: CriticalRedHit[] = [];
  const board = [...glance.households.flatMap((h) => h.members), ...glance.unhoused];

  for (const person of board) {
    if (person.state !== 'RED') continue;
    for (const item of person.items) {
      if (item.critical && item.state === 'RED') {
        hits.push({ personName: person.name, itemName: item.name });
      }
    }
  }
  return hits;
}

/**
 * The message. NULL when nothing qualifies — its absence is the whole of the good news,
 * and an "all criticals are covered" reassurance would be a banner nobody asked for.
 *
 * ONE MESSAGE, NEVER A STACK, which is this ticket's acceptance criterion in its own
 * words: it "appears exactly once regardless of how many critical reds it covers".
 *
 * Three beats, in §3's order:
 *   admitting what the system couldn't do    "Gather is out of moves"
 *   naming the thing                         the item, and who has it
 *   handing it over                          "It's yours now"
 *
 * WHY THE ADMISSION IS GENERIC RATHER THAN PER-REASON. It would read better to say why —
 * "gone quiet after two nudges" — but the three red sources fail differently and only one
 * of them is about reach. §8.6 supplies the sentence that is true of all of them: a
 * withdrawn claim "isn't a silence to chase, it's a fact the system can't fix". Out of
 * moves is that fact, and it is honest for an expired maybe, a handed-back row and an
 * exhausted silence alike. The per-reason why still shows, on the person's own strip.
 *
 * WHY IT AVOIDS "NEEDS YOU", WHICH §3'S OWN EXAMPLE USES ("two things need you"). The
 * summary sentence directly above already says "2 need you" and is counting PEOPLE (Ruling
 * 2). Two lines a centimetre apart, both saying "N need you" about different nouns, is the
 * one thing a four-second screen cannot afford. The handover is carried by "yours" instead,
 * which is §3's own gloss on red — "only you can do this".
 *
 * ITEM NAMES ARE PRINTED VERBATIM, AND NEVER SIT AT A SENTENCE BOUNDARY. Names are host-
 * and AI-authored and arrive in both cases — the design reference writes "the glazed ham",
 * this repo's fixtures write "The pavlova" — so no single position is safe: mid-sentence a
 * capital stumbles ("out of moves on The pavlova"), and at the head of a sentence a
 * lower-case name reads as a typo. Both were seen in the browser walk. The fix is position,
 * not transformation: every name follows an em-dash, which is exactly where the alert strip
 * already puts them, and where either case reads as a label rather than as a mistake.
 * Lower-casing to fit would mangle a proper noun the first time one appeared.
 */
export function assistantMessage(hits: readonly CriticalRedHit[]): string | null {
  if (hits.length === 0) return null;

  if (hits.length === 1) {
    const [only] = hits;
    return `Gather is out of moves — ${only.itemName}, with ${only.personName}. It’s yours now.`;
  }

  const named = hits.map((h) => `${h.itemName} with ${h.personName}`).join(' · ');
  return `Gather is out of moves on ${hits.length} critical items — ${named}. They’re yours now.`;
}
