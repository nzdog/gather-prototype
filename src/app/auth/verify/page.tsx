'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';

type ErrorType = 'invalid' | 'expired' | 'used' | 'unknown';

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<ErrorType | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const token = searchParams.get('token');
    const returnUrl = searchParams.get('returnUrl') || '/plan/events';
    const personId = searchParams.get('personId');

    if (!token) {
      setError('invalid');
      setIsVerifying(false);
      return;
    }

    // Call the verification API
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, returnUrl, personId }),
    })
      .then(async (res) => {
        const data = await res.json();

        if (data.success) {
          // Redirect on success
          router.push(data.redirectUrl);
        } else {
          setError(data.error || 'unknown');
          setIsVerifying(false);
        }
      })
      .catch(() => {
        setError('unknown');
        setIsVerifying(false);
      });
  }, [searchParams, router]);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="flex justify-center mb-8">
            <Image
              src="/brand/gather_symbol_60px_all-sage.svg"
              alt="Gather"
              width={60}
              height={60}
              className="h-16 w-16"
            />
          </div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Verifying your link...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <ErrorDisplay error={error} />
        </div>
      </div>
    );
  }

  return null;
}

function ErrorDisplay({ error }: { error: ErrorType }) {
  const errorMessages = {
    invalid: {
      title: 'Invalid Link',
      message: 'Invalid or expired link. Request a new one.',
    },
    expired: {
      title: 'Link Expired',
      message: 'This link has expired. Request a new one.',
    },
    used: {
      title: 'Link Already Used',
      message: 'This link has already been used. Request a new one.',
    },
    unknown: {
      title: 'Something Went Wrong',
      message: 'Please try requesting a new link.',
    },
  };

  const { title, message } = errorMessages[error];

  return (
    <div className="text-center">
      <div className="flex justify-center mb-8">
        <Image
          src="/brand/gather_symbol_60px_all-sage.svg"
          alt="Gather"
          width={60}
          height={60}
          className="h-16 w-16"
        />
      </div>
      <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
        <svg
          className="h-6 w-6 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <div className="mt-6">
        <a
          href="/auth/signin"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Request New Link
        </a>
      </div>
    </div>
  );
}
