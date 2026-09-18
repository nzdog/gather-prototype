/**
 * GTC-262 — what an UNAUTHENTICATED caller may be handed, in one place.
 *
 * Founder ruling, 2026-09-18, on unknown 1:
 *
 *   "A participant token is an ask, a coordinator token is a job, and the
 *    no-verification bargain was struck about the ask. It was never struck about
 *    write access to a team's plan."
 *
 * Two surfaces are unauthenticated and hand out access tokens:
 * `GET /api/gather/[eventId]/directory` and `POST /api/join/[token]/claim`. Before this
 * module the rule deciding WHICH `TokenScope` they would emit lived in neither of them
 * and in both of them — a `scopePriority` map and a `prefixMap` in the first, a
 * `participantToken || person.tokens[0]` fallback and a prefix ternary in the second.
 * Four expressions of one rule that was written down nowhere. Measured on 2026-09-18,
 * unauthenticated and with no shared link at all: 16 directory rows across 6 events in
 * `gather_dev` emitted a COORDINATOR token with `tokenPrefix: 'c'`, 9 of them still live.
 *
 * ⚠ THIS MODULE IS THE RULE. Both routes import it and neither restates it. That is
 * GTC-256 phase 3's lesson taken directly: it gated `InviteStatusSection` and found the
 * second door into the same modal still open in `WhosMissing`, and recorded that "gating
 * one door and leaving the other open would have been the claim endpoint's mistake in UI
 * form." Here the two doors are worse than adjacent — the directory is where a caller
 * GETS the `personId` the claim route wants, because `src/app/join/[token]/page.tsx`
 * lists only `role: 'PARTICIPANT'` and so never names a coordinator.
 *
 * ── WHAT THIS DOES NOT CLOSE ───────────────────────────────────────────────────
 *
 * ⚠ Founder ruling, 2026-09-18, on unknown 2 — RULED, not merely left alone:
 *
 *   "The participant bargain stands. This narrows the KIND of credential, not the
 *    bargain, and the directory remains a credential dispenser afterwards with the 409
 *    as its only friction."
 *
 * So, plainly, so that nobody reads this fix as having closed something it has not: the
 * directory still hands a working PARTICIPANT token to anyone holding the event id. Names
 * are still self-selected with no verification of any kind. The 409 in the claim route
 * ("this name has already been claimed") is still the only friction there has ever been,
 * and the directory routes straight to `/p/{token}` without passing through it. That is
 * the deliberate design of the unaddressed path in, and it is not this ticket's to change.
 *
 * ── WHY THE CLAIM REFUSAL KEYS ON THE MEMBERSHIP ROLE, NOT ON TOKEN SHAPE ──────
 *
 * This is the load-bearing choice in the module and it is not a preference.
 *
 * The obvious way to refuse a coordinator is to notice they hold no PARTICIPANT token.
 * That works exactly until GTC-294, which issues coordinators a PARTICIPANT token as well
 * (GTC-189 ruling E, founder option (a): "the job should not cost them the ask"). On the
 * day GTC-294 lands, a token-shaped refusal stops refusing — silently, with every test
 * still green, because nothing would be asserting the thing that changed. `isClaimableRole`
 * reads `PersonEvent.role`, which GTC-294 does not touch, so the refusal survives issuance
 * changing underneath it.
 *
 * It is an ALLOWLIST rather than a `!== 'COORDINATOR'` denial, for the reason
 * `child-exclusion.ts` next door is one: a new `PersonRole` member would be admitted by a
 * denial and refused by an allowlist, and refused is the safe direction on an endpoint
 * whose entire output is credentials.
 *
 * ⚠ IT DOES NOT REPLACE THE HOST CHECK, AND THE CLAIM ROUTE MUST KEEP BOTH.
 * `isHostMembership` in `host-exclusion.ts` keys on `Event.hostId` as well as on the role,
 * precisely because `PersonEvent.role` is writable; a host row re-roled to PARTICIPANT is
 * caught by that FK and would pass this allowlist. Two predicates, two reasons, both
 * required. GTC-256 Ruling 5 is not weakened here by so much as a character.
 *
 * ── NOT AN ASSIGNMENT GATE, AND NOT A MESSAGING GATE ──────────────────────────
 *
 * ⚠ DO NOT IMPORT THIS MODULE ANYWHERE BUT THE TWO UNAUTHENTICATED ROUTES. It says what a
 * stranger may be handed. It says nothing about who may hold an item, who may be messaged,
 * or what a coordinator may do once they are holding their own link — a coordinator token
 * remains a fully valid credential and `resolveToken` in `src/lib/auth.ts` is untouched.
 * This withholds PUBLICATION, not access. `tests/coordinator-token-exposure-test.ts`
 * carries the paired structural guard, as GTC-207 does for the child rule.
 */

import type { TokenScope } from '@prisma/client';

/**
 * The only scope either unauthenticated surface may emit.
 *
 * A const rather than a literal at two call sites, so that the answer to "what can a
 * stranger be handed?" is one grep with one result.
 */
export const SHAREABLE_TOKEN_SCOPE: TokenScope = 'PARTICIPANT';

/**
 * The URL prefix that scope opens, and the only prefix these surfaces may emit.
 *
 * The `prefixMap` this replaces carried three entries — `{ HOST: 'h', COORDINATOR: 'c',
 * PARTICIPANT: 'p' }` — of which two were the defect. Founder ruling, 2026-09-18, on
 * removing rather than restricting the claim route's fallback: "restricting leaves the
 * mechanism standing as dead code, and the dead code is the mechanism." The same reasoning
 * retires the map: a lookup table with two unreachable rows is a lookup table one edit away
 * from reaching them again.
 */
export const SHAREABLE_TOKEN_PREFIX = 'p';

/**
 * Prisma `where` fragment for the tokens these surfaces may load.
 *
 * ⚠ USED IN THE QUERY, NOT AFTER IT. The coordinator's token row never enters the process,
 * so no later edit to the mapping below it can reintroduce the token by accident. That is
 * the same fail-closed direction GTC-256 phase 3 chose for the host's `PersonEvent` row in
 * this very route, and for the same stated reason: it is "the fail-closed direction for an
 * endpoint whose entire output is credentials."
 */
export const SHAREABLE_ACCESS_TOKEN = { scope: SHAREABLE_TOKEN_SCOPE } as const;

/**
 * May a stranger holding this name's `personId` claim it through the shared link?
 *
 * Reads `PersonEvent.role` and nothing else. See the module note above for why it is a role
 * check and not a token check, and why it is an allowlist.
 *
 * ⚠ This is HALF of the claim route's gate. `isHostMembership` in `host-exclusion.ts` is
 * the other half and is not optional — see the module note.
 */
export function isClaimableRole(role: string | null | undefined): boolean {
  return role === 'PARTICIPANT';
}

/**
 * The refusal an unauthenticated caller gets, and it is deliberately the unknown-person one.
 *
 * GTC-256 phase 3 chose 404 with this wording for the host and wrote down why: the endpoint
 * has no authentication at all, so a distinct status or a distinct message "would confirm
 * that a guessed `personId` names this event's host — turning the refusal into an oracle."
 * The identical reasoning applies to a coordinator, and an oracle that identifies who holds
 * write access to a team's plan is the more useful one to an attacker. The two refusals are
 * therefore byte-identical on the wire and must stay that way.
 */
export const UNKNOWN_PERSON_MESSAGE = 'Person not found in this event';
export const UNKNOWN_PERSON_STATUS = 404;
