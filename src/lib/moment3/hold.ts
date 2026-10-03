/**
 * [[GTC-360]] — "MOVE ON →" FROM MOMENT 3 HOLDS THE PLAN. The founder's ruling, verbatim: *"On "Move
 * on" from Moment 3 (Recommended)"* — *"Moving on from Moment 3 holds the plan, as your document says,
 * then opens the pre-flight. If something blocks it (a serious clash in the plan, or an important item
 * still without a quantity), Moment 3 says what and how to fix it."*
 *
 * Holding the plan is the transition that already exists (`POST /api/events/[id]/transition`,
 * `transitionToConfirming` in `src/lib/workflow.ts`): the gate, a plan snapshot, CONFIRMING, the
 * guests' links. This module asks it, and says what its answer means for Moment 3; nothing here
 * changes it.
 *
 *  - A DRAFT event is held, then the caller goes on (`GO`).
 *  - An event already held and not yet sent goes on without asking (plan Q4): never held twice.
 *  - A gate block becomes one of three things Moment 3 can say — an empty plan first, since nothing
 *    else matters until there is a plan; then a serious clash; then a missing quantity.
 *  - The route admits only the host (plan Q3): a refusal is `NOT_HOST`.
 *
 * CLIENT-SAFE: it imports only the words. The request lives here, not in `Moment3AssignView`.
 */

import { M3_WORDS } from './words';

export type HoldBlock = 'EMPTY' | 'CLASH' | 'QUANTITY';

export type HoldOutcome =
  | { kind: 'GO' }
  | { kind: 'BLOCKED'; block: HoldBlock }
  | { kind: 'NOT_HOST' }
  | { kind: 'FAILED' };

/** Where W3's link goes: the old dashboard's Plan Status, where a clash is settled. */
export function planStatusHref(eventId: string): string {
  return `/plan/${eventId}?expand=planstatus`;
}

/** Where W4's link goes: Items & Quantities, where a quantity is set or its placeholder acknowledged. */
export function itemsAndQuantitiesHref(eventId: string): string {
  return `/plan/${eventId}?expand=items`;
}

/** What the transition's answer means. Pure, so each case is pinned without a server. */
export function holdOutcomeFrom(status: number, body: unknown): HoldOutcome {
  const b = (body ?? {}) as { success?: boolean; blocks?: { code?: string }[]; error?: string };
  if (status >= 200 && status < 300 && b.success) return { kind: 'GO' };
  if (status === 401 || status === 403) return { kind: 'NOT_HOST' };
  if (status === 400) {
    const codes = new Set((b.blocks ?? []).map((x) => x.code));
    if (codes.has('STRUCTURAL_MINIMUM_TEAMS') || codes.has('STRUCTURAL_MINIMUM_ITEMS')) {
      return { kind: 'BLOCKED', block: 'EMPTY' };
    }
    if (codes.has('CRITICAL_CONFLICT_UNACKNOWLEDGED')) return { kind: 'BLOCKED', block: 'CLASH' };
    if (codes.has('CRITICAL_PLACEHOLDER_UNACKNOWLEDGED'))
      return { kind: 'BLOCKED', block: 'QUANTITY' };
    // Already held (the route answers "Cannot transition from CONFIRMING status", or the gate's
    // UNSAVED_DRAFT_CHANGES): the plan is held, so she goes on.
    if (codes.has('UNSAVED_DRAFT_CHANGES') || /Cannot transition from/.test(b.error ?? '')) {
      return { kind: 'GO' };
    }
  }
  return { kind: 'FAILED' };
}

export async function holdThePlan(args: {
  eventId: string;
  status: string;
  fetchImpl?: typeof fetch;
}): Promise<HoldOutcome> {
  if (args.status !== 'DRAFT') return { kind: 'GO' };
  const f = args.fetchImpl ?? fetch;
  try {
    const res = await f(`/api/events/${args.eventId}/transition`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    return holdOutcomeFrom(res.status, body);
  } catch {
    return { kind: 'FAILED' };
  }
}

/** What Moment 3 says for an outcome that keeps her there, and where its link goes. */
export interface HoldNotice {
  text: string;
  link: { href: string; label: string } | null;
}

export function holdNotice(outcome: HoldOutcome, eventId: string): HoldNotice | null {
  if (outcome.kind === 'GO') return null;
  if (outcome.kind === 'NOT_HOST') return { text: M3_WORDS.HOLD_NOT_HOST, link: null };
  if (outcome.kind === 'FAILED') return { text: M3_WORDS.HOLD_FAILED, link: null };
  if (outcome.block === 'CLASH') {
    return {
      text: M3_WORDS.HOLD_CLASH,
      link: { href: planStatusHref(eventId), label: M3_WORDS.OPEN_PLAN_STATUS },
    };
  }
  if (outcome.block === 'QUANTITY') {
    return {
      text: M3_WORDS.HOLD_QUANTITY,
      link: { href: itemsAndQuantitiesHref(eventId), label: M3_WORDS.OPEN_ITEMS_AND_QUANTITIES },
    };
  }
  return { text: M3_WORDS.HOLD_EMPTY, link: null };
}
