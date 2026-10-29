/**
 * [[GTC-425]] — THE DEMO START SWITCH. The copy-start shape of `POST /api/demo/session` starts a
 * visitor's sample copy only where this says it is on.
 *
 * Founder ruling, 29 Oct 2026: the copy-start route is closed behind a switch named
 * GATHER_DEMO_START; only the exact value `on` opens it; it is read on every request; it is off by
 * default; a closed route answers 404. Production does not set it until the founder turns the
 * demo on at launch. This Mac's `.env.local` sets it, so the demo and its suites work here.
 *
 * As `src/lib/live-sends.ts`: ONLY THE EXACT STRING `on` IS ON (unset, empty, `true`, `1`, `ON`
 * are all off, so a value typed wrong stays closed), and it is READ AT EVERY CALL, never captured
 * at module scope. The old no-body shape of the route (GTC-015) does not read it.
 */

export const DEMO_START_VAR = 'GATHER_DEMO_START';

export function isDemoStartOn(): boolean {
  return process.env[DEMO_START_VAR] === 'on';
}
