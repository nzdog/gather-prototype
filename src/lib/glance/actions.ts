/**
 * GTC-192 (J1, phase 4) — tap-for-actions, the door and nothing behind it.
 *
 * §3: "Behind a tap: all actions (remind, reassign, take over a silence) — looking never
 * becomes operating."
 *
 * ── THIS MODULE WIRES DOORS. IT BUILDS NO MECHANISM. ──────────────────────────
 *
 * Every action below is a request to a route that ALREADY EXISTS and already carries its
 * own guards. Nothing here re-implements one:
 *
 *   REMIND     POST /api/events/[id]/people/[personId]/nudge
 *              HOST-only; the child rule (§10.6, GTC-172), the host exclusion (GTC-256
 *              Ruling 5), the 24-hour cooldown, `smsOptedOut` (Do-Not-Touch Zone 7) and
 *              the channel choice all live in that route and in
 *              `src/lib/sms/manual-nudge-recipient.ts`.
 *   REASSIGN   POST /api/events/[id]/items/[itemId]/assign
 *              HOST/COHOST/COORDINATOR; the same-team rule (GTC-171 B2) and its two
 *              exceptions live in `src/lib/assignment/same-team.ts`; the ledger, the
 *              transaction and the release notification live in the route.
 *   TAKE OVER  the SAME route, with the host as the assignee. GTC-256 Ruling 9's
 *              self-pick is ALREADY the second exception in `mayHoldRow` — it is not
 *              re-stated here, it is reached.
 *
 * ⚠ NO PROVIDER, NO DATABASE, NO SESSION. This module cannot send anything and cannot
 * write anything; the most it can do is ask a route, which then decides. That is what
 * makes "the surface cannot reach around the guards" a property of the code rather than a
 * promise — `tests/glance-actions-test.ts` asserts on this source that no send path and
 * no Prisma handle is reachable from it, and that the only two `/api/` paths it names are
 * the two above.
 *
 * ── THE ONE THING THE SURFACE REFUSES BY ITSELF ───────────────────────────────
 *
 * RULING 14 (2026-08-31): "Kate marked her mother don't-chase because Kate is handling
 * her personally... the fix-it action a red would offer is the exact thing the mark
 * forbids." A remind IS that fix-it action.
 *
 * ⚠ RULING 19 (2026-09-01) MOVED THIS BOUNDARY, AND THE REFUSAL BELOW SURVIVED IT. Phase 4
 * shipped with the mark enforced ONLY here, because the manual-nudge route had never gated
 * a host's own press and widening a V1 control on the strength of a Moment 4 colour ruling
 * was a founder decision. The founder took it: `resolveManualNudgeRecipient` now refuses a
 * marked person beside the child and host gates, and V1's composer refuses with it.
 *
 * So this is no longer the only refusal — it is the near half of a pair, and it earns its
 * place by refusing BEFORE any request is made rather than after one. Same belt-and-braces
 * the child rule gets, where the SQL excludes and the JS re-checks; if the two ever
 * disagree they fail in the safe direction. Both ask `isChaseable` and both show
 * `DONT_CHASE_NOT_ADDRESSABLE_MESSAGE`, so there is one predicate and one sentence.
 *
 * ⚠ THE REFUSAL KEYS ON THE MARK, NOT ON THE STRIP COLOUR. Greys are not tappable this
 * phase, so a marked person cannot reach these functions through the screen at all — and
 * the assertion is written anyway, because Ruling 14 is a rule about the system rather
 * than about one screen's buttons. Colour would be the wrong key regardless: Ruling 14
 * greys only a person whose worst row is not green, so a SETTLED marked person reads GREEN
 * and the mark would be invisible to a check that read the tint.
 *
 * ⚠ AND IT ASKS `isChaseable`, THE PREDICATE THE SWEEPS ALREADY ASK. The string
 * 'DONT_CHASE' does not appear in this file; a literal here would be a second definition
 * of §10.3's off-switch, free to drift from the one in
 * `src/lib/eligibility/nudge-mark.ts`. The test asserts the absence.
 *
 * ⚠ THE SURFACE MAY ONLY EVER BE STRICTER THAN THE ROUTES, NEVER LOOSER. Everything else
 * — the child, the host, the cooldown, the opt-out, the same team — is left to the route
 * to answer and its refusal is shown as its own. One refusal lives here, and it adds a
 * "no" that no route would have said.
 *
 * ── CLIENT-SAFE ───────────────────────────────────────────────────────────────
 *
 * Imported by a `'use client'` component, so: no database handle and no server-only
 * import. `fetch` is injectable for exactly the reason the tests need it — "no request was
 * issued" has to be a count of calls, not a claim about intent.
 */

