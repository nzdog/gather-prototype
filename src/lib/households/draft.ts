/**
 * [[GTC-365]] item 16 — the household being entered, shown in Moment 1's column before Save.
 *
 * The founder: *"People I’d added didn’t show until I pressed Save"*. The form keeps the household
 * in its own state until "Save & add another household" or "Save & move on →"; this turns what is
 * typed so far into the card the column shows, marked as not saved yet. NOTHING IS WRITTEN: the
 * card lives only on the page until she presses Save, as before (PLAN RULINGS 2026-10-06, Q4).
 *
 * W1 to W3 were ruled by the founder on 2026-10-06 (docs/tickets/GTC-365.md). Change none of them
 * without a ruling. Client-safe: one type import, erased at build.
 */

import type { SavedHousehold } from '@/components/plan/HouseholdCardList';

export const DRAFT_WORDS = {
  /** W1 — on the card of a household not saved yet. */
  NOT_SAVED_YET: 'Not saved yet',
  /** W2 — that card's name while only members are typed. */
  NEW_HOUSEHOLD: 'New household',
  /** W3 — on a saved household's card while it is being edited. */
  EDITING: 'Editing · not saved yet',
} as const;

/** What the form holds now: names as typed, `partnerName` null while there is no partner row. */
export interface DraftInput {
  name: string;
  partnerName: string | null;
  helperNames: string[];
  /** Kids without a job, or 0 while that row is not shown. */
  littleCount: number;
  guestNames: string[];
}

/**
 * The card for what is typed so far, or null while no name is typed anywhere (a kids-without-a-job
 * count alone is not a household yet). Names are trimmed and blank rows dropped, as `buildPayload`
 * does when it saves.
 */
export function householdDraft(input: DraftInput, id = 'draft'): SavedHousehold | null {
  const name = input.name.trim();
  const partner = input.partnerName?.trim() ?? '';
  const helpers = input.helperNames.map((n) => n.trim()).filter(Boolean);
  const guests = input.guestNames.map((n) => n.trim()).filter(Boolean);
  if (!name && !partner && helpers.length === 0 && guests.length === 0) return null;
  return {
    id,
    primaryContact: { name: name || DRAFT_WORDS.NEW_HOUSEHOLD },
    ...(partner ? { partner: { name: partner } } : {}),
    helpers: helpers.map((n) => ({ name: n })),
    littleCount: input.littleCount,
    guests: guests.map((n) => ({ name: n })),
  };
}
