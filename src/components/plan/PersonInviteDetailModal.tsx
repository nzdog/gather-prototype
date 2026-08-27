'use client';

import { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Send,
  Bell,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { formatPhoneForDisplay } from '@/lib/phone';
import { NudgeComposer } from './NudgeComposer';

interface PersonDetail {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
  inviteAnchorAt: string | null;
  openedAt: string | null;
  respondedAt: string | null;
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE' | null;
  hasPhone: boolean;
  smsOptedOut: boolean;
  canReceiveSms: boolean;
  // GTC-178 (E1, phase 4): sourced from PersonEvent, not Person. Phase 5 retimed the
  // labels below to days 4 and 7; GTC-179 (E2) must revisit them when the pace becomes
  // adjustable.
  firstNudgeSentAt: string | null;
  secondNudgeSentAt: string | null;
  lastHostNudgeAt: string | null;
  claimedAt: string | null;
  eventName: string | null;
  eventDate: string | null;
  assignments: {
    response: string;
    itemName: string | null;
  }[];
  inviteEvents: {
    type: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }[];
}

interface Props {
  eventId: string;
  personId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function PersonInviteDetailModal({ eventId, personId, onClose, onUpdate }: Props) {
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualButtons, setShowManualButtons] = useState(false);
  const [showNudgeComposer, setShowNudgeComposer] = useState(false);

  useEffect(() => {
    fetchPersonDetail();
  }, [personId]);

  const fetchPersonDetail = async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/people/${personId}/invite-detail`);
      if (res.ok) {
        setPerson(await res.json());
      } else {
        setError('Failed to load details');
      }
    } catch (e) {
      setError('Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  const handleManualOverride = async (responseType: 'ACCEPTED' | 'DECLINED') => {
    setMarking(true);
    setError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/people/${personId}/manual-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: responseType }),
      });

      if (res.ok) {
        await fetchPersonDetail();
        onUpdate();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update');
      }
    } catch (e) {
      setError('Failed to update');
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin w-8 h-8 border-2 border-sage-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!person) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sage-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-sage-600" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">{person.name}</h2>
              <StatusBadge status={person.status} response={person.response} />
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* Contact Info */}
          <div className="space-y-2">
            {person.email && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4" />
                <span>{person.email}</span>
              </div>
            )}
            {person.phoneNumber && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{formatPhoneForDisplay(person.phoneNumber)}</span>
                {person.smsOptedOut && (
                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                    Opted out
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="border rounded-lg p-3">
            <h3 className="font-medium text-sm text-gray-700 mb-3">Timeline</h3>
            <div className="space-y-3">
              <TimelineItem
                icon={Send}
                label="Invite sent"
                time={person.inviteAnchorAt}
                color="yellow"
              />
              <TimelineItem icon={Eye} label="Link opened" time={person.openedAt} color="blue" />
              {person.claimedAt && (
                <TimelineItem
                  icon={User}
                  label="Name claimed (shared link)"
                  time={person.claimedAt}
                  color="purple"
                />
              )}
              <TimelineItem
                icon={
                  person.response === 'ACCEPTED'
                    ? CheckCircle
                    : person.response === 'DECLINED'
                      ? XCircle
                      : Clock
                }
                label={
                  person.response === 'ACCEPTED'
                    ? 'Accepted'
                    : person.response === 'DECLINED'
                      ? 'Declined'
                      : person.response === 'MAYBE'
                        ? 'Maybe'
                        : 'Response pending'
                }
                time={person.respondedAt}
                color={
                  person.response === 'ACCEPTED'
                    ? 'green'
                    : person.response === 'DECLINED'
                      ? 'red'
                      : person.response === 'MAYBE'
                        ? 'amber'
                        : 'gray'
                }
              />
            </div>
          </div>

          {/* Reminders */}
          {(person.firstNudgeSentAt || person.secondNudgeSentAt || person.lastHostNudgeAt) && (
            <div className="border rounded-lg p-3">
              <h3 className="font-medium text-sm text-gray-700 mb-2">Reminders</h3>
              <div className="space-y-2">
                {person.firstNudgeSentAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="w-4 h-4 text-yellow-600" />
                    <span>Day-4 auto-reminder sent</span>
                    <span className="text-gray-500">
                      {new Date(person.firstNudgeSentAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {person.secondNudgeSentAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="w-4 h-4 text-amber-600" />
                    <span>Day-7 auto-reminder sent</span>
                    <span className="text-gray-500">
                      {new Date(person.secondNudgeSentAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {person.lastHostNudgeAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-sage-600" />
                    <span>Nudged</span>
                    <span className="text-gray-500">
                      {new Date(person.lastHostNudgeAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Host Nudge Section */}
          {person.response === 'PENDING' && (
            <HostNudgeSection
              eventId={eventId}
              person={person}
              showComposer={showNudgeComposer}
              onOpenComposer={() => setShowNudgeComposer(true)}
              onCloseComposer={() => setShowNudgeComposer(false)}
              onSent={() => {
                setShowNudgeComposer(false);
                fetchPersonDetail();
                onUpdate();
              }}
            />
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-gray-50">
          {person.response === 'PENDING' && (
            <>
              {!showManualButtons ? (
                <button
                  onClick={() => setShowManualButtons(true)}
                  className="w-full py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors"
                >
                  Manual response
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleManualOverride('DECLINED')}
                    disabled={marking}
                    className="flex-1 py-2.5 px-4 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 font-medium transition-colors"
                  >
                    {marking ? 'Updating...' : 'Mark as Declined'}
                  </button>
                  <button
                    onClick={() => handleManualOverride('ACCEPTED')}
                    disabled={marking}
                    className="flex-1 py-2.5 px-4 bg-sage-600 text-white rounded-lg hover:bg-sage-700 disabled:opacity-50 font-medium transition-colors"
                  >
                    {marking ? 'Updating...' : 'Mark as Confirmed'}
                  </button>
                </div>
              )}
            </>
          )}
          {person.response === 'ACCEPTED' && (
            <p className="text-center text-green-600 font-medium">✓ Confirmed</p>
          )}
          {person.response === 'DECLINED' && (
            <p className="text-center text-red-600 font-medium">✗ Declined</p>
          )}
          {person.response === 'MAYBE' && (
            <p className="text-center text-amber-600 font-medium">Maybe</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, response }: { status: string; response: string | null }) {
  if (response === 'ACCEPTED') {
    return (
      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
        Confirmed
      </span>
    );
  }
  if (response === 'DECLINED') {
    return (
      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Declined</span>
    );
  }
  // GTC-174 (D1): a maybe outranks the send/open status badge — it is a decision, and
  // Hinge §6's rule is that decisions surface while behaviour stays the system's business.
  if (response === 'MAYBE') {
    return (
      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Maybe</span>
    );
  }

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    NOT_SENT: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Not sent' },
    SENT: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Sent' },
    OPENED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Opened' },
    RESPONDED: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Responded' },
  };

  const config = statusConfig[status] || statusConfig['NOT_SENT'];

  return (
    <span className={`text-xs ${config.bg} ${config.text} px-2 py-0.5 rounded-full`}>
      {config.label}
    </span>
  );
}

function HostNudgeSection({
  eventId,
  person,
  showComposer,
  onOpenComposer,
  onCloseComposer,
  onSent,
}: {
  eventId: string;
  person: PersonDetail;
  showComposer: boolean;
  onOpenComposer: () => void;
  onCloseComposer: () => void;
  onSent: () => void;
}) {
  const hasContact = person.hasPhone || !!person.email;
  const COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const isOnCooldown =
    person.lastHostNudgeAt && new Date(person.lastHostNudgeAt).getTime() > Date.now() - COOLDOWN_MS;

  // Determine contact method
  const contactMethod: 'sms' | 'email' = person.canReceiveSms ? 'sms' : 'email';

  // Build task item string from pending assignments
  const pendingItems = person.assignments
    .filter((a) => a.response === 'PENDING' && a.itemName)
    .map((a) => a.itemName!);
  const taskItem =
    pendingItems.length === 0
      ? 'your assigned items'
      : pendingItems.length === 1
        ? pendingItems[0]
        : pendingItems.slice(0, 2).join(' and ');

  const eventDate = person.eventDate
    ? new Date(person.eventDate).toLocaleDateString('en-NZ', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : 'the event date';

  if (!hasContact) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>No contact details — nudge unavailable</span>
      </div>
    );
  }

  if (showComposer) {
    return (
      <NudgeComposer
        eventId={eventId}
        personId={person.id}
        personName={person.name}
        taskItem={taskItem}
        eventName={person.eventName || 'the event'}
        eventDate={eventDate}
        contactMethod={contactMethod}
        onSent={onSent}
        onCancel={onCloseComposer}
      />
    );
  }

  return (
    <button
      onClick={onOpenComposer}
      disabled={!!isOnCooldown}
      title={
        isOnCooldown
          ? 'Nudge sent less than 24 hours ago'
          : `Send a nudge via ${contactMethod === 'sms' ? 'SMS' : 'email'}`
      }
      className="w-full py-2.5 px-4 border border-sage-300 text-sage-700 rounded-lg hover:bg-sage-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center justify-center gap-2"
    >
      <MessageSquare className="w-4 h-4" />
      {isOnCooldown ? 'Nudge sent less than 24 hours ago' : 'Send Nudge'}
    </button>
  );
}

function TimelineItem({
  icon: Icon,
  label,
  time,
  color,
}: {
  icon: React.ElementType;
  label: string;
  time: string | null;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    yellow: 'bg-yellow-100 text-yellow-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    // GTC-174 (D1): the maybe colour. Hinge §8 rules it yellow — the system can work it.
    amber: 'bg-amber-100 text-amber-700',
    gray: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className={`flex items-center gap-3 ${!time ? 'opacity-50' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${colorClasses[color]}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {time && <p className="text-xs text-gray-500">{new Date(time).toLocaleString()}</p>}
      </div>
    </div>
  );
}
