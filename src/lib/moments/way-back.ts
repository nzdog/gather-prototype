/**
 * [[GTC-381]] — THE WAY BACK FROM THE OLD DASHBOARD. The founder's note of 2026-10-12, verbatim:
 * *"please make a note that if anyone arrives at the version 1 page, I want a very obvious button or
 * link to get them back to the moment they were in"*. Ruled at the plan (Q10, Q11): one sage button
 * in a band under the menu bar, on a Moment-flow event only, its words naming the Moment as the
 * strip does.
 *
 * One rule, so the button's words and where it goes cannot disagree:
 *   sent                      → the board, W8 (STRIP_WORDS.BACK_TO_BOARD, reused)
 *   held, not sent            → the pre-flight, W7
 *   otherwise the setup flow, where the entry rule picks the screen, named for it:
 *     invites only            → W5 (STRIP_WORDS.BACK_TO_WHATS_THE_PLAN, reused)
 *     approved                → W6
 *     begun, or a plan        → W5
 *     else (opening, Moment 1)→ W4
 * An old-style event (no `EventSetup` record) has no Moment to go back to: null, and its page is
 * unchanged.
 *
 * Also the People card's words on a Moment-flow event (W1, Q19): the host rows, then everyone else.
 *
 * CLIENT-SAFE: no database, no server import. The old dashboard reads it.
 */

import { STRIP_WORDS } from './strip';
import { boardHref } from '@/lib/events/home-href';
import { hasGeneratedPlan, momentTwoBegun } from '@/lib/setup/entry-stage';

export const WAY_BACK_WORDS = {
  /** W4 — the opening screen or Moment 1. */
  TO_WHOS_COMING: '← Back to “Who’s coming?”',
  /** W5 — Moment 2: its questions, its plan, or an invites-only event's opening. */
  TO_WHATS_THE_PLAN: STRIP_WORDS.BACK_TO_WHATS_THE_PLAN,
  /** W6 — Moment 3, once the plan is approved. */
  TO_WHOS_ON_WHAT: '← Back to “Who’s on what?”',
  /** W7 — held, and the invitations not yet sent. */
  TO_IS_EVERYONE_SORTED: '← Back to “Is everyone sorted?”',
  /** W8 — once the invitations have gone. */
  TO_THE_BOARD: STRIP_WORDS.BACK_TO_BOARD,
} as const;

export interface WayBackFacts {
  id: string;
  /** The `EventSetup` record, or null for an old-style event. */
  setup: {
    eventType?: string | null;
    invitesOnly?: boolean | null;
    planApprovedAt?: Date | string | null;
  } | null;
  status: string;
  sentAt: Date | string | null;
  items?: Array<{ source?: string | null }>;
}

export function wayBack(facts: WayBackFacts): { href: string; words: string } | null {
  if (!facts.setup) return null;
  if (facts.sentAt) return { href: boardHref(facts.id), words: WAY_BACK_WORDS.TO_THE_BOARD };
  if (facts.status !== 'DRAFT') {
    return { href: `/plan/${facts.id}/pre-flight`, words: WAY_BACK_WORDS.TO_IS_EVERYONE_SORTED };
  }
  const href = `/plan/${facts.id}/setup`;
  if (facts.setup.invitesOnly === true) return { href, words: WAY_BACK_WORDS.TO_WHATS_THE_PLAN };
  if (facts.setup.planApprovedAt != null) return { href, words: WAY_BACK_WORDS.TO_WHOS_ON_WHAT };
  if (momentTwoBegun(facts.setup) || hasGeneratedPlan(facts.items ?? [])) {
    return { href, words: WAY_BACK_WORDS.TO_WHATS_THE_PLAN };
  }
  return { href, words: WAY_BACK_WORDS.TO_WHOS_COMING };
}

/** W1 — "1 host, 6 guests": the host rows, then everyone else on the event (Q19). */
export function hostsAndGuests(people: Array<{ role: string }>): string {
  const hosts = people.filter((p) => p.role === 'HOST').length;
  const guests = people.length - hosts;
  return `${hosts} ${hosts === 1 ? 'host' : 'hosts'}, ${guests} ${guests === 1 ? 'guest' : 'guests'}`;
}
