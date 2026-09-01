/**
 * GTC-256 (phase 3) — Ruling 5, the host is never an addressee, in one place.
 *
 * Ruling 5, verbatim: "the host never receives her OWN ask. No invitation, no auto-nudge,
 * no proxy nudge, no decide-by follow-up, no wrap-up thank-you. Her name is **not
 * claimable through the shared link**."
 *
 * ⚠ THIS IS A NEW CONCEPT AND IT IS BUILT AS ONE. Ruling 5's own note: "'in the guest
 * list, counted, holding items, never messaged' DOES NOT EXIST TODAY." The host is in the
 * guest list (Ruling 1), counts in the headcount (Ruling 3), may hold items (Rulings 4
 * and 9) — and is not an addressee. Nothing that existed before phase 3 expressed that
 * combination, and this module is the only thing that expresses it now.
 *
 * ⚠ AND IT IS NOT THE CHILD RULE WIDENED. `child-exclusion.ts` next door is deliberately
 * narrow and absolute, and GTC-207 pins it against exactly this borrowing. Ruling 5 says
 * so directly: a CHILD-role host would also be barred from holding items (contradicting
 * Ruling 4) and from being a household channel (contradicting Ruling 6). The two modules
 * are siblings in SHAPE — a predicate, a `where` fragment, a skip reason, and the reason
 * written down — and share no vocabulary at all.
 *
 * ── WHY THIS KEYS ON `Event.hostId` AND NOT ON `role: 'HOST'` ──────────────────
 *
 * This is the load-bearing choice in the module, and it is not a preference.
 *
 * `PersonEvent.role` is WRITABLE. `PATCH /api/events/[id]/people/[personId]` accepted a
 * role change against the host's own row until this phase guarded it, and the guard is a
 * route-level check that a future route could fail to copy. `Event.hostId` is the FK the
 * whole ticket is built on: Ruling 10 pins her membership to exactly that `Person`, and
 * nothing in the people routes can move it. Keying the rule on the writable field would
 * mean one bad write silently turns Ruling 5 off; keying it on the FK means the rule
 * survives the write.
 *
 * `role: 'HOST'` is carried as an ADDITIONAL sufficient condition, never as the only one.
 * That covers a `role: 'HOST'` row whose person is not `Event.hostId` — the co-host
 * (`Event.coHostId`, which `ensureEventTokens` issues a HOST token to) and any row a
 * clone or seed files that way. Two conditions, either sufficient, matching the
 * belt-and-braces the child rule gets in `nudge-eligibility.ts`. If they ever disagree
 * they fail in the safe direction: the row is excluded, not messaged.
 *
 * ── MESSAGE-ONLY. NEVER AN ASSIGNMENT GATE. ────────────────────────────────────
 *
 * ⚠ DO NOT IMPORT THIS MODULE INTO ANY ASSIGNMENT PATH — not the item/task assign routes,
 * not auto-assign, not anything deciding who may HOLD something. This is the mirror image
 * of GTC-207's prohibition on `child-exclusion.ts`, and it has a mirror-image reason:
 * Ruling 4 says the host MAY hold items and Ruling 9 says she picks them herself. Barring
 * her from assignment would break the ruling this module exists alongside.
 *
 * Nothing needs adding to auto-assign for that to hold — its participant pool already
 * selects `role: 'PARTICIPANT'`, so a host row is outside it by construction, which is
 * Ruling 9's "the existing rule stays exactly as it is, unchanged."
 * `tests/host-never-messaged-test.ts` carries the paired guard, as GTC-207 does.
 *
 * ── IT IS NOT THE HOUSEHOLD SWITCH EITHER ─────────────────────────────────────
 *
 * `resolveHouseholdMuted` (`src/lib/households/channel.ts`) is Ruling 6 and stays exactly
 * as phase 2 wrote it. Ruling 5 suppresses her OWN ask because of what she is; Ruling 6
 * is a setting she controls about her HOUSEHOLD's messages, and Ruling 11 recorded that
 * neither substitutes for the other. Two mechanisms, two files, two skip reasons.
 */

/**
 * A membership row, as little of it as the decision needs. Structural, so a narrow
 * `select` satisfies it without a cast — and `role` is optional so a caller that did not
 * select it still gets the `Event.hostId` half of the rule rather than a type error.
 */
export interface HostExclusionSubject {
  personId: string;
  role?: string | null;
}

/**
 * Is this membership row the host's — the person whose ask this is?
 *
 * @param hostPersonId `Event.hostId`, which is a **Person** id, not a User id (see
 *   `host Person @relation("EventHost")` in schema.prisma). Under Ruling 10 it is exactly
 *   the Person the host's own PersonEvent points at.
 */
export function isHostMembership(subject: HostExclusionSubject, hostPersonId: string): boolean {
  return subject.personId === hostPersonId || subject.role === 'HOST';
}

/**
 * The same decision the way a `filter` reads. Prefer this at call sites that keep rows
 * rather than drop them, so the predicate name matches what survives the filter.
 */
export function isAddressable(subject: HostExclusionSubject, hostPersonId: string): boolean {
  return !isHostMembership(subject, hostPersonId);
}

/**
 * Prisma `where` fragment for PersonEvent rows that may be addressed, mirroring
 * `MESSAGEABLE_PERSON_EVENT` next door.
 *
 * A FUNCTION, NOT A CONST, because this rule needs a value the child rule does not: the
 * event's own `hostId`. That is affordable here and only here — every site Ruling 5 binds
 * is scoped to ONE event, so the caller always has the hostId in hand. The cross-event
 * sweeps cannot use it (`findNudgeCandidates` spans every live event and Prisma cannot
 * correlate a nested `where` to the outer row's event — the limitation
 * `decide-by-eligibility.ts` documents at length), and they do not need to: Ruling 8
 * withholds the PARTICIPANT token those two paths require, and phase 3's revocation in
 * `ensureEventTokens` is what keeps that true.
 *
 * `{ role: { not: 'HOST' } }` is safe as a negation where the child rule needed an
 * allowlist: `PersonEvent.role` is non-nullable with `@default(PARTICIPANT)`, so there is
 * no NULL for SQL three-valued logic to swallow. `householdRole` IS nullable, which is
 * why the file next door cannot do this.
 */
export function ADDRESSABLE_PERSON_EVENT(hostPersonId: string) {
  return {
    AND: [{ personId: { not: hostPersonId } }, { role: { not: 'HOST' as const } }],
  };
}

/** Skip reason recorded when a candidate is dropped for Ruling 5. */
export const HOST_SKIP_REASON = 'HOST — never receives her own ask (GTC-256 Ruling 5)';

/**
 * Refusal message for the routes that must say no rather than silently omit.
 *
 * Ruling 5's phase-3 note: "an excluded list is not a refusing endpoint." The claim
 * endpoint and the manual nudge both take a `personId` from the caller, so omitting her
 * from a list elsewhere protects neither.
 */
export const HOST_NOT_ADDRESSABLE_MESSAGE =
  'The host is not a recipient on her own event and cannot be messaged or claimed.';
