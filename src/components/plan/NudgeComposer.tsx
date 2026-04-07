'use client';

import { useState } from 'react';
import { Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

type NudgeVariant = 'warm' | 'casual' | 'gentle' | 'direct';

const VARIANT_LABELS: Record<NudgeVariant, string> = {
  warm: 'Warm',
  casual: 'Casual',
  gentle: 'Gentle',
  direct: 'Direct',
};

const TEMPLATES: Record<NudgeVariant, (p: TemplateParams) => string> = {
  warm: (p) =>
    `Hey ${p.guestFirstName} — just checking in! Still all good to bring ${p.taskItem} to ${p.eventName} on ${p.eventDate}? Let me know if anything's changed 😊`,
  casual: (p) =>
    `Oi ${p.guestFirstName} 👋 Quick one — are you still sorted for ${p.taskItem} at ${p.eventName}? Just want to make sure we're covered!`,
  gentle: (p) =>
    `Hi ${p.guestFirstName}, hope you're well! Just a gentle reminder that you've been assigned ${p.taskItem} for ${p.eventName} on ${p.eventDate}. Let me know if that still works for you.`,
  direct: (p) =>
    `Hi ${p.guestFirstName} — confirming you're still bringing ${p.taskItem} to ${p.eventName} on ${p.eventDate}. Reply to let me know either way. Thanks!`,
};

interface TemplateParams {
  guestFirstName: string;
  taskItem: string;
  eventName: string;
  eventDate: string;
}

interface Props {
  eventId: string;
  personId: string;
  personName: string;
  taskItem: string;
  eventName: string;
  eventDate: string;
  contactMethod: 'sms' | 'email';
  onSent: () => void;
  onCancel: () => void;
}

export function NudgeComposer({
  eventId,
  personId,
  personName,
  taskItem,
  eventName,
  eventDate,
  contactMethod,
  onSent,
  onCancel,
}: Props) {
  const [variant, setVariant] = useState<NudgeVariant>('warm');
  const [message, setMessage] = useState(() =>
    generateMessage('warm', { personName, taskItem, eventName, eventDate })
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generateMessage(
    v: NudgeVariant,
    params: { personName: string; taskItem: string; eventName: string; eventDate: string }
  ) {
    const guestFirstName = params.personName.split(' ')[0] || params.personName;
    return TEMPLATES[v]({
      guestFirstName,
      taskItem: params.taskItem,
      eventName: params.eventName,
      eventDate: params.eventDate,
    });
  }

  function handleVariantChange(v: NudgeVariant) {
    if (v === variant) return;
    // If user edited, switching template replaces their edits
    setVariant(v);
    setMessage(generateMessage(v, { personName, taskItem, eventName, eventDate }));
  }

  async function handleSend() {
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/people/${personId}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: variant, message }),
      });

      if (res.ok) {
        setSent(true);
        setTimeout(() => onSent(), 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to send nudge');
      }
    } catch {
      setError('Failed to send nudge');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="border rounded-lg p-4 bg-green-50 border-green-200">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">Nudge sent!</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-gray-700">Send Nudge</h3>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>

      {/* Template selector */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(VARIANT_LABELS) as NudgeVariant[]).map((v) => (
          <button
            key={v}
            onClick={() => handleVariantChange(v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              variant === v
                ? 'bg-sage-600 text-white border-sage-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-sage-400'
            }`}
          >
            {VARIANT_LABELS[v]}
          </button>
        ))}
      </div>

      {/* Message editor */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        className="w-full text-sm border border-gray-300 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-transparent"
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={sending || !message.trim()}
        className="w-full py-2.5 px-4 bg-sage-600 text-white rounded-lg hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center justify-center gap-2"
      >
        {sending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Send via {contactMethod === 'sms' ? 'SMS' : 'Email'}
          </>
        )}
      </button>
    </div>
  );
}
