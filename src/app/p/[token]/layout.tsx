import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { isSessionsOn } from '@/lib/sessions/switch';
import { SessionsSwitchProvider } from '@/components/sessions/SessionsSwitch';

/**
 * [[GTC-481]] A (the founder's ruling 6 on the plan, 25 Nov 2026) — the guest page is drawn in the
 * browser, so it cannot read GATHER_SESSIONS itself. This layout reads it on the server on every
 * request (`connection()` first, as the setup layout and the demo pages do, so nothing is fixed when
 * the site is built) and hands it to the page, where the guest's sessions card reads it. It adds no
 * element to the page: with the switch off the page is as before, and the card asks for nothing.
 */
export default async function GuestLayout({ children }: { children: ReactNode }) {
  await connection();
  return <SessionsSwitchProvider on={isSessionsOn()}>{children}</SessionsSwitchProvider>;
}
