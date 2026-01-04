'use client';

import { useState, useEffect } from 'react';
import { Clock, RotateCcw, AlertCircle } from 'lucide-react';

interface Revision {
  id: string;
  revisionNumber: number;
  createdAt: string;
  createdBy: string;
  reason: string | null;
}

interface RevisionHistoryProps {
  eventId: string;
  actorId: string; // For creating manual revisions
}

export default function RevisionHistory({ eventId, actorId }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState<string | null>(null);
  const [creatingRevision, setCreatingRevision] = useState(false);

  useEffect(() => {
    loadRevisions();
  }, [eventId]);

  const loadRevisions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/events/${eventId}/revisions`);
      if (!response.ok) throw new Error('Failed to load revisions');

      const data = await response.json();
      setRevisions(data.revisions || []);
    } catch (err: any) {
      console.error('Error loading revisions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRevision = async () => {
    if (!confirm('Create a manual revision snapshot?')) return;

    try {
      setCreatingRevision(true);
      const response = await fetch(`/api/events/${eventId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId,
          reason: 'Manual snapshot',
        }),
      });

      if (!response.ok) throw new Error('Failed to create revision');

      // Reload revisions
      await loadRevisions();
      alert('Revision created successfully!');
    } catch (err: any) {
      console.error('Error creating revision:', err);
      alert('Failed to create revision: ' + err.message);
    } finally {
      setCreatingRevision(false);
    }
  };

  const handleRestore = async (revision: Revision) => {
    const message = `Restore to revision #${revision.revisionNumber}?\n\nReason: ${revision.reason || 'No reason provided'}\nCreated: ${new Date(revision.createdAt).toLocaleString()}\n\nThis will replace the current plan state. This action cannot be undone.`;

    if (!confirm(message)) return;

    try {
      setRestoring(revision.id);
      const response = await fetch(`/api/events/${eventId}/revisions/${revision.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId }),
      });

      if (!response.ok) throw new Error('Failed to restore revision');

      alert(`Successfully restored to revision #${revision.revisionNumber}`);
      // Reload the page to show restored state
      window.location.reload();
    } catch (err: any) {
      console.error('Error restoring revision:', err);
      alert('Failed to restore revision: ' + err.message);
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Revision History</h2>
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">Loading revisions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Revision History</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <p className="text-red-800 font-medium">Failed to load revisions</p>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Revision History</h2>
        <button
          onClick={handleCreateRevision}
          disabled={creatingRevision}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Clock className="w-4 h-4" />
          {creatingRevision ? 'Creating...' : 'Create Snapshot'}
        </button>
      </div>

      {revisions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm">No revisions yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Revisions are created automatically before regeneration or manually via the button above
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {revisions.map((revision) => (
            <div
              key={revision.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">
                      Revision #{revision.revisionNumber}
                    </span>
                    <span className="text-xs text-gray-500">{formatDate(revision.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-600">{revision.reason || 'No reason provided'}</p>
                </div>
                <button
                  onClick={() => handleRestore(revision)}
                  disabled={restoring !== null}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1 ml-4"
                >
                  <RotateCcw className="w-3 h-3" />
                  {restoring === revision.id ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {revisions.length > 0 && (
        <div className="mt-4 pt-4 border-t text-xs text-gray-500">
          Showing last {revisions.length} revision{revisions.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
