import type { ReactNode } from 'react';
import { countPageVisit } from '@/lib/page-visit';

/**
 * [[GTC-466]] — the new-event page (/plan/new) is drawn in the browser and cannot see the request,
 * so this layout writes the page's one visit line on the server and shows the page unchanged. It
 * touches no payment code (the founder's word, 19 Nov 2026) and reads no query: this page carries
 * no campaign tag.
 */
export default async function NewEventLayout({ children }: { children: ReactNode }) {
  await countPageVisit('new');
  return <>{children}</>;
}
