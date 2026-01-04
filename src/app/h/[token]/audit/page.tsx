'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface AuditEntry {
  id: string;
  timestamp: string;
  actionType: string;
  targetType: string;
  targetId: string;
  details: string | null;
  actor: {
    id: string;
    name: string;
  };
}

interface AuditData {
  entries: AuditEntry[];
  actionTypes: string[];
}

export default function AuditLogPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    fetchData();
  }, [token, filter]);

  const fetchData = async () => {
    try {
      const url = `/api/h/${token}/audit${filter !== 'ALL' ? `?actionType=${filter}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to load audit log');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionBadgeColor = (actionType: string) => {
    if (actionType.includes('ASSIGN')) return 'bg-blue-100 text-blue-800';
    if (actionType.includes('UNASSIGN')) return 'bg-yellow-100 text-yellow-800';
    if (actionType.includes('STATUS')) return 'bg-purple-100 text-purple-800';
    if (actionType.includes('OVERRIDE') || actionType.includes('UNFREEZE'))
      return 'bg-red-100 text-red-800';
    if (actionType.includes('ACK')) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-gray-600">Loading audit log...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-red-600">Error: {error || 'Failed to load'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Audit Log</h1>
              <p className="text-gray-600">Complete history of actions and changes</p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
            >
              ← Back
            </button>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Filter by action:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Actions</option>
              {data.actionTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500">
              Showing {data.entries.length} {data.entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        </div>

        {/* Audit Entries */}
        <div className="space-y-3">
          {data.entries.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
              No audit entries found.
            </div>
          ) : (
            data.entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Timestamp */}
                  <div className="flex-shrink-0 text-sm text-gray-500 w-40">
                    {formatTimestamp(entry.timestamp)}
                  </div>

                  {/* Actor */}
                  <div className="flex-shrink-0 w-32">
                    <span className="text-sm font-medium text-gray-700">{entry.actor.name}</span>
                  </div>

                  {/* Action Badge */}
                  <div className="flex-shrink-0">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getActionBadgeColor(
                        entry.actionType
                      )}`}
                    >
                      {entry.actionType.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      {entry.details || <span className="text-gray-400 italic">No details</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Target: {entry.targetType}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer note */}
        {data.entries.length >= 100 && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Showing the most recent 100 entries. Older entries are stored in the database.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
