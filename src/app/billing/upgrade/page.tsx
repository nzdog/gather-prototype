// src/app/billing/upgrade/page.tsx
'use client';

import { useRouter } from 'next/navigation';

/*
 * [[GTC-384]] (Q3, ruled 2026-10-14): this page sold the yearly plan at $69 NZD a year. Gather is
 * $25 per event with no subscription, so the price, the words that sold the plan and the button that
 * went with them were taken off, and nothing new was written in their place. The way back is what
 * is left.
 */
export default function UpgradePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center">
          <button
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Go back
          </button>
        </div>
      </div>
    </div>
  );
}
