'use client';

import { useState, useEffect } from 'react';
import { Link2, Copy, Check, Users, AlertCircle, ExternalLink } from 'lucide-react';

interface Props {
  eventId: string;
  eventStatus: string;
}

interface SharedLinkData {
  enabled: boolean;
  url: string | null;
  peopleCount: number;
  recommendSharedLink: boolean;
}

export function SharedLinkSection({ eventId, eventStatus }: Props) {
  const [data, setData] = useState<SharedLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventStatus === 'CONFIRMING' || eventStatus === 'FROZEN') {
      fetchStatus();
    } else {
      setLoading(false);
    }
  }, [eventId, eventStatus]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/shared-link`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch shared link status:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    setEnabling(true);
    setError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/shared-link`, {
        method: 'POST',
      });

      if (res.ok) {
        const result = await res.json();
        setData((prev) => (prev ? { ...prev, enabled: true, url: result.url } : null));
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to enable shared link');
      }
    } catch (e) {
      setError('Failed to enable shared link');
    } finally {
      setEnabling(false);
    }
  };

  const handleCopy = async () => {
    if (!data?.url) return;

    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = data.url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Don't show if not in correct status
  if (eventStatus !== 'CONFIRMING' && eventStatus !== 'FROZEN') {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 rounded w-1/3"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-sage-600" />
        <h3 className="font-semibold">Shared Link</h3>
        {data.recommendSharedLink && !data.enabled && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            Recommended for {data.peopleCount}+ people
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {data.enabled && data.url ? (
        // Enabled state
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Share this link with everyone. They'll select their name to see their assignments.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={data.url}
              readOnly
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono truncate"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-500" />
                  <span className="text-green-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>Post to your family group chat</span>
            </div>
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sage-600 hover:underline"
            >
              <span>Preview</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      ) : (
        // Not enabled state
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Instead of copying {data.peopleCount} individual links, create one link that everyone
            can use. Each person will select their name to see their assignments.
          </p>

          <button
            onClick={handleEnable}
            disabled={enabling}
            className="w-full py-2.5 px-4 bg-sage-600 text-white rounded-lg hover:bg-sage-700 disabled:opacity-50 font-medium transition-colors"
          >
            {enabling ? 'Creating...' : 'Create Shared Link'}
          </button>
        </div>
      )}
    </div>
  );
}
