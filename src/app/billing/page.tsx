// src/app/billing/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BillingStatus } from '@prisma/client';

interface SubscriptionDetails {
  status: BillingStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  trialEnd: string | null;
}

interface BillingStatusResponse {
  billingStatus: BillingStatus;
  subscription: SubscriptionDetails | null;
}

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  useEffect(() => {
    fetchBillingStatus();
  }, []);

  const fetchBillingStatus = async () => {
    try {
      const response = await fetch('/api/billing/status');
      if (!response.ok) {
        throw new Error('Failed to fetch billing status');
      }
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/cancel', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      // Refresh billing status
      await fetchBillingStatus();
      setShowCancelDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCanceling(false);
    }
  };

  const handleResubscribe = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
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
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  };

  const handleUpdatePaymentMethod = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create portal session');
      }

      const { url } = await response.json();

      if (!url) {
        throw new Error('No portal URL returned');
      }

      // Redirect to Stripe Customer Portal
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading billing information...</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Failed to load billing information</p>
          {error && <p className="text-sm text-gray-600 mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  const { billingStatus, subscription } = status;
  const isActive = billingStatus === 'ACTIVE' || billingStatus === 'TRIALING';
  const isCanceled = billingStatus === 'CANCELED';
  const isPastDue = billingStatus === 'PAST_DUE';
  const isFree = billingStatus === 'FREE';
  const isTrialing = billingStatus === 'TRIALING';

  // Calculate trial days remaining
  const trialDaysRemaining = subscription?.trialEnd
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Billing & Subscription
          </h1>
          <p className="text-gray-600">Manage your Gather subscription</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Current Plan Card */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isFree ? 'Free Plan' : 'Annual Plan'}
              </h2>
              <StatusBadge status={billingStatus} />
            </div>
            {!isFree && (
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-900">$69</div>
                <div className="text-sm text-gray-600">NZD / year</div>
              </div>
            )}
          </div>

          {/* Cancellation Notice */}
          {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <p className="font-semibold text-yellow-900 mb-1">
                    Subscription Ending
                  </p>
                  <p className="text-sm text-yellow-800">
                    Your subscription will end on{' '}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-NZ', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                    . You'll have access to all features until then.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Trial Notice */}
          {isTrialing && subscription?.trialEnd && (
            <div className="mb-6 p-4 bg-sage-50 border border-sage-200 rounded-md">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-sage-600 mt-0.5 mr-3 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="font-semibold text-sage-900 mb-1">Trial Active</p>
                  <p className="text-sm text-sage-800">
                    {trialDaysRemaining > 0 ? (
                      <>
                        You have{' '}
                        <span className="font-semibold">
                          {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''}
                        </span>{' '}
                        remaining in your trial. After that, you'll be charged $69 NZD/year.
                      </>
                    ) : (
                      <>Your trial ends today. You'll be charged $69 NZD/year.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Plan Details */}
          <div className="space-y-3 mb-6">
            <PlanFeature
              text="Unlimited events"
              enabled={isActive}
            />
            <PlanFeature
              text="AI-powered plan generation"
              enabled={isActive}
            />
            <PlanFeature
              text="Conflict detection"
              enabled={isActive}
            />
            <PlanFeature
              text="Team coordination tools"
              enabled={isActive}
            />
            <PlanFeature
              text="Priority support"
              enabled={isActive}
            />
          </div>

          {/* Period Information */}
          {subscription?.currentPeriodStart && subscription?.currentPeriodEnd && (
            <div className="mb-6 p-4 bg-gray-50 rounded-md">
              <div className="text-sm text-gray-600">
                <div className="flex justify-between mb-2">
                  <span>Current period:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(subscription.currentPeriodStart).toLocaleDateString('en-NZ')} -{' '}
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-NZ')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {isFree && (
              <button
                onClick={() => router.push('/billing/upgrade')}
                className="flex-1 bg-sage-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-sage-700 transition-colors"
              >
                Upgrade to Annual Plan
              </button>
            )}

            {isCanceled && (
              <button
                onClick={handleResubscribe}
                className="flex-1 bg-sage-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-sage-700 transition-colors"
              >
                Resubscribe
              </button>
            )}

            {isPastDue && (
              <button
                onClick={handleUpdatePaymentMethod}
                className="flex-1 bg-sage-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-sage-700 transition-colors"
              >
                Update Payment Method
              </button>
            )}

            {isActive && !subscription?.cancelAtPeriodEnd && (
              <>
                <button
                  onClick={handleUpdatePaymentMethod}
                  className="flex-1 bg-sage-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-sage-700 transition-colors"
                >
                  Update Payment Method
                </button>
                <button
                  onClick={() => setShowCancelDialog(true)}
                  className="flex-1 border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel Subscription
                </button>
              </>
            )}

            {subscription?.cancelAtPeriodEnd && (
              <button
                onClick={handleResubscribe}
                className="flex-1 bg-sage-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-sage-700 transition-colors"
              >
                Resubscribe
              </button>
            )}
          </div>
        </div>

        {/* Back Button */}
        <div className="text-center">
          <button
            onClick={() => router.push('/')}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ← Return Home
          </button>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Cancel Subscription?
            </h3>
            <p className="text-gray-600 mb-6">
              Your subscription will remain active until the end of your current billing
              period{' '}
              {subscription?.currentPeriodEnd && (
                <>
                  on{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-NZ', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </>
              )}
              . After that, you'll be moved to the free plan with 1 event per year.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelDialog(false)}
                disabled={canceling}
                className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={canceling}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {canceling ? 'Canceling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: BillingStatus }) {
  const getBadgeColor = (status: BillingStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'TRIALING':
        return 'bg-sage-100 text-sage-800';
      case 'PAST_DUE':
        return 'bg-yellow-100 text-yellow-800';
      case 'CANCELED':
        return 'bg-red-100 text-red-800';
      case 'FREE':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: BillingStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'Active';
      case 'TRIALING':
        return 'Trial';
      case 'PAST_DUE':
        return 'Past Due';
      case 'CANCELED':
        return 'Canceled';
      case 'FREE':
        return 'Free';
      default:
        return status;
    }
  };

  return (
    <span
      className={`inline-block mt-1 px-3 py-1 text-xs font-semibold rounded-full ${getBadgeColor(
        status
      )}`}
    >
      {getStatusText(status)}
    </span>
  );
}

function PlanFeature({ text, enabled }: { text: string; enabled: boolean }) {
  return (
    <div className="flex items-center">
      <svg
        className={`w-5 h-5 mr-3 flex-shrink-0 ${
          enabled ? 'text-green-600' : 'text-gray-400'
        }`}
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
      <span className={enabled ? 'text-gray-700' : 'text-gray-400'}>{text}</span>
    </div>
  );
}
