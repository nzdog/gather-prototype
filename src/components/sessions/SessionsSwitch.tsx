'use client';

/**
 * [[GTC-479]] (founder ruling 2, 24 Nov 2026) — the sessions switch, handed from the server to the
 * setup page. `src/app/plan/[eventId]/setup/layout.tsx` reads `isSessionsOn()` on every request and
 * gives the answer here; the session screens read it with `useSessionsOn()`. Anything rendered
 * without the provider (a test, another page) reads OFF, so with the switch off nothing changes.
 * The provider draws no element of its own.
 */

import { createContext, useContext, type ReactNode } from 'react';

const SessionsSwitchContext = createContext(false);

export function SessionsSwitchProvider({ on, children }: { on: boolean; children: ReactNode }) {
  return <SessionsSwitchContext.Provider value={on}>{children}</SessionsSwitchContext.Provider>;
}

export function useSessionsOn(): boolean {
  return useContext(SessionsSwitchContext);
}
