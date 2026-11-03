import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { isDemoStartOn } from '@/lib/demo/start-switch';

/**
 * [[GTC-447]] — the sample's "Create Your Event" page follows the demo start switch and nothing
 * else (GTC-392 part D, founder rulings of 1 Nov 2026): open where `GATHER_DEMO_START` is exactly
 * `on`, a plain not-found everywhere else, in production and in development alike. Before GTC-447
 * it was open in development only, whatever the switch said ([[GTC-395]] item 3).
 *
 * `connection()` first: this layout is dynamic by its own word, so the switch is read at each
 * request, never once when the site is built. Deleting the variable closes the page.
 */
export default async function DemoNewLayout({ children }: { children: ReactNode }) {
  await connection();
  if (!isDemoStartOn()) notFound();
  return <>{children}</>;
}
