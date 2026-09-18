/**
 * GTC-235 — where the Moment flow opens, resolved from stored state.
 *
 * THE BUG THIS ENDS. `/plan/[eventId]/setup` held its position in pure session state:
 * `showSetup` initialised `true` unconditionally and `showMoment2PlanView` initialised
 * `false`, and the only two callers that ever set the plan view were callbacks of the
 * Step 2 skeleton. A reload therefore put a host who had generated a plan back at the
 * opening screen, and the only route forward from there was to walk Moment 2 again and
 * press Generate — which cost an AI call and, before GTC-237, ate her edits. A
 * navigation bug that ends in data loss.
 *
 * NOTHING NEW IS STORED, because nothing new needs to be. Every input below already
 * exists: `EventSetup` is written by Moment 2 Step 1, households by Moment 1, and item
 * provenance by generation and by the item PATCH. The flow's position was always
 * derivable; nothing asked.
 *
 * ONE FUNCTION WITH A NAME, per GTC-235's own instruction — not a chain of conditions
 * inside the component. Every future Moment reads this.
 */

export type SetupStage = 'opening' | 'moment1' | 'moment2-step1' | 'plan';

/**
 * "Already generated" means ITEMS, not teams.
 *
 * Teams are the cheap test and the wrong one: V1 events have teams, and so does a plan
 * built by hand. Generated items exist only where a generation has run. HOST_EDITED
 * counts because it IS generated output — the item PATCH flips GENERATED → HOST_EDITED
 * in place, so a host who rewrote every row would otherwise read as having no plan.
 */
export function hasGeneratedPlan(items: Array<{ source?: string | null }>): boolean {
  return items.some((i) => i.source === 'GENERATED' || i.source === 'HOST_EDITED');
}

/**
 * The entry rule.
 *
 * `EventSetup` IS THE V1/V2 DISCRIMINATOR, and it is load-bearing in the first line.
 * The events list routes on it, `regenerate-plan` 404s without it, and the V1 dashboard's
 * thirteen `!event.setup` guards hide the V1 pipelines with it. A V1 event opened at this
 * URL has teams and items and no `EventSetup`, and it resolves to `opening` — exactly
 * what it did before this function existed (founder ruling 4, 2026-09-12). The fix
 * changes nothing for V1, and the case is named here rather than fallen through.
 *
 * ⚠ NOT A HISTORY. This answers "where is this plan up to", not "where was she last".
 * Approving the plan is the one beat in the flow that stores nothing — it writes no
 * column, no status and no ledger row — so it is not an input here and must not become
 * one by accident. It does not need to be: approving keeps her on the plan view, so
 * `plan` is the right answer either side of it.
 */
export function resolveSetupStage(input: {
  items: Array<{ source?: string | null }>;
  hasSetup: boolean;
  householdCount: number;
}): SetupStage {
  if (!input.hasSetup) {
    return input.householdCount > 0 ? 'moment1' : 'opening';
  }
  if (hasGeneratedPlan(input.items)) return 'plan';
  return 'moment2-step1';
}
