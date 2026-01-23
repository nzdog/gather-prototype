/**
 * Standard opt-out keywords (Twilio/TCPA compliant)
 * These are the keywords that carriers and regulations recognize
 */
const OPT_OUT_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'] as const;

/**
 * Check if a message is an opt-out request
 *
 * Rule: Trimmed, case-folded content must EXACTLY match a keyword.
 * "STOP" matches, "Stop please" does NOT.
 *
 * @param message - The raw SMS message body
 * @returns true if the message is an opt-out request
 */
export function isOptOutMessage(message: string): boolean {
  if (!message) return false;

  const normalized = message.trim().toLowerCase();
  return OPT_OUT_KEYWORDS.includes(normalized as (typeof OPT_OUT_KEYWORDS)[number]);
}

/**
 * Get the matched opt-out keyword (for logging)
 *
 * @param message - The raw SMS message body
 * @returns The matched keyword, or null if not an opt-out
 */
export function getOptOutKeyword(message: string): string | null {
  if (!message) return null;

  const normalized = message.trim().toLowerCase();

  if (OPT_OUT_KEYWORDS.includes(normalized as (typeof OPT_OUT_KEYWORDS)[number])) {
    return normalized;
  }

  return null;
}

/**
 * List of all recognized opt-out keywords
 * Useful for documentation or help text
 */
export function getOptOutKeywords(): readonly string[] {
  return OPT_OUT_KEYWORDS;
}
