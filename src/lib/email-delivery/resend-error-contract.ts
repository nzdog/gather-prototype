import type { ErrorResponse } from 'resend';

/**
 * GTC-289 phase 2 ([[GTC-189]] slice 6) — WHAT RESEND SAYS WHEN IT REFUSES TO TAKE A MESSAGE.
 *
 * A library. It classifies one value and decides nothing.
 *
 * ── WHY IT EXISTS: A SHIPPED PREDICATE WAS READING THE WRONG FIELD ────────────
 *
 * Slice 5c's `isRetryableProviderError` matched a MESSAGE STRING, because `SendResult` collapsed
 * Resend's error to `error?: string`. The SDK declares `ErrorResponse { message; statusCode; name }`
 * where `name` is a closed 21-value code union — so the dispatcher was reading prose where a code
 * existed, and slice 5c's own evidence says so. Founder ruling, 2026-09-19: *"a shipped predicate
 * known to be reading the wrong field should not wait behind a migration and a rehearsal."*
 *
 * ── THE BOUNDARY, WHICH IS THE WHOLE DESIGN ───────────────────────────────────
 *
 *   `resultOf` (src/lib/email.ts) reads the ENVELOPE  →  this module names the CODE  →
 *   `isRetryableProviderError` (src/lib/press/dispatch.ts) decides the POLICY.
 *
 * ⚠ THERE IS NO RETRY POLICY IN THIS FILE AND THERE MUST NEVER BE ONE. `daily_quota_exceeded` is the
 * case that proves the boundary is real rather than tidy: the FACT is that an allowance is spent, and
 * whether that is worth waiting for depends entirely on a backoff measured in minutes — which is the
 * dispatcher's number, not the provider's. If the backoff ever grows to hours, `QUOTA_SPENT` is the
 * one kind whose POLICY changes and this file does not.
 *
 * It is the same rule as `src/lib/email.ts`'s header — RECORD INSIDE, DECIDE OUTSIDE — one layer
 * down, and the same rule as [[GTC-264]]'s *"THE BUCKETS ARE NOT COLOURS."*
 *
 * ── ⚠ TWO FILES, NOT ONE, AND THE REASON IS STATED RATHER THAN ASSUMED ────────
 *
 * `resend-delivery-contract.ts` beside this one is phase 1's: it reads `last_event` off a POLL, about
 * a message the provider ACCEPTED. This one reads `ErrorResponse.name` off a SEND, about a message
 * the provider REFUSED. **The two are mutually exclusive by construction** — a message has a provider
 * id to poll, or it has an error code, never both — they are two different declarations read from two
 * different responses, and their consumers differ: this one is read today by the dispatcher, that one
 * by a poller that does not exist yet.
 *
 * That is the test GTC-264's precedent actually sets. Its split had a STATED REASON, and phase 1
 * declined to copy the split where no reason existed; here a reason exists and is written down.
 * **Following a file count rather than a rule is how a precedent becomes a habit.**
 *
 * ── ⚠ THE PROVENANCE, AND WHAT ONE OBSERVATION DID TO IT ──────────────────────
 *
 * The 21 codes are the SDK's own union, imported rather than restated. **The classification of each
 * one is inference from its NAME**, because there is no Resend document in this repo: [[GTC-323]].
 *
 * ⚠ AND ON 2026-09-19 THE FIRST LIVE ENVELOPE WAS OBSERVED, WITH A DELIBERATELY INVALID SENTINEL KEY
 * — no credential, nothing delivered, refused at submission:
 *
 *     { statusCode: 401, name: 'validation_error', message: 'API key is invalid' }
 *
 * Two things follow, and the second is worth more than this module:
 *
 * 1. **The declared shape matches the live body exactly** — three fields, those names, `statusCode`
 *    a number. That is slice 4b's *"the code and the stub would be wrong together"* limit closed for
 *    the FAILURE envelope. The SUCCESS envelope is still unobserved and [[GTC-247]] still owns it.
 * 2. ⚠ **RESEND ANSWERS AN INVALID KEY WITH `validation_error`, NOT WITH `invalid_api_key`.** The one
 *    code anybody has ever seen from this provider is classified `REQUEST_REFUSED` here, by its own
 *    name, and the truth of that observation was an AUTH failure. The retry decision is unaffected —
 *    both kinds are terminal — but **a kind must never be shown to a host as a reason**, because the
 *    provider demonstrably reuses one code for two different situations. The four `AUTH_REFUSED`
 *    members may be rarer in practice than their names suggest.
 *
 * **So the names are a usable guide to WHETHER TO RETRY and a poor guide to WHY.** This module
 * answers the first and its kinds are deliberately coarse.
 */

