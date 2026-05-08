/**
 * Token limits for Moment 2 AI calls.
 *
 * These caps pass to the Anthropic `max_tokens` parameter. A response that
 * hits the cap trips `stopReason === 'max_tokens'` and `parseClaudeJSON`
 * throws, so the value here needs ≥ ~25% headroom over the observed typical
 * response length.
 *
 * Raising this has no API cost impact beyond what the model actually emits —
 * `max_tokens` is an upper bound, not a target. Claude Sonnet 4.6 supports
 * up to 64K output tokens, so this ceiling is well within the platform
 * limit.
 *
 * Source of truth for the Moment 2 finalize-plan call. Do not inline literal
 * `maxTokens` values at the call site — import from here.
 */

/**
 * GTC-145 single-call full-plan generation (POST /api/events/[id]/finalize-plan).
 *
 * One Claude call produces the entire Moment 2 plan: every engaged section's
 * items, dietary coverage rows, and things-to-consider. Response size scales
 * with the number of engaged categories × items × per-item JSON overhead. For
 * a 17-person Christmas with 9 default categories engaged, an experimentally
 * coordinated plan emits roughly 25–35 items at ~200 chars each, plus
 * coverage and considerations payloads — together comfortably under 16K
 * tokens. Claude Sonnet 4.6 supports up to 64K output tokens, so this gives
 * generous headroom.
 */
export const MAX_TOKENS_FULL_PLAN = 16384;
