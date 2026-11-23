import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { isSessionsOn } from '@/lib/sessions/switch';
import { SessionsSwitchProvider } from '@/components/sessions/SessionsSwitch';

/**
 * [[GTC-479]] (founder ruling 2, 24 Nov 2026) — the setup page is drawn in the browser, so it cannot
 * read GATHER_SESSIONS itself. This layout reads it on the server on every request (`connection()`
 * first, as the demo pages read their switch, so nothing is fixed when the site is built) and hands
 * it to the page. It adds no element to the page: with the switch off the page is as before.
 */
export default async function SetupLayout({ children }: { children: ReactNode }) {
  await connection();
  return <SessionsSwitchProvider on={isSessionsOn()}>{children}</SessionsSwitchProvider>;
}
