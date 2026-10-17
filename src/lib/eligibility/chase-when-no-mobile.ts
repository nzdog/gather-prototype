/**
 * GTC-311 — the chase's channel for a person with no mobile it can text: the event-level default,
 * and the named exception that overrides it.
 *
 * [[GTC-189]] ruling AH: one event-level default, *"chase by email when there's no mobile"*, ON.
 * The per-person control survives as the exception and means **HAND THIS ONE TO ME**.
 *
 * ⚠ THE CONTROL'S POLARITY INVERTED ON 2026-09-15. Under ruling AG the per-person control meant
 * CHASE THIS ONE; under AH it means HAND THIS ONE TO ME. That is why the vocabulary is two NAMED
 * values and never a boolean: a read cannot invert what names its own behaviour.
 *
 * THE NAMED EXCEPTION WINS — ruling AL, both directions. Where `PersonEvent.chaseException` is set
 * it decides; where it is NULL, `Event.chaseWhenNoMobileDefault` decides; where that is NULL, the
 * system default below decides. No precedence table and no third case. The founder's reason is the
 * argument, not only the outcome: a default is a rule about everyone, the exception is a decision
 * about one named person, and *"a decision about a person always beats a rule about everyone"*.
 *
 * ⚠ ITS OWN MODULE, NEVER A BRANCH IN `resolveNudgeOffsetDays` (ruling AL, consequence 1). That
 * function composes two INTENSITY settings by the intensity axis's own rule, and must go on doing
 * so; a second axis with the opposite rule inside it is how one of them starts answering the other's
 * question. The structural sibling is `resolveDecideByOffsetHours` in `src/lib/decide-by.ts` —
 * per-item, else per-event, else system.
 *
 * ⚠ READ THROUGH THE CHOOSER. `chaseChannelOf` in `src/lib/eligibility/channel-chooser.ts` asks this
 * only after the SMS opt-out, the email opt-out, the don't-chase mark and a usable mobile have each
 * had their say — the whole order is stated there. The pre-flight and [[GTC-189]] slice 8 both read
 * the answer through `chooseChaseRoute`, so they cannot disagree. The words module calls this
 * directly for one thing only: which pill to mark as the default.
 *
 * IMPORTS NOTHING, so the pre-flight screen can run it in the browser — the arrangement
 * `nudge-cadence.ts` has with the same screen.
 */

/**
 * The two behaviours. The source of the vocabulary; the Prisma enum `ChaseWhenNoMobile` is the
 * copy, and `tests/chase-channel-test.ts` compiles a probe asserting the two are equal.
 */
export type ChaseWhenNoMobile = 'BY_EMAIL' | 'HAND_TO_HOST';

/** Ruling AH: ON. What an event that has never set its switch does. */
export const DEFAULT_CHASE_WHEN_NO_MOBILE: ChaseWhenNoMobile = 'BY_EMAIL';

export function isChaseWhenNoMobile(value: unknown): value is ChaseWhenNoMobile {
  return value === 'BY_EMAIL' || value === 'HAND_TO_HOST';
}

/**
 * For a person the chase cannot text and who holds an email: email them, or hand them to the host?
 *
 * A params object, as `resolveDecideByOffsetHours` takes one, so the two sources cannot be passed
 * the wrong way round — which, for a rule whose whole content is which of the two wins, is the
 * mistake that matters.
 */
export function resolveChaseWhenNoMobile(sources: {
  /** `PersonEvent.chaseException` — the named exception. NULL means follow the default. */
  exception: ChaseWhenNoMobile | null | undefined;
  /** `Event.chaseWhenNoMobileDefault` — the event's switch. NULL means not set. */
  eventDefault: ChaseWhenNoMobile | null | undefined;
}): ChaseWhenNoMobile {
  return sources.exception ?? sources.eventDefault ?? DEFAULT_CHASE_WHEN_NO_MOBILE;
}
