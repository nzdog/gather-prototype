/**
 * [[GTC-478]] — THE SESSIONS SWITCH. The session routes answer, and "invites only" keeps an
 * event's sessions, only where this says it is on. Later tickets read it to show the session
 * screens.
 *
 * Founder ruling D, 23 Nov 2026: GATHER_SESSIONS; only the exact value `on` counts; while it is off
 * the new routes refuse, so production behaves exactly as today; it is never set in `.env` or
 * `.env.local`. To turn it on at the release: add GATHER_SESSIONS=on as a variable on the Railway
 * service and deploy (staging first). Delete it to turn it off.
 *
 * As `src/lib/live-sends.ts` and `src/lib/demo/start-switch.ts`: ONLY THE EXACT STRING `on` IS ON
 * (unset, empty, `true`, `1`, `ON` are all off, so a value typed wrong stays off), and it is READ
 * AT EVERY CALL, never captured at module scope.
 *
 * Imports nothing, on purpose: it can be read from any file, server or not.
 */

export const SESSIONS_VAR = 'GATHER_SESSIONS';

export function isSessionsOn(): boolean {
  return process.env[SESSIONS_VAR] === 'on';
}
