'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  Clock,
  Eye,
  Send,
  AlertCircle,
  RefreshCw,
  Phone,
  PhoneOff,
  Ban,
} from 'lucide-react';

interface PersonStatus {
  id: string;
  name: string;
  status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
  hasPhone: boolean;
  smsOptedOut: boolean;
  nudge24hSentAt?: string | null;
  nudge48hSentAt?: string | null;
  nudgeStatus?: string;
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
  smsSummary?: {
    withPhone: number;
    withoutPhone: number;
    optedOut: number;
    canReceive: number;
  };
  nudgeSummary?: {
    sent24h: number;
    sent48h: number;
    pending24h: number;
    pending48h: number;
  };
  people: PersonStatus[];
}

interface Props {
  eventId: string;
  onPersonClick?: (personId: string) => void;
  onDataUpdate?: (data: InviteStatusData) => void;
}

export function InviteStatusSection({ eventId, onPersonClick, onDataUpdate }: Props) {
  const [data, setData] = useState<InviteStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllPeople, setShowAllPeople] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/invite-status`);
      if (res.ok) {
        const statusData = await res.json();
        setData(statusData);
        setError(null);
        // Notify parent of data update
        if (onDataUpdate) {
          onDataUpdate(statusData);
        }
      } else {
        setError('Failed to load invite status');
      }
    } catch (e) {
      setError('Failed to load invite status');
    } finally {
      setLoading(false);
    }
  }, [eventId, onDataUpdate]);

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

      {/* SMS summary */}
      {data.smsSummary && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">SMS Reminders</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-400" />
              <span>{data.smsSummary.withPhone} with phone</span>
            </div>
            <div className="flex items-center gap-2">
              <PhoneOff className="w-4 h-4 text-gray-400" />
              <span>{data.smsSummary.withoutPhone} without</span>
            </div>
            {data.smsSummary.optedOut > 0 && (
              <div className="flex items-center gap-2 col-span-2 text-amber-600">
                <Ban className="w-4 h-4" />
                <span>{data.smsSummary.optedOut} opted out</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Auto-reminders will be sent to {data.smsSummary.canReceive} people
          </p>
        </div>
      )}

      {/* Nudge summary */}
      {data.nudgeSummary && (
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Auto-Reminders</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">24h reminders sent</span>
              <span className="font-medium">{data.nudgeSummary.sent24h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">48h reminders sent</span>
              <span className="font-medium">{data.nudgeSummary.sent48h}</span>
            </div>
            {(data.nudgeSummary.pending24h > 0 || data.nudgeSummary.pending48h > 0) && (
              <p className="text-xs text-gray-500 mt-2">
                {data.nudgeSummary.pending24h > 0 && (
                  <span>
                    {data.nudgeSummary.pending24h} pending 24h reminder
                    {data.nudgeSummary.pending24h !== 1 ? 's' : ''}
                  </span>
                )}
                {data.nudgeSummary.pending24h > 0 && data.nudgeSummary.pending48h > 0 && ', '}
                {data.nudgeSummary.pending48h > 0 && (
                  <span>
                    {data.nudgeSummary.pending48h} pending 48h reminder
                    {data.nudgeSummary.pending48h !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

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

      {/* People list section */}
      {data.people && data.people.length > 0 && onPersonClick && (
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">People</h4>
            <button
              onClick={() => setShowAllPeople(!showAllPeople)}
              className="text-xs text-sage-600 hover:underline"
            >
              {showAllPeople ? 'Show less' : `Show all ${data.people.length}`}
            </button>
          </div>

          <div className="space-y-1">
            {(showAllPeople ? data.people : data.people.slice(0, 5)).map((person) => (
              <div
                key={person.id}
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  console.log('Person clicked:', person.id, person.name);
                  if (onPersonClick) {
                    onPersonClick(person.id);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={person.status} />
                  <span className="text-sm">{person.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {person.nudge24hSentAt && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-1 rounded">24h</span>
                  )}
                  {person.nudge48hSentAt && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded">48h</span>
                  )}
                </div>
              </div>
            ))}
          </div>
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

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'RESPONDED':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'OPENED':
      return <Eye className="w-4 h-4 text-blue-500" />;
    case 'SENT':
      return <Send className="w-4 h-4 text-yellow-500" />;
    case 'NOT_SENT':
      return <Clock className="w-4 h-4 text-gray-400" />;
    default:
      return null;
  }
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
