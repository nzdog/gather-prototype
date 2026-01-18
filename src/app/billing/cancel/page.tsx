// src/app/billing/cancel/page.tsx
'use client';

import Link from 'next/link';

export default function BillingCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Checkout Cancelled
        </h1>

        <p className="text-gray-600 mb-8">
          You have cancelled the checkout process. No charges were made to your account.
        </p>

        <div className="space-y-3">
          <Link
            href="/billing/upgrade"
            className="block w-full bg-sage-600 text-white px-4 py-2 rounded-md hover:bg-sage-700 transition-colors"
          >
            Try Again
          </Link>
          <Link
            href="/"
            className="block w-full text-gray-600 hover:text-gray-900 transition-colors"
          >
            Return Home
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Need help? <a href="mailto:support@gather.app" className="text-sage-600 hover:underline">Contact support</a>
          </p>
        </div>
      </div>
    </div>
  );
}
