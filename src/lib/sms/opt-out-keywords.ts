/**
 * [[GTC-288]] — WHICH REPLY IS A STOP, AND WHICH IS A START. The two rules, and the only place
 * either is written.
 *
 * Founder rulings, 2026-10-01, on TNZ's opt-out page (recorded in
 * docs/05_ops/tnz-inbound-and-delivery-correspondence-2026-08.md, *The opt-out page re-read*):
 *
 *   Q3 — "Exactly TNZ's": a STOP is a reply that BEGINS WITH STOP, OPTOUT, OPT OUT, OPT-OUT, UNSUB
 *        or UNSUBSCRIBE, in any case. Gather's old six (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END,
 *        QUIT, as the whole reply) are gone: "Stop please" counts, "Cancel" doesn't.
 *   Q4 — "Yes, as TNZ does": a START undoes a STOP for every host, but only when the WHOLE reply,
 *        trimmed, in any case, is START, SUBSCRIBE, UNSTOP, OPTIN, OPT IN or OPT-IN — TNZ's page
 *        does not say how it matches these, so Gather is careful.
 *
 * ⚠ "BEGINS WITH" IS TAKEN LITERALLY, AND THAT IS A RECORDED CHOICE: whether TNZ mean a whole word
 * is not on their page, so "Stopping by at 5" and "STOPPED" are STOPs here. A different answer from
 * TNZ changes `isOptOutMessage` and nothing else. Leading whitespace is trimmed and case is ignored;
 * nothing else is normalised ("OPT  OUT" with two spaces is not a STOP).
 *
 * ⚠ THE STOP RULE IS ASKED FIRST. No word is in both lists, and a reply that were both would be
 * honoured as the opt-out: the compliance direction.
 *
 * Do-Not-Touch Zone 7. The words only — this module reads and writes no opt-out state.
 */
const OPT_OUT_KEYWORDS = ['stop', 'optout', 'opt out', 'opt-out', 'unsub', 'unsubscribe'] as const;

const OPT_IN_KEYWORDS = ['start', 'subscribe', 'unstop', 'optin', 'opt in', 'opt-in'] as const;

/** Longest first, so "Unsubscribe me" names `unsubscribe` and not `unsub`. */
const OPT_OUT_LONGEST_FIRST = [...OPT_OUT_KEYWORDS].sort((a, b) => b.length - a.length);

/**
 * The opt-out keyword the reply begins with, lowercased — or null if it is not a STOP.
 *
 * @param message - The raw SMS message body
 */
export function getOptOutKeyword(message: string): string | null {
  if (!message) return null;
  const normalized = message.trimStart().toLowerCase();
  return OPT_OUT_LONGEST_FIRST.find((k) => normalized.startsWith(k)) ?? null;
}

/**
 * Is this reply a STOP? It begins with one of TNZ's six opt-out words, in any case.
 * "STOP" and "Stop please" match; "Please STOP" and "Cancel" do not.
 *
 * @param message - The raw SMS message body
 */
export function isOptOutMessage(message: string): boolean {
  return getOptOutKeyword(message) !== null;
}

/**
 * Is this reply a START? The whole reply, trimmed and in any case, is one of TNZ's six opt-in
 * words, and it is not a STOP. "start" and " START " match; "Start time?" does not.
 *
 * @param message - The raw SMS message body
 */
export function isOptInMessage(message: string): boolean {
  if (!message || isOptOutMessage(message)) return false;
  const normalized = message.trim().toLowerCase();
  return OPT_IN_KEYWORDS.includes(normalized as (typeof OPT_IN_KEYWORDS)[number]);
}

/** TNZ's six opt-out words, for documentation or help text. */
export function getOptOutKeywords(): readonly string[] {
  return OPT_OUT_KEYWORDS;
}

/** TNZ's six opt-in words, for documentation or help text. */
export function getOptInKeywords(): readonly string[] {
  return OPT_IN_KEYWORDS;
}
