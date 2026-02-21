'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  token: string;
  person: { id: string; name: string; status: string; response: string };
  onClose: () => void;
  onUpdate: () => void;
}

export function HostPersonModal({ token, person, onClose, onUpdate }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOverride = async (response: 'ACCEPTED' | 'DECLINED') => {
    if (!reason.trim()) {
      setError('Please provide a reason.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/h/${token}/people/${person.id}/manual-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, reason: reason.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }

      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  const statusLabel: Record<string, string> = {
    NOT_SENT: 'Not sent',
    SENT: 'Sent',
    OPENED: 'Opened',
    RESPONDED: 'Responded',
  };

  const statusColor: Record<string, string> = {
    NOT_SENT: 'bg-gray-100 text-gray-600',
    SENT: 'bg-blue-100 text-blue-700',
    OPENED: 'bg-amber-100 text-amber-700',
    RESPONDED: 'bg-green-100 text-green-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{person.name}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="size-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Status + Response */}
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[person.status] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {statusLabel[person.status] ?? person.status}
            </span>

            {person.response === 'ACCEPTED' && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                ✓ Confirmed
              </span>
            )}
            {person.response === 'DECLINED' && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                ✗ Declined
              </span>
            )}
            {person.response === 'PENDING' && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                Pending
              </span>
            )}
          </div>

          {/* Override section */}
          {person.response === 'PENDING' && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Record manual response
            </button>
          )}

          {(showForm || person.response !== 'PENDING') && (
            <div className="space-y-3">
              {person.response !== 'PENDING' && (
                <p className="text-sm text-gray-500">
                  Override the current response by recording a new manual response below.
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Confirmed by text message"
                  rows={2}
                  disabled={submitting}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-none"
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => handleOverride('DECLINED')}
                  disabled={submitting}
                  className="flex-1 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  Mark as Declined
                </button>
                <button
                  onClick={() => handleOverride('ACCEPTED')}
                  disabled={submitting}
                  className="flex-1 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                >
                  Mark as Confirmed
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
