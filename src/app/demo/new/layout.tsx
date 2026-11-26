import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { isDemoStartOn } from '@/lib/demo/start-switch';
import { countPageVisit } from '@/lib/page-visit';

/**
 * [[GTC-447]] — the sample's "Create Your Event" page follows the demo start switch and nothing
 * else (GTC-392 part D, founder rulings of 1 Nov 2026): open where `GATHER_DEMO_START` is exactly
 * `on`, a plain not-found everywhere else, in production and in development alike. Before GTC-447
 * it was open in development only, whatever the switch said ([[GTC-395]] item 3).
 *
 * `connection()` first: this layout is dynamic by its own word, so the switch is read at each
 * request, never once when the site is built. Deleting the variable closes the page.
 *
 * [[GTC-486]] (founder ruling E, 26 Nov 2026: "Count /demo/new as a fourth page", following the
 * new-event page's layout): one visit line for a real load, as `sample`, with no campaign tag.
 * After the switch, so a closed demo's not-found is never counted.
 */
export default async function DemoNewLayout({ children }: { children: ReactNode }) {
  await connection();
  if (!isDemoStartOn()) notFound();
  await countPageVisit('sample');
  return <>{children}</>;
}
