/**
 * [[GTC-375]] — the guest page's footer, when nobody is there to name.
 *
 * "Questions? Contact your coordinator" stood alone for every guest whose team has no coordinator,
 * and most have none: Moment 2's generated teams never get one, and most guests are on no team. The
 * founder put the fix in GTC-375 at GTC-374's commit (*"The footer needs new words, for example
 * naming the host"*); the plan's W6 and W7 were ruled 2026-10-09, for every guest page with nobody
 * named (Q14). With a coordinator the footer stays as it was.
 *
 * CLIENT-SAFE: no imports. `hostFirstName` is the page's own (`firstNameOf` on the route), which is
 * empty when no name is stored.
 */
export function askHostLine(hostFirstName: string): string {
  const first = hostFirstName.trim();
  return first ? `Questions? Ask ${first}.` : 'Questions? Ask the host.';
}
