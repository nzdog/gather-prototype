'use client';

import { useState, useEffect } from 'react';
import { X, User, Phone, Mail, Clock, CheckCircle, XCircle, Eye, Send, Bell } from 'lucide-react';
import { formatPhoneForDisplay } from '@/lib/phone';

interface PersonDetail {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
  inviteAnchorAt: string | null;
  openedAt: string | null;
  respondedAt: string | null;
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null;
  hasPhone: boolean;
  smsOptedOut: boolean;
  canReceiveSms: boolean;
  nudge24hSentAt: string | null;
  nudge48hSentAt: string | null;
  claimedAt: string | null;
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
                      : 'Response pending'
                }
                time={person.respondedAt}
                color={
                  person.response === 'ACCEPTED'
                    ? 'green'
                    : person.response === 'DECLINED'
                      ? 'red'
                      : 'gray'
                }
              />
            </div>
          </div>

          {/* Nudges */}
          {(person.nudge24hSentAt || person.nudge48hSentAt) && (
            <div className="border rounded-lg p-3">
              <h3 className="font-medium text-sm text-gray-700 mb-2">Auto-Reminders</h3>
              <div className="space-y-2">
                {person.nudge24hSentAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="w-4 h-4 text-yellow-600" />
                    <span>24h reminder sent</span>
                    <span className="text-gray-500">
                      {new Date(person.nudge24hSentAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {person.nudge48hSentAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Bell className="w-4 h-4 text-amber-600" />
                    <span>48h reminder sent</span>
                    <span className="text-gray-500">
                      {new Date(person.nudge48hSentAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
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
