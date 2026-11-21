'use client';

import { createContext, type ReactNode } from 'react';

/**
 * [[GTC-468]] — IS THE PERSON LOOKING AT THIS A SAMPLE VISITOR? True only for a throwaway sample
 * account (its address ends demo-copy.invalid); false for everyone else, and wherever no provider is
 * drawn. The root layout sets it from the signed-in account's address, so no page has to ask. Read by
 * the contacts page, which shows a sample visitor a short notice in place of the contacts screen.
 * No database and no request: the layout's own answer, passed down.
 */
export const SampleViewerContext = createContext<boolean>(false);

export function SampleViewer({ isSample, children }: { isSample: boolean; children: ReactNode }) {
  return <SampleViewerContext.Provider value={isSample}>{children}</SampleViewerContext.Provider>;
}
