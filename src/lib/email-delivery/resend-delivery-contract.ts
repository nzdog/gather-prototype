import type { GetEmailResponseSuccess } from 'resend';

/**
 * GTC-289 phase 1 — THE EMAIL DELIVERY INTERPRETER. A library, and nothing else.
 *
 * Hinge §7's bounce rule is written against EMAIL — *"twelve are away, two bounced"* — and email is
 * the channel with no delivery signal at all. [[GTC-264]] built the SMS half. This is the start of
 * the other one.
 *
 * ── ⚠ THE MECHANISM IS THE POLL, AND THAT REVERSES GTC-289'S STATED SHAPE ─────
 *
 * That ticket assumed a webhook, because a bounce ingest usually is one. Founder ruling,
 * 2026-09-19, taking the poll instead, and the reason is worth keeping because it is about which
 * contract we can actually read:
 *
 *   "last_event is a closed twelve-value union that exists in this tree today; the webhook's bounce
 *    detail is two untyped strings that need a live trial to learn. The poll needs no public URL, no
 *    signature scheme, no third SHARED_SECRETS entry and no pinned-count change, and it runs on the
 *    cron pattern slice 5c already built. Worse latency, better everything else — and the board is
 *    not a real-time surface."
 *
 * `resend.emails.get(id)` answers `GetEmailResponseSuccess`, whose `last_event` is a closed union of
 * twelve. `resend.webhooks.verify(...)` answers a `WebhookEventPayload` whose bounce detail is
 * `{ message: string; subType: string; type: string }` — the partition exists and its vocabulary is
 * nowhere in this repo.
 *
 * ── ⚠ THE PROVENANCE OF EVERY VALUE BELOW, AND ITS LIMIT ──────────────────────
 *
 * The vocabulary comes from **resend@6.22.0's shipped type declarations** at
 * `node_modules/resend/dist/index.d.mts`. **It is NOT an observed response.** That is slice 4b's own
 * recorded limit — *"the stub models Resend's success envelope from the SDK's TYPE rather than from
 * an OBSERVED response. If the real body were shaped otherwise, the code and the stub would be wrong
 * together"* — inherited here and named rather than repeated by accident.
 *
 * ⚠ AND THERE IS NO RESEND DOCUMENT IN THIS REPO. TNZ has four artifacts in `docs/05_ops` because
 * somebody obtained and transcribed them; Resend has none, and slice 4b, slice 5c and now this phase
 * have each inherited the same unobserved-shape limit. **That gap is [[GTC-323]]'s**, filed so it is
 * a task rather than a caveat repeated in three evidence sections.
 *
 * ── ⚠ WHAT THIS MODULE REFUSES TO ANSWER. THIS IS THE POINT OF IT ─────────────
 *
 * **1. WHETHER IT ARRIVED.** There is no exported boolean called delivered, arrived or successful,
 * and `delivered` is classified as `PROVIDER_REPORTS_DELIVERED` — what the provider SAID, not what
 * happened to the message. GTC-289 **Unknown 3** asks whether `delivered` is affirmative or merely
 * no-failure-yet, **and the poll does not settle it.** A module that answered would be guessing on
 * the glance's behalf. GTC-264's contract module refuses the identical question for TNZ, where two
 * of four `Success` values turned out not to be arrivals.
 *
 * **2. WHETHER A BOUNCE IS PERMANENT.** Founder ruling, 2026-09-19: *"No hard/soft partition
 * asserted, in any phase... a wrong partition turns a transient bounce into a permanent red, and
 * §7's rule is the thing being implemented."*
 *
 * ⚠ **AND THE POLL COULD NOT SUPPLY ONE ANYWAY: `last_event` has ONE `bounced` member with no type
 * beside it. So the poll gets THE FACT of a bounce and not its KIND.** Hinge §7's red-on-arrival rule
 * needs the fact — *"a bounce is not a silence, it's a dead channel"* — and ruling U's bounce door
 * needs the kind, because *send again to the same address* is right for one kind of bounce and
 * useless for another. **This phase supplies the first only, and the second needs the webhook's
 * `bounce.type` observed.**
 *
 * **3. WHAT COLOUR ANY OF IT IS.** [[GTC-192]] rules what the glance shows and owns the red source
 * itself; GTC-289's own scope says this ticket *"supplies the data and does not add a
 * `RED_REASON`"*. There is no colour vocabulary in this file and it must not gain any — GTC-264's
 * contract module: *"THE BUCKETS ARE NOT COLOURS."*
 *
 * ── ONE MODULE, NOT TWO — THE PRECEDENT APPLIED RATHER THAN COPIED ────────────
 *
 * ⚠ GTC-264 split `tnz-webhook-envelope.ts` from `tnz-delivery-contract.ts` FOR A STATED REASON: one
 * envelope with two consumers, its own delivery report and [[GTC-288]]'s reply, and leaving the
 * reply's fields out *"would force GTC-288 to extend the type before it could parse a reply, and
 * that is the first step back toward the second parser the envelope ruling exists to prevent."*
 *
 * **That reason does not exist here.** A poll response has one shape and one consumer. Splitting it
 * would be mirroring a file count instead of applying a rule, so it is one module — and if a webhook
 * is ever added, IT is the second consumer and THAT is when the split earns itself.
 *
 * ✅ AND THE SAME TEST PRODUCED A SPLIT ONE PHASE LATER, WHICH IS WHAT MAKES IT A RULE RATHER THAN A
 * PREFERENCE. `resend-error-contract.ts` beside this file is phase 2's: `ErrorResponse.name` off a
 * SEND, about a message the provider REFUSED, where this reads `last_event` off a POLL, about a
 * message the provider ACCEPTED. **Mutually exclusive by construction** — a message has an id to poll
 * or it has an error code, never both — two declarations, two responses, two consumer sets. A reason
 * existed there and was written down; none existed here and none was invented.
 *
 * ⚠ **Following a file count rather than a rule is how a precedent becomes a habit.** Founder
 * ruling, 2026-09-19. [[GTC-192]]'s standing warning carries it as a general rule.
 */

