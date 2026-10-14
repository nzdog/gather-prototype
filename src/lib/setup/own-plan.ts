/**
 * [[GTC-382]] (item 40) — WRITE THE LIST MYSELF: a third way to make the plan, on Moment 2's opening.
 * The plan opens with the usual sections, empty, filled in by hand, and no AI call.
 *
 * The founder's rulings (2026-10-13): scoping Q1 *"The everyday eight (Recommended)"*, in that order,
 * named as a drafted plan names them, so a later draft finds them by name; Q3 an outlined button under
 * "Let’s do this →" with a short line beneath. Plan rulings: Q4 the eight are made by
 * `POST /api/events/[id]/setup` (`ownPlan: true`), once only; Q5 the host's alone; the words W1 to W10
 * *"as written"*.
 *
 * CLIENT-SAFE: pure data. The words are the ruled W-lines, verbatim; change none without a ruling
 * (`tests/walkthrough-batch13-test.tsx` types every one of them again).
 */

import { CATEGORY_LABELS } from '@/lib/ai/plan-categories';
import { TASK_BUCKETS } from '@/lib/ai/tasks';
import { INVITES_ONLY_WORDS } from './invites-only';

const taskBucketName = (key: string): string =>
  TASK_BUCKETS.find((b) => b.key === key)?.teamName ?? key;

/** Scoping Q1 — the everyday eight, in order. Set up and Clean up carry the domains a draft gives them. */
export const OWN_PLAN_SECTIONS: ReadonlyArray<{
  name: string;
  domain: 'SETUP' | 'CLEANUP' | null;
}> = [
  { name: CATEGORY_LABELS.entree_starters, domain: null },
  { name: CATEGORY_LABELS.mains, domain: null },
  { name: CATEGORY_LABELS.sides_salads, domain: null },
  { name: CATEGORY_LABELS.dessert, domain: null },
  { name: CATEGORY_LABELS.drinks_alcoholic, domain: null },
  { name: CATEGORY_LABELS.drinks_non_alcoholic, domain: null },
  { name: taskBucketName('set_up'), domain: 'SETUP' },
  { name: taskBucketName('clean_up'), domain: 'CLEANUP' },
];

export const OWN_PLAN_WORDS = {
  /** W1 — Moment 2's opening, the outlined button under "Let’s do this →". */
  CHOOSE: 'Write the list myself',
  /** W2 — under W1. */
  EXPLAIN: 'I’ll set out the usual sections, and you fill them in.',
  /** W3 — under W1 instead, when her list already exists (Q3). */
  WAITING: 'Your list is waiting, as you left it.',
  /** W4 — a co-host presses it (Q5). */
  NOT_HOST: 'Only the host can write the list.',
  /** W5 — the press fails: GTC-374's W4, reused letter for letter. */
  FAILED: INVITES_ONLY_WORDS.FAILED,
  /** W8 — her own plan, while every section is empty. */
  FIRST_TIME:
    'Add what’s needed under each heading. For anything else, use “+ Add category” at the bottom.',
  /** W10 — the plan view's footer back, on her own plan (Q3): to Moment 2's opening. */
  BACK: '← Back to the start of the plan',
} as const;

/** W6 — her own plan's heading, in place of "Here’s what I’d suggest for {eventName}.". */
export function ownPlanHeading(eventName: string): string {
  return `Your plan for ${eventName}.`;
}

/** Where the press is up to on Moment 2's opening: W4 for a co-host, W5 if it fails. */
export type OwnPlanState = 'idle' | 'working' | 'failed' | 'not-host';
