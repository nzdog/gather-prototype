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
import { ReachabilityBar } from './ReachabilityBar';
import TransitionModal from './TransitionModal';

interface PersonStatus {
  id: string;
  name: string;
  status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
  hasPhone: boolean;
  smsOptedOut: boolean;
  // GTC-178 (E1, phase 4): sourced from PersonEvent, not Person.
  firstNudgeSentAt?: string | null;
  secondNudgeSentAt?: string | null;
  nudgeStatus?: string;
  /**
   * GTC-256 (phase 3), Ruling 5. She is in this list — in the guest list and counted
   * (Rulings 1 and 3) — and she is never messaged, so her row is not an entry point to
   * the nudge composer. See the row below.
   */
  isHost?: boolean;
  reachabilityTier: 'DIRECT' | 'PROXY' | 'SHARED' | 'UNTRACKABLE';
}

interface InviteStatusData {
  eventStatus: string;
  sentAt: string | null;
  hasUnsentPeople: boolean;
  counts: {
    total: number;
    notSent: number;
    sent: number;
    opened: number;
    responded: number;
    withPhone: number;
  };
  /**
   * GTC-174 (D1): derived from the item taps, not read from a column. `unknown`
   * replaces the old `notSure` — NOT_SURE meant "maybe I'm coming", which Hinge §8
   * abolishes; UNKNOWN means "engaged, attendance undetermined".
   */
  attendance?: {
    total: number;
    yes: number;
    no: number;
    unknown: number;
    pending: number;
  };
  items?: {
    total: number;
    confirmed: number;
    declined: number;
    pending: number;
    gaps: number;
  };
  itemDetails?: Array<{
    id: string;
    name: string;
    status: 'confirmed' | 'declined' | 'pending' | 'gap';
    assignee: string | null;
  }>;
  smsSummary?: {
    withPhone: number;
    withoutPhone: number;
    optedOut: number;
    canReceive: number;
  };
  // GTC-178 (E1, phase 5): ordinal keys, day-4/day-7 legs.
  nudgeSummary?: {
    sentFirst: number;
    sentSecond: number;
    pendingFirst: number;
    pendingSecond: number;
  };
  proxyNudgeSummary?: {
    totalHouseholds: number;
    totalMembers: number;
    totalChildren: number;
  };
  reachability?: {
    direct: number;
    proxy: number;
    shared: number;
    untrackable: number;
  };
  threshold?: {
    complianceRate: number;
    thresholdReached: boolean;
    criticalGaps: number;
    readyToFreeze: boolean;
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
  const [expandedAttendance, setExpandedAttendance] = useState(false);
  const [expandedItems, setExpandedItems] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);

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

