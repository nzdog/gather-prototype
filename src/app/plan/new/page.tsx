'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';

type PageState = 'form' | 'creating' | 'canceled' | 'error' | 'emailed';

// Sanitise pre-populated query params to prevent XSS
function sanitiseParam(value: string | null): string {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'`]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, 200);
}

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
    hostName: '',
    email: '',
    phone: '',
  });
  /*
   * GTC-280 — the `ref` referral token is NOT captured any more, and that is a
   * deletion of dead code rather than a loss of a feature.
   *
   * Its only consumer was the `gather_prefilled_contact` write in
   * `startCheckout`, now deleted, which
   * nothing ever read. So GTC-FM2's wrap-up conversion attribution has never
   * landed anywhere since April; parking the value in a second place nobody
   * reads would not change that. Recorded on GTC-280 as found-in-passing so
   * that wiring it up properly is a decision someone takes on purpose.
   */
  // GTC-280: what the server did instead of logging her in.
  const [handoff, setHandoff] = useState<{
    eventName: string;
    sentTo: string | null;
    delivered: boolean | null;
    signedInAs: string | null;
  } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showExpiredNotice, setShowExpiredNotice] = useState(false);

  // Handle pre-populated params from wrap-up links and expired notice
  useEffect(() => {
    const expired = searchParams.get('expired');
    if (expired === 'true') {
      setShowExpiredNotice(true);
    }

    const refName = sanitiseParam(searchParams.get('name'));
    const refEmail = sanitiseParam(searchParams.get('email'));
    const refPhone = sanitiseParam(searchParams.get('phone'));
    if (refName || refEmail || refPhone) {
      setFormData((prev) => ({
        ...prev,
        hostName: refName,
        email: refEmail,
        phone: refPhone,
      }));
      setShowWelcome(!!refName);
    }
  }, [searchParams]);

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

      /*
       * GTC-280 — the payment no longer logs anyone in, so the return splits.
       *
       * If she was ALREADY signed in as the paying address, nothing has
       * changed for her: straight into setup, no extra step, no email. That is
       * the common second-event path, because the "New Event" buttons live on
       * `/plan/events`, which she can only reach signed in.
       *
       * Otherwise the server has attached the event to the paid address and
       * emailed a sign-in link there. She is NOT locked out — the Event and the
       * EventRole are already hers and `/auth/signin` is a second door to the
       * same place — but she cannot be dropped into the dashboard, because
       * handing her a session on the strength of a receipt is the bug.
       */
      if (result.alreadySignedIn) {
        // Still a full page load so the server layout picks up her session;
        // `replace` rather than `assign` so Back does not return to the consumed
        // creation form (its sessionStorage draft is cleared just above).
        window.location.replace(`/plan/${result.event.id}/setup`);
        return;
      }

      setHandoff({
        eventName: result.event.name,
        sentTo: result.signInEmailSentTo ?? null,
        delivered: result.signInEmailDelivered ?? null,
        signedInAs: result.signedInAs ?? null,
      });
      setPageState('emailed');
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

    /*
     * GTC-280 — the address she typed is the address that is used.
     *
     * `gather_prefilled_contact` used to be written here "for use after
     * payment". Nothing ever read it: one `setItem` in the tree and no
     * `getItem`, from GTC-FM2 in April through GTC-047 in the same file, which
     * preserved compatibility with a reader that did not exist. So she typed an
     * address into Gather, a second form at Stripe decided who she was, and the
     * two could differ. The key is deleted rather than repointed — a
     * browser-side parking spot for an identity value is what let this drift
     * unnoticed for five months, and it is not a channel the server can trust
     * anyway. The value travels in the request instead.
     */
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        email: data.email,
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
      // GTC-280: the email is the identity the event binds to, so it can no
      // longer be the one optional field on the form.
      if (!formData.email) throw new Error('Email is required');
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

  /*
   * GTC-280 — payment received, and the link is the way in.
   *
   * The founder's constraint on this whole ticket was that a host who
   * legitimately pays for her second event must still get in. She does: the
   * Event and the EventRole are already written and attached to her User
   * before this screen renders. What is withheld is a shortcut, never the
   * event — and /auth/signin is a second door to exactly the same place, which
   * is why the failure case below is a nuisance rather than a lockout.
   */
  if (pageState === 'emailed' && handoff) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment received</h2>
            <p className="text-gray-600 mb-6">
              Your event &ldquo;{handoff.eventName}&rdquo; is ready.
            </p>

            {handoff.signedInAs && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-amber-800 text-sm">
                  You&rsquo;re signed in as {handoff.signedInAs} but you paid as {handoff.sentTo}.
                  Your event is attached to the address you paid with, and we&rsquo;ve sent the
                  sign-in link there. Nothing has changed about the account you&rsquo;re signed in
                  to.
                </p>
              </div>
            )}

            {handoff.delivered === false ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800 font-medium">We couldn&rsquo;t send the sign-in link</p>
                <p className="text-red-700 text-sm mt-1">
                  Your payment went through and the event is yours — only the email failed. Sign in
                  with {handoff.sentTo} and it will be waiting for you.
                </p>
              </div>
            ) : (
              <p className="text-gray-700 mb-6">
                We&rsquo;ve sent a sign-in link to <strong>{handoff.sentTo}</strong>. Open it and
                you&rsquo;ll land straight in your event.
              </p>
            )}

            <a
              href="/auth/signin"
              className="block w-full text-center px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark"
            >
              Go to sign-in
            </a>
            <p className="text-sm text-gray-500 text-center mt-4">
              Wrong address? Your payment is safe — contact support and we&rsquo;ll move the event
              for you. We won&rsquo;t rebind it automatically.
            </p>
          </div>
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

        {/* Expired Link Notice */}
        {showExpiredNotice && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 mb-6 flex items-start justify-between">
            <div>
              <p className="text-amber-800 font-medium">This link has expired</p>
              <p className="text-amber-700 text-sm mt-1">
                The pre-filled link you followed is no longer active, but you can still create an
                event below.
              </p>
            </div>
            <button
              onClick={() => setShowExpiredNotice(false)}
              className="text-amber-600 hover:text-amber-800 text-lg leading-none ml-4"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        )}

        {/* Subtle welcome for referred users */}
        {showWelcome && formData.hostName && (
          <p className="text-green-700 text-sm mb-4">
            Welcome back, {formData.hostName} — your details are pre-filled below.
          </p>
        )}

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

          {/* Your Name */}
          <div>
            <label htmlFor="hostName" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              id="hostName"
              name="hostName"
              value={formData.hostName}
              onChange={handleChange}
              placeholder="e.g., Sarah Richardson"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-lg"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="e.g., sarah@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-lg"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="e.g., 021 123 4567"
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