import { mayHoldRow, type AssignActorRole } from '@/lib/assignment/same-team';
import { isChaseable, DONT_CHASE_NOT_ADDRESSABLE_MESSAGE } from '@/lib/eligibility/nudge-mark';
import { getHostNudgeMessage, type HostNudgeVariant } from '@/lib/sms/nudge-templates';
import type { GlanceItem, GlancePerson, PersonState } from './state';

/** One request to one existing route. Built purely, so it can be asserted without a network. */
export interface GlanceActionRequest {
  url: string;
  method: 'POST';
  body: Record<string, unknown>;
}

/**
 * What happened.
 *
 * `refusedAtSurface` separates THIS module's one refusal from a route's. A caller that
 * could not tell them apart would show the host "Gather said no" for two different
 * reasons, one of which is a rule she set herself.
 */
export type GlanceActionOutcome =
  | { ok: true; note: string }
  | { ok: false; refusedAtSurface: boolean; status: number | null; error: string };

/** Injectable for the tests. Nothing else is ever passed. */
export interface GlanceActionDeps {
  fetchImpl?: typeof fetch;
}

/** A candidate holder, as `SameTeamSubject` needs one plus a name to show. */
export interface GlanceAssignable {
  personId: string;
  name: string;
  role: string;
  teamId: string | null;
  /** Ruling 18's subject. The only thing the picker reads it for is OUT. */
  state: PersonState;
}

/**
 * The tone this surface reminds in.
 *
 * WARM, AND NOT A PICKER. §3 refuses messaging on this screen, and Ruling 1's general test
 * refuses anything that makes the host lean in; a four-variant tone picker and an editable
 * textarea is the V1 composer (`src/components/plan/NudgeComposer.tsx`), which is where a
 * host who wants to write her own words already goes. The glance presses once.
 */
export const GLANCE_NUDGE_VARIANT: HostNudgeVariant = 'warm';

/**
 * Said on every action that leaves the board showing something that is no longer true.
 *
 * NO POLLING THIS PHASE — Ruling 10's ~20 seconds is phase 6, and until it lands the
 * honest thing is to say the board is behind rather than to let her read a stale strip as
 * a current one.
 */
export const STALE_NOTE = 'This board still shows the state from before — reload to see it.';

/**
 * Ruling 14, at the action layer. Returns the reason to refuse, or null to proceed.
 *
 * The wording names the mark rather than saying "not allowed", because the host set it and
 * the only way out is to change it.
 */
export function remindRefusal(person: Pick<GlancePerson, 'nudgeMark'>): string | null {
  if (isChaseable(person.nudgeMark)) return null;
  return DONT_CHASE_NOT_ADDRESSABLE_MESSAGE;
}

/**
 * What a remind is about, in the words the template wants.
 *
 * THE UNSETTLED ROWS, NOT ALL OF THEM. A green row is one she has already agreed to;
 * naming it back at her is the wrong ask. With no unsettled row the phrase falls back to
 * the generic one V1's composer already uses, because an itemless person can still be
 * amber (Ruling 16) and the ask is still real.
 */
export function remindItemPhrase(items: readonly GlanceItem[]): string {
  const open = items.filter((i) => i.state !== 'GREEN').map((i) => i.name);
  if (open.length === 0) return 'your assigned items';
  if (open.length === 1) return open[0];
  return open.slice(0, 2).join(' and ');
}

