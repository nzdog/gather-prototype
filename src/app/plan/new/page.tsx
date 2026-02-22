'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';

type PageState = 'form' | 'creating' | 'canceled' | 'error';

export default function NewPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const creatingRef = useRef(false);
  const [pageState, setPageState] = useState<PageState>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
  });

  // Restore form data on plain page load (e.g. returning from sign-in redirect)
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const canceled = searchParams.get('canceled');
    if (!sessionId && !canceled) {
      const saved = sessionStorage.getItem('gather_new_event');
      if (saved) {
        try {
          setFormData(JSON.parse(saved));
        } catch {}
      }
    }
  }, []);

  // Handle Stripe return flow
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const canceled = searchParams.get('canceled');

    if (canceled === 'true') {
      setPageState('canceled');
      // Restore form values from sessionStorage
      const saved = sessionStorage.getItem('gather_new_event');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          setFormData(data);
        } catch (err) {
          console.error('Failed to restore form data:', err);
        }
      }
      return;
    }

    if (sessionId && !creatingRef.current) {
      // User returned from Stripe - create event (guard prevents double-invoke in dev/Strict Mode)
      creatingRef.current = true;
      setPageState('creating');
      createEventWithPayment(sessionId);
    }
  }, [searchParams]);

  const createEventWithPayment = async (sessionId: string) => {
    try {
      // Call event creation API — email and event data come from the Stripe session
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stripeSessionId: sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Handle specific error cases
        if (response.status === 402) {
          throw new Error("Payment wasn't completed. Please try again.");
        } else if (response.status === 409) {
          // Payment already used
          setError('This payment was already used to create an event.');
          setPageState('error');

          // Provide link to events list
          setTimeout(() => {
            router.push('/');
          }, 3000);
          return;
        }

        throw new Error(errorData.error || 'Failed to create event');
      }

      const result = await response.json();

      // Clear sessionStorage
      sessionStorage.removeItem('gather_new_event');

      // Redirect to event page, opening the setup wizard automatically
      // Use full page load so the server layout picks up the new session cookie
      window.location.href = `/plan/${result.event.id}?setup=true`;
    } catch (err) {
      console.error('Error creating event:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again or contact support.'
      );
      setPageState('error');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Core checkout logic — no auth required
  const startCheckout = async (data: typeof formData) => {
    // Save form data so we can restore it if payment is canceled
    sessionStorage.setItem('gather_new_event', JSON.stringify(data));

    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const result = await response.json();
    window.location.href = result.checkoutUrl;
  };

  const handlePayAndCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.name) throw new Error('Event name is required');
      if (!formData.startDate) throw new Error('Start date is required');
      if (!formData.endDate) throw new Error('End date is required');

      await startCheckout(formData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Connection failed. Check your internet and try again.'
      );
      setLoading(false);
    }
  };

  const handleTryAgain = () => {
    // Clear URL params and show form
    router.push('/plan/new');
    setPageState('form');
    setError('');
  };

  // Loading state while creating event
  if (pageState === 'creating') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-gray-600">Creating your event...</p>
        </div>
      </div>
    );
  }

  // Payment canceled state
  if (pageState === 'canceled') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Payment canceled</h2>
            <p className="text-gray-600 mb-6">
              No charge was made. You can try again whenever you're ready.
            </p>
            <button
              onClick={handleTryAgain}
              className="w-full px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={handleTryAgain}
                className="flex-1 px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark"
              >
                Try Again
              </button>
              <button
                onClick={() => window.open('mailto:support@gather.app', '_blank')}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
              >
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main form state
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-accent hover:text-accent-dark mb-4 flex items-center gap-2"
          >
            ← Back to Home
          </button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Create Your Event</h1>
          <p className="text-gray-600">Enter your event details and pay $12 to get started.</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handlePayAndCreate} className="bg-white rounded-lg shadow-md p-8 space-y-6">
          {/* Event Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Event Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Richardson Family BBQ"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-lg"
            />
          </div>

          {/* Date Range */}
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline w-4 h-4 mr-1" />
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              required
              value={formData.startDate}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-lg"
            />
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="inline w-4 h-4 mr-1" />
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              name="endDate"
              required
              value={formData.endDate}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-lg"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-4 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {loading ? 'Redirecting to payment...' : 'Pay & Create — $12'}
          </button>

          <p className="text-sm text-gray-500 text-center">
            You'll be redirected to Stripe to complete payment. After payment, your event will be
            created automatically.
          </p>
        </form>
      </div>
    </div>
  );
}
