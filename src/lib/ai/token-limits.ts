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
 *
 * GTC-142: bumped from 1024 → 4096. Post-GTC-133 universal-opt-in scale
 * surfaced 1024 truncation on a 17-person / 117-item Christmas event where
 * the dietary coverage payload reached ~3083 chars (≈1024 tokens of dense
 * JSON). flaggedItems arrays scale with item count × requirement count, so
 * the old 1024 cap is too tight for plans of realistic size. 4096 matches
 * the SECTION_GENERATION precedent and gives ~4× headroom over observed
 * peak. `max_tokens` is an upper bound — no API cost penalty.
 */
export const MAX_TOKENS_DIETARY_COVERAGE = 4096;

/**
 * "Things to consider" suggestions inside finalize-plan. Response is a flat
 * list of 6–10 short items (`{ name, category }`), empirical output ~600–
 * 900 chars.
 *
 * GTC-142: bumped from 1024 → 2048 prophylactically. Same root cause class
 * as the dietary-coverage truncation (1024 cap on outputs that scale with
 * event size). Current empirical peak is ~900 chars so this is headroom,
 * not a fix for an observed truncation.
 */
export const MAX_TOKENS_CONSIDERATIONS = 2048;