/**
 * The twelve values `GetEmailResponseSuccess.last_event` may hold, as resend@6.22.0 declares them.
 *
 * ⚠ TAKEN FROM THE SDK'S OWN TYPE RATHER THAN RESTATED, so a thirteenth member in a future SDK
 * version is a COMPILE ERROR in `LAST_EVENT_KIND` below rather than a silent `UNRECOGNISED` in
 * production. That is the `Record`-keyed-on-a-union guard [[GTC-189]] slice 5b demonstrated with a
 * mutation rather than asserting.
 */
export type ResendLastEvent = GetEmailResponseSuccess['last_event'];

/**
 * What Gather takes from a `last_event`. **Not a colour, not an arrival, not a bounce kind.**
 *
 * ⚠ THE THREE PROVIDER FAILURES ARE THREE KINDS AND ARE NOT BUNDLED. `bounced` is accepted-then-
 * refused by the receiving side; `failed` is Resend not sending it; `suppressed` is Resend refusing
 * because the address is on a list. They are different facts and the provider states them
 * separately, so collapsing them here would model a vocabulary nobody has observed — GTC-264 Phase
 * 1's restraint, and the same reason `providerError` and `withheldWhy` are two columns.
 *
 * ⚠ AND `complained` IS NOT A BOUNCE. A complaint is a LIVE address whose owner does not want mail.
 * Hinge §7's rule is about a DEAD channel — *"nudging it sends more messages into the same void"* —
 * and a complaint is the opposite problem. Whether it should stop the chase is a product question
 * and is nobody's here.
 */
export type ResendOutcomeKind =
  /** queued, scheduled, sent, delivery_delayed — nothing has concluded. */
  | 'IN_FLIGHT'
  /** delivered — what the PROVIDER reported. See refusal 1: this is not "arrived". */
  | 'PROVIDER_REPORTS_DELIVERED'
  /** opened, clicked — engagement. Stronger evidence than `delivered` and still not an answer. */
  | 'ENGAGEMENT_REPORTED'
  /** bounced — the FACT of a bounce. Its kind is not available from the poll. */
  | 'BOUNCED'
  /** failed — the provider did not send it. */
  | 'PROVIDER_FAILED'
  /** suppressed — the provider refused it against a list of its own. */
  | 'SUPPRESSED'
  /** complained — a live address that does not want mail. Not a dead channel. */
  | 'COMPLAINED'
  /** canceled — the send was withdrawn before delivery. */
  | 'CANCELLED'
  /** Anything the SDK does not declare. Recorded, never rejected. */
  | 'UNRECOGNISED';

/**
 * Every declared `last_event`, classified.
 *
 * ⚠ A `Record` OVER THE SDK'S UNION, SO A NEW MEMBER DOES NOT COMPILE UNTIL SOMEBODY CLASSIFIES IT.
 * The alternative — a `switch` with a default, or a lookup with a fallback — turns a provider adding
 * a value into an `UNRECOGNISED` in production that nobody is told about.
 */
const LAST_EVENT_KIND: Record<ResendLastEvent, ResendOutcomeKind> = {
  queued: 'IN_FLIGHT',
  scheduled: 'IN_FLIGHT',
  sent: 'IN_FLIGHT',
  delivery_delayed: 'IN_FLIGHT',
  delivered: 'PROVIDER_REPORTS_DELIVERED',
  opened: 'ENGAGEMENT_REPORTED',
  clicked: 'ENGAGEMENT_REPORTED',
  bounced: 'BOUNCED',
  failed: 'PROVIDER_FAILED',
  suppressed: 'SUPPRESSED',
  complained: 'COMPLAINED',
  canceled: 'CANCELLED',
};

