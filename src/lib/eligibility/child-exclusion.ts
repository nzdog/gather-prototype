/**
 * GTC-172 (C1) — the child rule, in one place.
 *
 * Moment 4 spec §10.6, verbatim: a CHILD-role person "never receives system messages
 * regardless of contact info on their record. Their channel is always an adult via the
 * picker... If a sixteen-year-old should genuinely be messaged directly, Kate roles
 * them as an adult at capture — an explicit hosting decision, never a system inference
 * from the presence of a phone number." And: "No future session may soften this."
 *
 * WHAT THIS REPLACES. Before C1, `reachabilityTier` was the de-facto recipient
 * decision, and it is DERIVED FROM CONTACT-INFO PRESENCE for every role — so a CHILD
 * with their own phone got `DIRECT` and was a live SMS recipient. That is the
 * contradiction §10.6 names in the code. `householdRole` is now the sole gate.
 *
 * `reachabilityTier` is deliberately UNCHANGED and still derived the same way: it
 * remains useful as a signal-QUALITY assessment ("can we reach this person at all?"),
 * it is simply no longer the recipient decision. The regression test leans on exactly
 * that — the subject keeps phone, email and a DIRECT tier and is excluded anyway,
 * which is what proves the gate keys on role and not on data.
 *
 * WHY AN ALLOWLIST AND NOT `{ not: 'CHILD' }`.
 *
 * 1. It fails CLOSED. A `HouseholdRole` value added in future is non-messageable until
 *    someone adds it here deliberately. For a child-safety gate that is the correct
 *    direction to fail: a missed nudge is a nuisance, a message to a child is not.
 * 2. It sidesteps SQL three-valued logic. `NOT (col = 'CHILD')` is NULL — not true —
 *    for a NULL role, so a naive negation can silently drop every person whose
 *    householdRole was never set.
 *
 * WHY NULL IS EXPLICITLY MESSAGEABLE. `people/route.ts` and `people/batch-import` add
 * participants directly to an event and never set `householdRole` at all. Those are
 * adults invited by name; excluding them would silently stop nudging a large slice of
 * real guests. NULL means "not captured via a household", not "unknown age".
 */

import type { HouseholdRole } from '@prisma/client';

/** Household roles that may receive a system message. CHILD is absent, by design. */
export const MESSAGEABLE_HOUSEHOLD_ROLES = ['PRIMARY_CONTACT', 'PARTNER', 'GUEST'] as const;

/**
 * Prisma `where` fragment for PersonEvent rows that may receive system messages.
 * Spread into any eligibility query so the exclusion happens in SQL rather than being
 * left to a caller's loop. Mirrors the SENT_AND_LIVE pattern in src/lib/lifecycle.ts.
 */
export const MESSAGEABLE_PERSON_EVENT = {
  OR: [{ householdRole: null }, { householdRole: { in: [...MESSAGEABLE_HOUSEHOLD_ROLES] } }],
};

/**
 * The same decision in TypeScript, for rows already in memory. MUST stay identical to
 * MESSAGEABLE_PERSON_EVENT — a divergence between the SQL filter and the JS filter is
 * how a child slips through one path while the other looks correct.
 */
export function isMessageableRole(role: HouseholdRole | string | null | undefined): boolean {
  if (role === null || role === undefined) return true;
  return (MESSAGEABLE_HOUSEHOLD_ROLES as readonly string[]).includes(role);
}

/** Skip reason recorded when a candidate is dropped for the child rule. */
export const CHILD_SKIP_REASON = 'CHILD role — never messaged (Moment 4 §10.6)';
