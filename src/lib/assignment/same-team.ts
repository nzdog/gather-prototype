/**
 * The same-team rule, in one place — WHO MAY HOLD WHICH ROW.
 *
 * ⚠ NOTE THE FOLDER. This is `src/lib/assignment/`, not `src/lib/eligibility/`. Everything
 * in `eligibility/` — the child rule, the nudge mark, the nudge pace, host-exclusion — is a
 * MESSAGE rule, about who may be sent something. This is an ASSIGNMENT rule, about who may
 * hold something. GTC-207 exists because those two were confused once, and the folder split
 * is the cheapest way to keep them apart at the point where someone reaches for a sibling.
 *
 * ⚠ **DO NOT IMPORT `src/lib/eligibility/host-exclusion.ts` INTO THIS FILE OR ANY OTHER
 * ASSIGNMENT PATH.** It is message-only by construction and by ruling. Holding an item does
 * not make the host an addressee: she gets no ask, no auto-nudge, no decide-by chase and no
 * wrap-up thank-you, whatever she is holding (GTC-256 Ruling 5). The host predicate below is
 * therefore written out longhand rather than imported, which is a DELIBERATE duplication —
 * see `isHostSelfPick`. `tests/child-assignment-eligibility-test.ts` fails if the import
 * appears.
 *
 * ── WHAT THE RULE IS FOR ──────────────────────────────────────────────────────
 *
 * GTC-171 (B2) states its purpose in the route it came from: coordinator scoping — "a Mains
 * coordinator shouldn't reassign Desserts". It is not a statement about who is capable of
 * holding a thing; it is a fence around who a given coordinator may place.
 *
 * That purpose is what both of its exceptions follow from.
 *
 * ── EXCEPTION 1: TASK ROWS (GTC-171, founder-ruled) ───────────────────────────
 *
 * `PersonEvent.teamId` is SINGULAR — one team per person — so a task team can never have
 * members, and gating task rows on team membership would have made every task permanently
 * unassignable. The rule has no referent for a row nobody can be a member of.
 *
 * ── EXCEPTION 2: THE HOST, PICKING FOR HERSELF (GTC-256 phase 4, Rulings 4 and 9) ──
 *
 * The same structural problem, arriving through the other door. Ruling 9 says the host may
 * hold items and chooses them herself; the singular `teamId` means she can only ever reach
 * the one team she is on, and she is deliberately on none.
 *
 * ⚠ AND SHE MUST STAY ON NONE. Putting her on a team to solve this looks obvious and is
 * wrong three times over, each measured on 2026-08-29:
 *
 *   1. `PATCH /api/events/[id]/people/[personId]` DELETES EVERY ASSIGNMENT a person holds
 *      when their `teamId` changes. Measured: she held 2 items, a team change left her with
 *      0. Under a write-teamId-with-the-pick design, every pick from a second team would
 *      silently destroy everything she already had.
 *   2. It would make her assignable BY OTHER PEOPLE. `/api/c/[token]/items/[itemId]/assign`
 *      gates on `personEvent.teamId === <the coordinator's team>`, so while her teamId is
 *      null she is unreachable from that route entirely. On a team, her own coordinator
 *      could start handing her things — which is exactly what Ruling 9's "the system never
 *      assigns her anything… she opts in and chooses her own items" forbids.
 *   3. It would make her an ordinary team member in TeamBoard, in member counts, and in
 *      every one of that team's assignee dropdowns.
 *
 * `teamId: null` is doing protective work. The exemption is what lets it keep doing it.
 *
 * ── AND IT IS CONDITIONED ON SELF-PICK, WHICH IS THE SECOND HALF OF RULING 9 ───
 *
 * "She opts in and chooses her own items" is two facts: which rows she may hold, and who may
 * place her. The exemption encodes both — it opens only when the ASSIGNEE is the host AND
 * the ACTOR holds host authority on this event. A coordinator gets no exemption and cannot
 * reach her anyway (see 2 above): two independent mechanisms, agreeing.
 *
 * COHOST COUNTS AS HOST AUTHORITY, deliberately and worth stating rather than leaving to be
 * discovered. A co-host is a co-owner of the event, not "the system" — the system is
 * auto-assign, which excludes her twice over and is untouched by this file. The alternative,
 * matching `auth.user.id` against `Event.host.userId`, was rejected because `Person.userId`
 * is null on every host of a pre-phase-2 event, which would make the exemption silently dead
 * exactly where the backfill (phase 5) will need it.
 */

/** A membership row, as little of it as the decision needs. */
export interface SameTeamSubject {
  personId: string;
  /** `PersonEvent.role`. */
  role: string;
  /** `PersonEvent.teamId` — nullable, and null for the host by design. */
  teamId: string | null;
}

/** The row being placed. */
export interface SameTeamItem {
  /** `Item.kind` — 'ITEM' or 'TASK'. */
  kind: string;
  teamId: string;
}

/** The event-level role the actor authenticated with. */
export type AssignActorRole = 'HOST' | 'COHOST' | 'COORDINATOR' | string;

/**
 * Is this the host picking a row for herself?
 *
 * Two sufficient conditions for "this row is the host's", matching the pair
 * `host-exclusion.ts` uses on the message side — `Event.hostId` is the durable half that no
 * route can write away, and `role: 'HOST'` covers `Event.coHostId` and clone/seed rows.
 *
 * ⚠ WRITTEN OUT RATHER THAN IMPORTED, ON PURPOSE. The identical predicate exists in
 * `src/lib/eligibility/host-exclusion.ts` and importing it here would be the GTC-207 failure
 * exactly: an assignment path reaching into the message-rule module. The two are the same
 * shape today and are allowed to diverge, because they answer different questions — one asks
 * "may we send to her", this one asks "is she picking for herself". Do not DRY them.
 */
export function isHostSelfPick(
  subject: SameTeamSubject,
  actorRole: AssignActorRole,
  hostPersonId: string
): boolean {
  const assigneeIsHost = subject.personId === hostPersonId || subject.role === 'HOST';
  const actorHasHostAuthority = actorRole === 'HOST' || actorRole === 'COHOST';
  return assigneeIsHost && actorHasHostAuthority;
}

/**
 * May this person hold this row, as far as the same-team rule is concerned?
 *
 * Returns true to permit. The caller supplies the 400; this owns only the decision, so the
 * route and the tests cannot hold two different copies of it.
 *
 * @param hostPersonId `Event.hostId`, which is a **Person** id (schema.prisma,
 *   `host Person @relation("EventHost")`).
 */
export function mayHoldRow(
  subject: SameTeamSubject,
  item: SameTeamItem,
  actorRole: AssignActorRole,
  hostPersonId: string
): boolean {
  // Exception 1 — GTC-171. A task team can never have members.
  if (item.kind !== 'ITEM') return true;

  // Exception 2 — GTC-256 phase 4. The host is on no team, by design.
  if (isHostSelfPick(subject, actorRole, hostPersonId)) return true;

  return subject.teamId === item.teamId;
}

/** The refusal, so the route and the coordinator route cannot word it two ways. */
export const SAME_TEAM_ERROR = 'Person must be in the same team as the item';