/** The context the shared template needs and the payload does not carry. */
export interface GlanceRemindContext {
  eventName: string;
  eventDate: string;
}

/**
 * REMIND — the existing manual-nudge route, with the existing template.
 *
 * The body is exactly what that route already validates: one of its four variants, and a
 * non-empty message. The message is `getHostNudgeMessage`'s, so the words the glance sends
 * and the words V1 sends come from one place.
 */
export function remindRequest(
  eventId: string,
  person: Pick<GlancePerson, 'personId' | 'name' | 'items'>,
  context: GlanceRemindContext
): GlanceActionRequest {
  return {
    url: `/api/events/${eventId}/people/${person.personId}/nudge`,
    method: 'POST',
    body: {
      template: GLANCE_NUDGE_VARIANT,
      message: getHostNudgeMessage(GLANCE_NUDGE_VARIANT, {
        guestFirstName: person.name.split(' ')[0] || person.name,
        taskItem: remindItemPhrase(person.items),
        eventName: context.eventName,
        eventDate: context.eventDate,
      }),
    },
  };
}

/**
 * REASSIGN — the existing assign route.
 *
 * NO `reason` IS SENT. GTC-196 makes the why optional on this route and states that its
 * absence "is recorded as a gap in the history, not rejected". A reason box on the glance
 * would be a second thing to do before the action lands, and a fabricated constant would
 * be worse than the recorded gap — it would put words in her mouth in the ledger.
 */
export function reassignRequest(
  eventId: string,
  item: Pick<GlanceItem, 'itemId'>,
  toPersonId: string
): GlanceActionRequest {
  return {
    url: `/api/events/${eventId}/items/${item.itemId}/assign`,
    method: 'POST',
    body: { personId: toPersonId },
  };
}

/**
 * TAKE OVER — a reassign to the host. The SAME request, deliberately.
 *
 * GTC-256 Ruling 9's self-pick is already the second exception in `mayHoldRow`, and the
 * route already applies it. "Take over" is a name for a destination, not a second
 * mechanism; `tests/glance-actions-test.ts` asserts the two requests are byte-identical so
 * that a future divergence has to be deliberate.
 */
export function takeOverRequest(
  eventId: string,
  item: Pick<GlanceItem, 'itemId'>,
  hostPersonId: string
): GlanceActionRequest {
  return reassignRequest(eventId, item, hostPersonId);
}

/**
 * Who may be offered this row, asked of the SHARED rule.
 *
 * `mayHoldRow` is GTC-171's rule and GTC-256's exemption in one function, and it is the
 * same function the route gates on — so the picker cannot offer a name the route will
 * refuse, and cannot hide one it would accept. No team comparison is written here; the
 * test asserts this file contains none.
 *
 * `exclude` is PRESENTATION ONLY — it drops names that already have their own control (the
 * host has the take-over button) or would be a no-op (the person who holds the row today).
 * It can only ever remove; it never widens what the rule allows.
 *
 * ⚠ AN `OUT` PERSON IS NOT OFFERED — RULING 18 (2026-09-01). "Handing an item to someone
 * who declined is a mistake the surface should not offer; Ruling 7's absence-recedes argues
 * the same way." Phase 4 shipped him in the picker as an unruled proposal; the founder ruled
 * him out.
 *
 * ⚠ AND IT IS A SURFACE FILTER ON THIS PICKER, NOT A ROUTE CHANGE — the ruling says so in
 * those words. Attendance gates no assignment anywhere in the tree and nothing was added to
 * make it one: a host who genuinely wants to hand a row to someone who declined (they are
 * dropping it off anyway) still does it through the plan's own assignment UI, and the route
 * still takes it. `tests/glance-actions-test.ts` asserts BOTH halves — the picker refuses
 * him, and the route accepts him — because the split is the point and looks like an
 * inconsistency without them. "If that split ever feels wrong in practice, it gets its own
 * ruling."
 *
 * ⚠ IT CATCHES OUT AND NOTHING ELSE. A don't-chase person is still offered: the mark
 * suppresses CHASING, never HOLDING, and Ruling 14's grey says nothing about whether someone
 * can be given a job.
 */
