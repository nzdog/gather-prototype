// src/app/billing/success/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!sessionId) {
      router.push('/');
      return;
    }

    // Countdown timer for auto-redirect
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/plan/events');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionId, router]);

  if (!sessionId) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-green-600"
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
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Subscription Successful!
        </h1>

        <p className="text-gray-600 mb-6">
          Thank you for subscribing to Gather. Your subscription is now active and you have full access to all features.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600">
            Session ID: <span className="font-mono text-xs">{sessionId}</span>
          </p>
        </div>

        <p className="text-sm text-gray-500 mb-6">
          Redirecting to your events in {countdown} seconds...
        </p>

        <div className="space-y-3">
          <Link
            href="/plan/events"
            className="block w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Events
          </Link>
          <Link
            href="/"
            className="block w-full text-gray-600 hover:text-gray-900 transition-colors"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