  const { counts, hasUnsentPeople, sentAt, attendance, items, itemDetails } = data;

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Invite Status</h3>
        <button onClick={fetchStatus} className="text-gray-400 hover:text-gray-600" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Attendance Section */}
      {attendance && (
        <div className="space-y-2 border-b pb-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">Attendance</h4>
            <button
              onClick={() => setExpandedAttendance(!expandedAttendance)}
              className="text-xs text-sage-600 hover:underline"
            >
              {expandedAttendance ? 'Hide details' : 'Show details'}
            </button>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              {attendance.yes} of {attendance.total} confirmed
            </span>
            <span className="font-medium">
              {attendance.total > 0 ? Math.round((attendance.yes / attendance.total) * 100) : 0}%
            </span>
          </div>
          {/* Multi-segment progress bar for attendance */}
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden flex">
            {attendance.total > 0 && (
              <>
                {/* YES segment - green */}
                <div
                  className="bg-green-500 h-full transition-all duration-300"
                  style={{ width: `${(attendance.yes / attendance.total) * 100}%` }}
                  title={`${attendance.yes} Yes`}
                />
                {/* NO segment - red */}
                <div
                  className="bg-red-500 h-full transition-all duration-300"
                  style={{ width: `${(attendance.no / attendance.total) * 100}%` }}
                  title={`${attendance.no} No`}
                />
                {/* UNKNOWN segment - amber. GTC-174 (D1): a maybe, or a no whose
                    follow-up went unanswered. Yellow per Hinge §8 — the system can work
                    it; it is not a failure. */}
                <div
                  className="bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${(attendance.unknown / attendance.total) * 100}%` }}
                  title={`${attendance.unknown} Undecided`}
                />
                {/* PENDING segment - gray */}
                <div
                  className="bg-gray-400 h-full transition-all duration-300"
                  style={{ width: `${(attendance.pending / attendance.total) * 100}%` }}
                  title={`${attendance.pending} Pending`}
                />
              </>
            )}
          </div>

          {/* Expanded attendance details */}
          {expandedAttendance && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                  <span className="text-gray-700">
                    Yes: <span className="font-medium">{attendance.yes}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                  <span className="text-gray-700">
                    No: <span className="font-medium">{attendance.no}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
                  <span className="text-gray-700">
                    Undecided: <span className="font-medium">{attendance.unknown}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-400 rounded-sm"></div>
                  <span className="text-gray-700">
                    Pending: <span className="font-medium">{attendance.pending}</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Items Section */}
      {items && (
        <div className="space-y-2 border-b pb-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">Items</h4>
            <button
              onClick={() => setExpandedItems(!expandedItems)}
              className="text-xs text-sage-600 hover:underline"
            >
              {expandedItems ? 'Hide details' : 'Show details'}
            </button>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              {items.total - items.gaps} of {items.total} items covered
            </span>
            <span className="font-medium">
              {items.total > 0 ? Math.round(((items.total - items.gaps) / items.total) * 100) : 0}%
            </span>
          </div>
          {/* Multi-segment progress bar for items */}
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden flex">
            {items.total > 0 && (
              <>
                {/* CONFIRMED segment - green */}
                <div
                  className="bg-green-500 h-full transition-all duration-300"
                  style={{ width: `${(items.confirmed / items.total) * 100}%` }}
                  title={`${items.confirmed} Confirmed`}
                />
                {/* PENDING segment - amber */}
                <div
                  className="bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${(items.pending / items.total) * 100}%` }}
                  title={`${items.pending} Pending`}
                />
                {/* GAPS segment - red with pattern to distinguish from declined */}
                <div
                  className="bg-red-500 h-full transition-all duration-300"
                  style={{ width: `${(items.gaps / items.total) * 100}%` }}
                  title={`${items.gaps} Gaps`}
                />
              </>
            )}
          </div>

          {/* Expanded items details */}
          {expandedItems && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                  <span className="text-gray-700">
                    Confirmed: <span className="font-medium">{items.confirmed}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
                  <span className="text-gray-700">
                    Pending: <span className="font-medium">{items.pending}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                  <span className="text-gray-700">
                    Gaps: <span className="font-medium">{items.gaps}</span>
                  </span>
                </div>
              </div>

              {/* Item details table */}
              {itemDetails && itemDetails.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-2 py-1 font-medium text-gray-700">Item</th>
                        <th className="text-left px-2 py-1 font-medium text-gray-700">Status</th>
                        <th className="text-left px-2 py-1 font-medium text-gray-700">Assignee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemDetails.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-2 py-1 text-gray-900">{item.name}</td>
                          <td className="px-2 py-1">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                item.status === 'confirmed'
                                  ? 'bg-green-100 text-green-700'
                                  : item.status === 'pending'
                                    ? 'bg-amber-100 text-amber-700'
                                    : item.status === 'declined'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {item.status === 'gap' ? 'Gap' : item.status}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-gray-700">{item.assignee || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ready to Freeze Indicator */}
      {/* GTC-197 (A3c): ReadyToFreezeIndicator DELETED. It rendered only above 80%
          compliance and told her she was "ready to freeze" — a readiness score and a
          threshold, both refused outright by Moment 4 §2: "There is no readiness score,
          no threshold, no completion nag, and nothing the system withholds pending
          'enough' confirmation." The gap sweep at the pre-flight replaces it. */}

      {/* Legacy status breakdown - keep for backward compatibility */}
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

      {/* Reachability breakdown */}
      {data.reachability && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Reachability Breakdown</h4>

          {/* Warning banner if untrackable > 0 */}
          {data.reachability.shared + data.reachability.untrackable > 0 && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">
                    {data.reachability.shared + data.reachability.untrackable}{' '}
                    {data.reachability.shared + data.reachability.untrackable === 1
                      ? 'person is'
                      : 'people are'}{' '}
                    untrackable
                  </p>
                  <p className="text-xs mt-1">
                    You won't be able to send automated nudges to these people. Consider collecting
                    contact info.
                  </p>
                </div>
              </div>
            </div>
          )}

          <ReachabilityBar data={data.reachability} people={data.people} />
        </div>
      )}

      {/* Nudge summary */}
      {data.nudgeSummary && (
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Auto-Reminders</h4>
          <div className="space-y-2 text-sm">
            {/* GTC-179 (E2, phase 5): ORDINAL. These read "Day-4"/"Day-7" until the
                cadence became adjustable per event and per person, at which point a day
                number here was a lie for any host who picked "relaxed" or "gentle". The
                stored columns were named ordinally to avoid exactly this (GTC-178 Ruling
                7) and this copy now follows them. Say WHICH reminder, never when — the
                timestamp beside each row carries the when. */}
            <div className="flex justify-between">
              <span className="text-gray-600">First reminders sent</span>
              <span className="font-medium">{data.nudgeSummary.sentFirst}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Second reminders sent</span>
              <span className="font-medium">{data.nudgeSummary.sentSecond}</span>
            </div>
            {(data.nudgeSummary.pendingFirst > 0 || data.nudgeSummary.pendingSecond > 0) && (
              <p className="text-xs text-gray-500 mt-2">
                {data.nudgeSummary.pendingFirst > 0 && (
                  <span>
                    {data.nudgeSummary.pendingFirst} pending first reminder
                    {data.nudgeSummary.pendingFirst !== 1 ? 's' : ''}
                  </span>
                )}
                {data.nudgeSummary.pendingFirst > 0 && data.nudgeSummary.pendingSecond > 0 && ', '}
                {data.nudgeSummary.pendingSecond > 0 && (
                  <span>
                    {data.nudgeSummary.pendingSecond} pending second reminder
                    {data.nudgeSummary.pendingSecond !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Proxy nudge summary */}
      {data.proxyNudgeSummary && data.proxyNudgeSummary.totalHouseholds > 0 && (
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Households</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total households</span>
              <span className="font-medium">{data.proxyNudgeSummary.totalHouseholds}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total members</span>
              <span className="font-medium">{data.proxyNudgeSummary.totalMembers}</span>
            </div>
            {data.proxyNudgeSummary.totalChildren > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Children</span>
                <span className="font-medium">{data.proxyNudgeSummary.totalChildren}</span>
              </div>
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
              /*
               * GTC-256 (phase 3), RULING 5 — THE HOST'S ROW IS NOT A NUDGE ENTRY POINT.
               *
               * She stays in the list, because she is in the guest list and counted
               * (Rulings 1 and 3). What she does not get is the click, which opens
               * PersonInviteDetailModal -> HostNudgeSection -> the nudge route — and that
               * route now refuses her with 403. A refusing route behind a clickable row
               * means she presses it and gets an error for doing what the screen offered.
               * Same reasoning as withholding the mark control on the pre-flight: the route
               * is the gate, and the screen should not offer what the gate will refuse.
               *
               * ⚠ WhosMissing is the OTHER door to the same modal and is handled too — she
               * is not in it at all, because she was never asked and so cannot be missing.
               */
              <div
                key={person.id}
                className={`flex items-center justify-between py-1.5 px-2 rounded ${
                  person.isHost ? '' : 'hover:bg-gray-50 cursor-pointer'
                }`}
                onClick={() => {
                  if (onPersonClick && !person.isHost) {
                    onPersonClick(person.id);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={person.status} />
                  <span className="text-sm">{person.name}</span>
                  {person.isHost && (
                    <span className="text-xs text-gray-500">
                      you — never messaged about your own event
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* GTC-179 (E2, phase 5): ordinal chips. "1st"/"2nd" rather than
                      "Day 4"/"Day 7" — four characters have to survive every pace a host
                      can pick, and a day number survives only the default. */}
                  {person.firstNudgeSentAt && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-1 rounded">1st</span>
                  )}
                  {person.secondNudgeSentAt && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1 rounded">2nd</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last confirmed timestamp */}
      {sentAt && (
        <p className="text-xs text-gray-500 pt-2 border-t">
          Sent: {new Date(sentAt).toLocaleString()}
        </p>
      )}

      {/* Transition Modal for Freeze */}
      {showTransitionModal && (
        <TransitionModal
          eventId={eventId}
          currentStatus={data.eventStatus as 'DRAFT' | 'CONFIRMING' | 'FROZEN' | 'COMPLETE'}
          onClose={() => setShowTransitionModal(false)}
          onSuccess={() => {
            setShowTransitionModal(false);
            // Refresh data after successful freeze
            fetchStatus();
          }}
        />
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
