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
 *
 * GTC-207 — THIS GATE IS MESSAGE-ONLY. IT MUST NEVER BE EXTENDED TO ASSIGNMENT.
 * A "kid with a job" (~15-16, does a real task, managed by their parents) is
 * assignment-eligible BY DESIGN — that is the entire point of capturing them as
 * CHILD rather than skipping them. They are excluded from being MESSAGED, never
 * from being ASSIGNED. Do not import this module, `isMessageableRole`, or
 * `MESSAGEABLE_PERSON_EVENT` into any assignment path (item/task assign routes,
 * auto-assign) to gate who can hold an item — that would silently break the
 * kid-with-a-job model this ticket confirmed and pinned. See
 * tests/child-assignment-eligibility-test.ts for the paired guard.
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

/*
 * ─── GTC-316: CHILDNESS AS A FACT, WHICH IS NOT THE MESSAGING GATE ────────────
 *
 * ⚠ READ THE FENCE ABOVE FIRST, THEN THIS. `isMessageableRole` is a GATE — it answers "may a system
 * message go to this membership", and GTC-207 fences it as message-only. The two exports below
 * answer a different question: "is this membership a child." A fact, not a gate.
 *
 * WHY THAT DISTINCTION EARNED ITS OWN EXPORT RATHER THAN A SECOND CALLER OF THE GATE. [[GTC-316]]
 * needs childness in two places that are not messaging at all — TOKEN ISSUANCE
 * (`ensureEventTokens`) and PUBLICATION to an unauthenticated caller
 * (`shared-link-exposure.ts`). Importing the messaging gate into either would make
 * "never messaged" the stated reason a credential is withheld, and it is not the reason:
 * GTC-316's ground is that *a child's token is an ask that may never be asked, so the
 * no-verification bargain GTC-262 preserved was never struck about it.*
 *
 * ⚠ AND CHILDNESS IS DEFINED HERE, ONCE. Two readings of "is this a child" in two modules is the
 * drift this ledger keeps catching — `contactMethod` at ruling C, the preview's mirror of step 4 at
 * GTC-294, the two refusals sharing a why-code at ruling AN.
 */

/**
 * Is this membership a child? Reads `PersonEvent.householdRole` and nothing else.
 *
 * ⚠ NOT A MESSAGING DECISION AND NOT AN ASSIGNMENT DECISION. A child holds items — [[GTC-207]] — and
 * that is untouched by this. This says only what the row IS.
 */
export function isChildMembership(
  householdRole: HouseholdRole | string | null | undefined
): boolean {
  return householdRole === 'CHILD';
}

/**
 * Prisma `where` fragment for memberships that are NOT children.
 *
 * ⚠ AN ALLOWLIST PLUS AN EXPLICIT NULL, AND **NEVER** `{ householdRole: { not: 'CHILD' } }`. The
 * module note above already gives the reason — `NOT (col = 'CHILD')` evaluates to NULL, not true, so
 * every NULL row is silently excluded — and [[GTC-316]] measured what that costs:
 *
 *   **99 of 335 memberships in `gather_dev` have `householdRole: null`, and `{ not: 'CHILD' }`
 *   matches only 176 of 335.**
 *
 * So the obvious filter deletes 99 ADULTS from the directory and from token issuance — the fix
 * becoming a worse defect than the one it closes. `tests/child-token-exposure-test.ts` layer N
 * asserts, in four files, that nobody writes it.
 *
 * ⚠ THE LIST COINCIDES WITH `MESSAGEABLE_HOUSEHOLD_ROLES` TODAY AND IS NOT THE SAME LIST. Both are
 * "the three that are not CHILD" because `HouseholdRole` has exactly four members. **A fifth member
 * must be classified against BOTH** — it could be unmessageable and not a child, or a child by
 * another name — and keeping them separate is what makes that a decision rather than an inheritance.
 */
export const NON_CHILD_PERSON_EVENT: {
  OR: ({ householdRole: { in: HouseholdRole[] } } | { householdRole: null })[];
} = {
  // Not `as const`: Prisma's `OR` takes a mutable array, and a readonly tuple is rejected at the
  // call site rather than here — which reads as a bug in the caller.
  OR: [{ householdRole: { in: ['PRIMARY_CONTACT', 'PARTNER', 'GUEST'] } }, { householdRole: null }],
};
