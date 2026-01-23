'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Clock, Eye, Send, AlertCircle, RefreshCw } from 'lucide-react';

interface PersonStatus {
  id: string;
  name: string;
  status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
  hasPhone: boolean;
  smsOptedOut: boolean;
}

interface InviteStatusData {
  eventStatus: string;
  inviteSendConfirmedAt: string | null;
  hasUnsentPeople: boolean;
  counts: {
    total: number;
    notSent: number;
    sent: number;
    opened: number;
    responded: number;
    withPhone: number;
  };
  people: PersonStatus[];
}

interface Props {
  eventId: string;
}

export function InviteStatusSection({ eventId }: Props) {
  const [data, setData] = useState<InviteStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/invite-status`);
      if (res.ok) {
        setData(await res.json());
        setError(null);
      } else {
        setError('Failed to load invite status');
      }
    } catch (e) {
      setError('Failed to load invite status');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchStatus();

    // Poll every 30 seconds for real-time updates
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleConfirmSent = async () => {
    setConfirming(true);
    setError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/confirm-invites-sent`, {
        method: 'POST',
      });

      if (res.ok) {
        await fetchStatus();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to confirm');
      }
    } catch (e) {
      setError('Failed to confirm invites sent');
    } finally {
      setConfirming(false);
    }
  };

  // Don't render if not in CONFIRMING status
  if (data && data.eventStatus !== 'CONFIRMING') {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <p className="text-red-600">{error}</p>
        <button onClick={fetchStatus} className="mt-2 text-sm text-sage-600 hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { counts, hasUnsentPeople, inviteSendConfirmedAt } = data;
  const responseRate = counts.total > 0 ? Math.round((counts.responded / counts.total) * 100) : 0;

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Invite Status</h3>
        <button onClick={fetchStatus} className="text-gray-400 hover:text-gray-600" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            {counts.responded} of {counts.total} responded
          </span>
          <span className="font-medium">{responseRate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${responseRate}%` }}
          />
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <StatusCard
          icon={<Clock className="w-4 h-4" />}
          count={counts.notSent}
          label="Not sent"
          bgColor="bg-gray-50"
          textColor="text-gray-600"
        />
        <StatusCard
          icon={<Send className="w-4 h-4" />}
          count={counts.sent}
          label="Sent"
          bgColor="bg-yellow-50"
          textColor="text-yellow-700"
        />
        <StatusCard
          icon={<Eye className="w-4 h-4" />}
          count={counts.opened}
          label="Opened"
          bgColor="bg-blue-50"
          textColor="text-blue-700"
        />
        <StatusCard
          icon={<CheckCircle className="w-4 h-4" />}
          count={counts.responded}
          label="Responded"
          bgColor="bg-green-50"
          textColor="text-green-700"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Confirm button - show if there are unsent people */}
      {hasUnsentPeople && (
        <div className="border-t pt-4">
          <p className="text-sm text-gray-600 mb-3">
            {counts.notSent === 1
              ? "1 person hasn't been marked as sent yet."
              : `${counts.notSent} people haven't been marked as sent yet.`}{' '}
            After sharing the invite links, confirm below to start tracking.
          </p>
          <button
            onClick={handleConfirmSent}
            disabled={confirming}
            className="w-full py-2.5 px-4 bg-sage-600 text-white rounded-lg hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {confirming ? 'Confirming...' : "I've sent the invites"}
          </button>
        </div>
      )}

      {/* Last confirmed timestamp */}
      {inviteSendConfirmedAt && (
        <p className="text-xs text-gray-500 pt-2 border-t">
          Last confirmed: {new Date(inviteSendConfirmedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function StatusCard({
  icon,
  count,
  label,
  bgColor,
  textColor,
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  bgColor: string;
  textColor: string;
}) {
  return (
    <div className={`p-2 rounded ${bgColor}`}>
      <div className={`flex items-center justify-center gap-1 ${textColor}`}>
        {icon}
        <span className="font-semibold">{count}</span>
      </div>
      <div className={`text-xs ${textColor} opacity-75`}>{label}</div>
    </div>
  );
}
