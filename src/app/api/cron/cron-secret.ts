/**
 * GTC-270 — the cron shared secret, as one definition.
 *
 * WHY THIS IS A PURE PREDICATE AND NOT A HELPER THAT RETURNS THE REFUSAL.
 *
 * The `if` stays in each route file deliberately, and the reason was measured rather
 * than argued. GTC-268's route scanner (`collectSharedSecret` in
 * `tests/security-route-scan.ts`) classifies a handler from the `if` CONDITIONS inside
 * it. It follows local helpers within a file and does NOT follow imports. A helper
 * that swallowed the whole check — `const denied = requireCronSecret(req); if (denied)
 * return denied;` — was run against the scanner and reports all six cron handlers as
 * "no credential of any kind": a worse verdict than the fail-open one it replaced, and
 * it would have driven this ticket's own headline metric to zero for the wrong reason.
 *
 * So the split is: the DECISION lives here, once, and is assertable with no server, no
 * database, no provider and no clock. The REFUSAL stays in the route, where the
 * scanner can still read it.
 *
 * The precedent for a pure exported predicate is `isNudgeRunHealthy` in
 * `src/lib/sms/nudge-scheduler.ts`, which exists for the same reason stated there:
 * configuration captured at module scope can only ever demonstrate one quadrant per
 * process, so the property has to be testable without the process.
 */

/**
 * Is a usable secret configured at all?
 *
 * An empty string is NOT one. `CRON_SECRET=""` in a deployment's environment is the
 * same misconfiguration as omitting the line, and it must not read as configured.
 */
export function isCronSecretConfigured(configured: string | undefined): boolean {
  return typeof configured === 'string' && configured.length > 0;
}

/**
 * Does `provided` authenticate against `configured`?
 *
 * FAILS CLOSED ON AN UNCONFIGURED SECRET, which is the whole of GTC-270. The check
 * this replaces was `if (CRON_SECRET && providedSecret !== CRON_SECRET)`: with the
 * variable unset the left operand is falsy, the refusal branch is unreachable, and
 * three SMS sender routes answer 200 to anyone. A missing secret is a
 * misconfiguration, and the fail-closed direction for a misconfiguration is nobody,
 * not everybody.
 *
 * The configured check comes FIRST, and that ordering is load-bearing rather than
 * tidy: without it an empty configured secret is satisfied by an empty credential,
 * because `'' === ''`. That is the same hole one layer down, and
 * `tests/security-validation.ts` suite 12 asserts it directly.
 */
export function cronSecretAccepted(
  configured: string | undefined,
  provided: string | null | undefined
): boolean {
  if (!isCronSecretConfigured(configured)) return false;
  return provided === configured;
}
