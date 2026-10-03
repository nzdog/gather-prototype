/**
 * GTC-270, finding 2 — what a cron run is allowed to put on the wire.
 *
 * Each scheduler collects per-recipient failures into an `errors` array whose entries
 * carry the recipient's name: `${personName}: ${error}` in `runNudgeScheduler`,
 * `Proxy ${primaryContactName}: ${error}` for the proxy family, and
 * `Decide-by follow-up ${personName}: ${error}` in `runDecideByFollowups`. Each cron
 * route then spread the whole result into its 200 body, so a caller admitted by the
 * fail-open guard received a list of guest names for every send that had failed.
 *
 * That half of the defect was bounded by nothing. The trigger half is at least capped
 * by the send stamps and the time gates — nobody can make these routes send a message
 * that was not already due — but the response body had no such limit and could be read
 * on demand. It is the same class GTC-267 closed on the event reads.
 *
 * Names belong in the server log, where an operator can act on them. The wire body
 * carries a count, which is what a monitor actually needs.
 */
/**
 * `T extends object` rather than `T extends { errors?: string[] }`: the latter is a
 * WEAK TYPE (every property optional), and TypeScript rejects an argument with no
 * property in common with it — which is exactly `dispatchPendingWrapUpMessages`'s
 * result, the one scheduler that carries no `errors` array at all. The constraint that
 * looked more precise was the one that excluded the safe case.
 */
export function withoutRecipientNames<T extends object>(
  result: T
): Omit<T, 'errors'> & { errorCount: number } {
  const { errors, ...rest } = result as T & { errors?: string[] };
  return { ...(rest as Omit<T, 'errors'>), errorCount: errors?.length ?? 0 };
}