/**
 * The 21 values `ErrorResponse.name` may hold, as resend@6.22.0 declares them.
 *
 * ⚠ TAKEN FROM THE SDK'S OWN TYPE RATHER THAN RESTATED, so a 22nd member in a future SDK version is a
 * COMPILE ERROR in `ERROR_CODE_KIND` below rather than a silent `UNRECOGNISED` in production. The
 * union itself is not exported by the package; `ErrorResponse['name']` is how it is reached.
 */
export type ResendErrorCode = ErrorResponse['name'];

/**
 * What Gather takes from an error code. **A fact about the refusal, never a policy about retrying and
 * never a sentence for a host** — see the header's second observation.
 */
export type ResendErrorKind =
  /** rate_limit_exceeded — the provider is busy. Nothing is wrong with the request. */
  | 'PROVIDER_BUSY'
  /** internal_server_error, application_error — the provider broke. Nothing is wrong with the request. */
  | 'PROVIDER_FAULT'
  /** The key will not do: missing, invalid, restricted, or without this access. */
  | 'AUTH_REFUSED'
  /** An allowance is spent. The account is fine and the request is fine. */
  | 'QUOTA_SPENT'
  /** The provider will not take this request as sent. Repeating it cannot make it right. */
  | 'REQUEST_REFUSED'
  /** Anything the installed SDK does not declare. Recorded, never rejected. */
  | 'UNRECOGNISED';

/**
 * Every declared code, classified.
 *
 * ⚠ A `Record` OVER THE SDK'S UNION, SO A NEW CODE DOES NOT COMPILE UNTIL SOMEBODY CLASSIFIES IT.
 * Phase 1 proved that guard with a mutation rather than asserting it: deleting one entry produced
 * `error TS2741`, naming the whole union back.
 */
