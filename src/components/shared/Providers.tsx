'use client';

import { ReactNode, createContext, useEffect } from 'react';
import { ToastProvider } from '@/contexts/ToastContext';
import { browserDraftStore, sweepDrafts } from '@/lib/households/form-draft';

/**
 * [[GTC-435]] — who is signed in (the user's id only), for drafts kept in this browser. Read by
 * Moment 1's household form, which keeps a draft only while someone is signed in. null when nobody
 * is (and wherever no provider is drawn).
 */
export const ViewerIdContext = createContext<string | null>(null);

export default function Providers({
  children,
  viewerId = null,
}: {
  children: ReactNode;
  viewerId?: string | null;
}) {
  // [[GTC-435]]: on every page load, a household draft that is not the signed-in person's goes, and
  // with nobody signed in every one goes (so a sign-out clears them), as do any too old.
  useEffect(() => {
    sweepDrafts(browserDraftStore(), viewerId);
  }, [viewerId]);

  return (
    <ViewerIdContext.Provider value={viewerId}>
      <ToastProvider>{children}</ToastProvider>
    </ViewerIdContext.Provider>
  );
}
