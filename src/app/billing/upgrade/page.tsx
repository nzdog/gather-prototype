// src/app/billing/upgrade/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();

      if (!url) {
        throw new Error('No checkout URL returned');
      }

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Upgrade to Gather Annual
          </h1>
          <p className="text-xl text-gray-600">
            Unlock unlimited events and premium features
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="text-center mb-8">
            <div className="inline-block">
              <span className="text-5xl font-bold text-gray-900">$69</span>
              <span className="text-gray-600 ml-2">NZD / year</span>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <Feature text="Unlimited events" />
            <Feature text="AI-powered plan generation" />
            <Feature text="Conflict detection" />
            <Feature text="Team coordination tools" />
            <Feature text="Magic link sharing" />
            <Feature text="Email notifications" />
            <Feature text="Priority support" />
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-sage-600 text-white px-6 py-4 rounded-lg text-lg font-semibold hover:bg-sage-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Redirecting to checkout...' : 'Upgrade Now'}
          </button>

          <p className="text-center text-sm text-gray-500 mt-4">
            Secure checkout powered by Stripe
          </p>
        </div>

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

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center">
      <svg
        className="w-5 h-5 text-green-600 mr-3 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
      <span className="text-gray-700">{text}</span>
    </div>
  );
}
