import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

/**
 * [[GTC-395]] item 3 — the sample's "Create Your Event" page is development-only, exactly as the
 * "Try it yourself" button on /demo is (GTC-392 Q5, until part D): anywhere else a plain not-found.
 */
export default function DemoNewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <>{children}</>;
}