export function reassignCandidates(
  pool: readonly GlanceAssignable[],
  item: Pick<GlanceItem, 'kind' | 'teamId'>,
  actorRole: AssignActorRole,
  hostPersonId: string,
  exclude: readonly string[] = []
): GlanceAssignable[] {
  return pool.filter(
    (candidate) =>
      !exclude.includes(candidate.personId) &&
      // Ruling 18. Above `mayHoldRow` rather than inside it: that module is the ASSIGNMENT
      // rule and answers "may this person hold this row" for every caller in the tree, which
      // an out person still may. This is one picker declining to propose it.
      candidate.state !== 'OUT' &&
      mayHoldRow(
        { personId: candidate.personId, role: candidate.role, teamId: candidate.teamId },
        { kind: item.kind, teamId: item.teamId },
        actorRole,
        hostPersonId
      )
  );
}

/**
 * Ask a route, and report what it said.
 *
 * A ROUTE'S REFUSAL IS SHOWN AS THE ROUTE'S. The error text is passed through rather than
 * rewritten: the routes already word their refusals for a host ("This person is recorded
 * as a child and cannot be messaged directly"), and a second wording here would be a
 * second place to keep them true.
 */
async function ask(
  request: GlanceActionRequest,
  note: string,
  deps: GlanceActionDeps = {}
): Promise<GlanceActionOutcome> {
  const call = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await call(request.url, {
      method: request.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
    });
  } catch {
    return {
      ok: false,
      refusedAtSurface: false,
      status: null,
      error: 'Could not reach Gather. Nothing was sent.',
    };
  }

  if (response.ok) return { ok: true, note };

  let error = 'Something went wrong.';
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body?.error === 'string' && body.error.length > 0) error = body.error;
  } catch {
    /* some refusals have no body */
  }
  return { ok: false, refusedAtSurface: false, status: response.status, error };
}

/**
 * REMIND.
 *
 * The refusal is checked BEFORE the request is built, so a marked person produces no
 * network call at all — which is the form Ruling 14 has to take if it is a rule about the
 * system rather than a disabled button.
 *
 * ⚠ AND IT DOES NOT CLAIM THE BOARD WILL MOVE. A nudge changes no state; the strip stays
 * exactly as red as it was until the person answers. `STALE_NOTE` is deliberately absent
 * here — saying "reload to see it" would promise a change that has not happened.
 */
export async function remind(
  eventId: string,
  person: Pick<GlancePerson, 'personId' | 'name' | 'items' | 'nudgeMark'>,
  context: GlanceRemindContext,
  deps: GlanceActionDeps = {}
): Promise<GlanceActionOutcome> {
  const refusal = remindRefusal(person);
  if (refusal !== null) {
    return { ok: false, refusedAtSurface: true, status: null, error: refusal };
  }
  return ask(
    remindRequest(eventId, person, context),
    'Reminded. Nothing here changes until they reply.',
    deps
  );
}

/** REASSIGN. */
export async function reassign(
  eventId: string,
  item: Pick<GlanceItem, 'itemId' | 'name'>,
  toPersonId: string,
  toName: string,
  deps: GlanceActionDeps = {}
): Promise<GlanceActionOutcome> {
  return ask(reassignRequest(eventId, item, toPersonId), `Moved to ${toName}. ${STALE_NOTE}`, deps);
}

/** TAKE OVER — the same route, the host as the assignee. */
export async function takeOver(
  eventId: string,
  item: Pick<GlanceItem, 'itemId' | 'name'>,
  hostPersonId: string,
  deps: GlanceActionDeps = {}
): Promise<GlanceActionOutcome> {
  return ask(takeOverRequest(eventId, item, hostPersonId), `Yours now. ${STALE_NOTE}`, deps);
}
