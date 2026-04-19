/**
 * Token limits for Moment 2 AI calls.
 *
 * These caps pass to the Anthropic `max_tokens` parameter. A response that
 * hits the cap trips `stopReason === 'max_tokens'` and `parseClaudeJSON`
 * throws, so every value here needs ≥ ~25% headroom over the observed
 * typical response length.
 *
 * Measured on the Kate test event (909a2d6c; Christmas, 40 guests, 14 people,
 * multiple dietary requirements) — the largest real-world prompt in the
 * current dev dataset. Response-length figures below come directly from the
 * `[Claude API] AI response truncated` log lines captured prior to GTC-127.
 *
 * Raising these values has no API cost impact beyond what the model actually
 * emits — `max_tokens` is an upper bound, not a target. Claude Sonnet 4.6
 * supports up to 64K output tokens, so the ceilings here are well within the
 * platform limit.
 *
 * Source of truth for all four Moment 2 AI calls. Do not inline literal
 * `maxTokens` values at the call sites — import from here.
 */

/**
 * Per-section food generation (POST /api/events/[id]/generate-section).
 *
 * Kate event empirical output: 2900–3250 chars ≈ 950–1080 tokens, hitting the
 * old 1024 cap on ~60% of sections. Food sections for large guest counts with
 * reference items from the NZ config produce 10–15 item JSON payloads; a
 * single item runs ~200 chars. 4096 gives ~3× headroom over observed peak.
 */
export const MAX_TOKENS_SECTION_GENERATION = 4096;

/**
 * Per-section gap-fill inside finalize-plan (only fires when a section was
 * never generated individually). Same prompt shape as SECTION_GENERATION but
 * without reference items, so response is expected slightly smaller. Old cap
 * was 1024; bumped to 2048 to keep clear of the truncation boundary under the
 * same conditions that make SECTION_GENERATION need 4096.
 */
export const MAX_TOKENS_GAP_FILL = 2048;

/**
 * Dietary coverage check inside finalize-plan. Response is one structured
 * row per dietary requirement — `{ requirement, covered, flaggedItems }`.
 * For the Kate event with ~6 dietary requirements the payload is well under
 * 500 chars, but the old 512 cap sits right on the boundary for events with
 * longer flaggedItems lists. 1024 gives 2× headroom.
 */
export const MAX_TOKENS_DIETARY_COVERAGE = 1024;

/**
 * "Things to consider" suggestions inside finalize-plan. Response is a flat
 * list of 6–10 short items (`{ name, category }`), empirical output ~600–
 * 900 chars. Old 512 cap truncated roughly half the time; 1024 comfortably
 * absorbs the high end.
 */
export const MAX_TOKENS_CONSIDERATIONS = 1024;