export interface ResendOutcome {
  kind: ResendOutcomeKind;
  /** Preserved verbatim, recognised or not — so an unexpected value can be read afterwards. */
  lastEvent: string | null;
  /** False for anything the installed SDK does not declare. */
  recognised: boolean;
}

/**
 * Classify one `last_event`.
 *
 * ⚠ AN UNRECOGNISED VALUE IS RECORDED, NEVER REJECTED, and never thrown on. GTC-264's rule —
 * *"Seventeen documented values is not a closed set — they are documented, not observed. An
 * unrecognised Result parses, is preserved verbatim, gets no bucket, and is flagged"* — with one
 * difference worth naming: here the twelve ARE a closed union in the SDK's type, so an unrecognised
 * value means the installed SDK and the live API have diverged. That is a louder fact than TNZ's
 * equivalent, and it still must not crash a cron tick.
 */
export function interpretResendLastEvent(lastEvent: string | null | undefined): ResendOutcome {
  if (typeof lastEvent !== 'string' || lastEvent.length === 0) {
    return { kind: 'UNRECOGNISED', lastEvent: lastEvent ?? null, recognised: false };
  }
  const kind = (LAST_EVENT_KIND as Record<string, ResendOutcomeKind | undefined>)[lastEvent];
  if (!kind) return { kind: 'UNRECOGNISED', lastEvent, recognised: false };
  return { kind, lastEvent, recognised: true };
}

export type ResendPollRead =
  | {
      ok: true;
      /** `GetEmailResponseSuccess.id`. See the join note below. */
      emailId: string;
      /** `GetEmailResponseSuccess.message_id`. See the join note below. */
      messageId: string | null;
      outcome: ResendOutcome;
      createdAt: string | null;
      /**
       * `GetEmailResponseSuccess.to` — the addresses the PROVIDER says it sent to. [[GTC-189]]
       * slice 8a keys the address-wide block on this rather than on `Person.email` at poll time,
       * which ruling U's edit-and-send can have changed since the send. Strings only, never
       * coerced: a missing or malformed field reads as NO addresses, and no block is written.
       */
      to: string[];
    }
  | { ok: false; why: string };

/**
 * Read a poll response into Gather's shape, or refuse it with a reason.
 *
 * ⚠ VALIDATED AND NOT COERCED. A response with no `last_event` is refused rather than defaulted to
 * anything, because every default here is a claim about a message: defaulting to in-flight says
 * "still going" and defaulting to unrecognised says "the API changed", and neither is known.
 *
 * ── ⚠ THE JOIN IS UNVERIFIED, AND THIS IS THE FINDING OF THE INVESTIGATION ────
 *
 * Slice 4b stores the SEND response's `data.id` into `OutboundMessage.providerMessageId`, and its
 * docstring promises slice 6 will join on it. **The poll answers with `id` AND `message_id`, and the
 * webhook payload carries `email_id` AND `message_id` — neither of them called `id`.**
 *
 * `id` is the obvious match for the send's `id`, and `message_id` reads like the RFC 5322 header.
 * **That is inference and it is not built on.** Both are carried through this shape, unlabelled as
 * the join key, and **which one matches is UNVERIFIED until one live accepted send and one poll say
 * so.**
 *
 * Why it matters more than a field name: slice 4b already recorded the cost of an id that does not
 * match — *"a value that is not the provider's would match nothing and read as a LOST BOUNCE rather
 * than as a send that never happened."*
 *
 * ⚠ **SO THIS IS THE SINGLE THING MOST LIKELY TO FAIL SILENTLY ON THE DAY A WORKING KEY EXISTS**, and
 * it fails in the direction that looks like nothing happened. Founder ruling, 2026-09-19. Every other
 * unknown here announces itself: an unrecognised `last_event` is flagged, a malformed response is
 * refused with a reason, a missing field is a red. **A join on the wrong field returns zero rows and
 * zero rows is what a quiet week looks like.** Nothing distinguishes *no bounces arrived* from *every
 * bounce failed to match*, so the first live poll must verify the join explicitly — one accepted send,
 * one poll, the two ids compared — before any board reads a bounce off it.
 */
export function readResendPollResponse(response: unknown): ResendPollRead {
  if (typeof response !== 'object' || response === null) {
    return { ok: false, why: 'The poll response was not an object.' };
  }
  const r = response as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) {
    return { ok: false, why: 'The poll response carried no id.' };
  }
  if (typeof r.last_event !== 'string' || r.last_event.length === 0) {
    return { ok: false, why: 'The poll response carried no last_event.' };
  }
  return {
    ok: true,
    emailId: r.id,
    messageId: typeof r.message_id === 'string' ? r.message_id : null,
    outcome: interpretResendLastEvent(r.last_event),
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
    to: Array.isArray(r.to) ? r.to.filter((a): a is string => typeof a === 'string' && !!a) : [],
  };
}