const ERROR_CODE_KIND: Record<ResendErrorCode, ResendErrorKind> = {
  // ── The provider's own state. The only two kinds a retry can help.
  rate_limit_exceeded: 'PROVIDER_BUSY',
  internal_server_error: 'PROVIDER_FAULT',
  /*
   * ✅ SETTLED, AND THE MARKER IS DOWN — [[GTC-323]], 2026-09-19. Resend publish it:
   *
   *   `application_error` — HTTP **500** — "An unexpected error occurred."
   *
   * Provider-side, at a server status. ⚠ SUPERSEDED, KEPT SO THE CHANGE IS LEGIBLE: this entry
   * carried an UNCERTAIN marker reading it as provider-side *"from its neighbours"* and warning
   * that if it meant *"your application did something wrong"* the entry was wrong and a retry
   * wasted two attempts. **The inference was right and is now read rather than inferred.**
   * `PROVIDER_FAULT` and the retry stand, on the document rather than on the neighbours.
   * Transcript: `docs/05_ops/resend-error-and-delivery-contract-2026-09.md`.
   */
  application_error: 'PROVIDER_FAULT',

  // ── The key. This is what slice 5c's 401/403 guard existed for.
  missing_api_key: 'AUTH_REFUSED',
  invalid_api_key: 'AUTH_REFUSED',
  restricted_api_key: 'AUTH_REFUSED',
  invalid_access: 'AUTH_REFUSED',

  // ── The allowance. A fact about the account; the schedule is the dispatcher's.
  daily_quota_exceeded: 'QUOTA_SPENT',
  monthly_quota_exceeded: 'QUOTA_SPENT',

  // ── The request. Repeating it cannot make it right.
  //
  // ⚠ `validation_error` IS THE OBSERVED ONE, AND ITS OBSERVATION WAS AN AUTH FAILURE. See the
  // header: a live invalid key answers `validation_error` / 401. Kept here, because the code plainly
  // covers request validation too and reclassifying a general code by one sighting would be worse
  // than a coarse kind. Both kinds are terminal, so the decision is identical either way.
  validation_error: 'REQUEST_REFUSED',
  missing_required_field: 'REQUEST_REFUSED',
  invalid_parameter: 'REQUEST_REFUSED',
  invalid_attachment: 'REQUEST_REFUSED',
  /*
   * ⚠ THE ONE THIS TREE IS MOST LIKELY TO MEET. `EMAIL_FROM` is Resend's SANDBOX sender and slice 5c
   * rewrites its display name to the host's (ruling F), so an unverified or malformed `from` is a
   * live risk on every ask. Terminal is right: the same address cannot become verified by being sent
   * to again. [[GTC-247]].
   */
  invalid_from_address: 'REQUEST_REFUSED',
  invalid_region: 'REQUEST_REFUSED',
  not_found: 'REQUEST_REFUSED',
  method_not_allowed: 'REQUEST_REFUSED',
  /*
   * ⚠ STILL UNCERTAIN, AND NOW FOR A REASON RATHER THAN FOR WANT OF LOOKING — [[GTC-323]] read the
   * published error pages on 2026-09-19: **declared in `resend@6.22.0`, published nowhere.**
   *
   * `security_error` does not say WHOSE security, and the name is compatible with both "we refused
   * this payload" and "something is wrong at our end". Read as the request, because a terminal
   * keeps a mystery from being sent three times.
   *
   * ⚠ DO NOT TAKE THIS MARKER DOWN ON THE STRENGTH OF THAT TRANSCRIPT. It records an ABSENCE, and
   * an absence is not evidence either way — which is the difference between this entry and
   * `application_error` above, where the same reading found the answer.
   */
  security_error: 'REQUEST_REFUSED',
  /*
   * The idempotency family. ⚠ UNREACHABLE TODAY: no sender in this tree passes an idempotency key, so
   * none of these three can occur. Terminal, so an impossible answer is never retried — and
   * `concurrent_idempotent_requests` is arguably transient if it ever does occur. Left terminal
   * deliberately; if Gather ever sends an idempotency key, this is the entry to revisit.
   */
  invalid_idempotency_key: 'REQUEST_REFUSED',
  invalid_idempotent_request: 'REQUEST_REFUSED',
  concurrent_idempotent_requests: 'REQUEST_REFUSED',
};

export interface ResendErrorRead {
  kind: ResendErrorKind;
  /** Preserved verbatim, recognised or not — so an unexpected code can be read afterwards. */
  code: string | null;
  /** False for anything the installed SDK does not declare. */
  recognised: boolean;
}

/**
 * Classify one error code.
 *
 * ⚠ AN UNRECOGNISED CODE IS RECORDED, NEVER REJECTED, and never thrown on — [[GTC-264]]'s rule. Here
 * it carries one extra meaning: the 21 ARE a closed union in the installed SDK's type, so an
 * unrecognised code means the SDK and the live API have diverged. That is a louder fact than TNZ's
 * equivalent and it still must not crash a cron tick.
 *
 * ⚠ AND AN ABSENT CODE IS NOT AN EMPTY ONE. `null`, `undefined` and `''` all read as `code: null`,
 * because an absent code has a specific meaning on the email path: the provider was never reached.
 * The senders' `catch` blocks return no code at all — a thrown `Error` has a `.name` too, and
 * `TypeError` is not a provider answer.
 */
export function interpretResendErrorCode(code: string | null | undefined): ResendErrorRead {
  if (typeof code !== 'string' || code.length === 0) {
    return { kind: 'UNRECOGNISED', code: null, recognised: false };
  }
  const kind = (ERROR_CODE_KIND as Record<string, ResendErrorKind | undefined>)[code];
  if (!kind) return { kind: 'UNRECOGNISED', code, recognised: false };
  return { kind, code, recognised: true };
}
