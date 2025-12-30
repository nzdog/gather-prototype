'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Item {
  id: string;
  name: string;
  quantity: string | null;
  critical: boolean;
  status: string;
  glutenFree: boolean;
  dairyFree: boolean;
  vegetarian: boolean;
  notes: string | null;
  dropOffAt: string | null;
  dropOffLocation: string | null;
  dropOffNote: string | null;
  day: { id: string; name: string; date: string } | null;
  assignment: {
    id: string;
    acknowledged: boolean;
    person: { id: string; name: string };
  } | null;
}

interface Team {
  id: string;
  name: string;
  scope: string | null;
  coordinator: {
    id: string;
    name: string;
  };
  status: string;
  itemCount: number;
  unassignedCount: number;
  criticalGapCount: number;
  items: Item[];
}

interface HostData {
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  teams: Team[];
  freezeAllowed: boolean;
  criticalGapCount: number;
}

export default function HostView() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<HostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/h/${token}`);
      if (!response.ok) {
        throw new Error('Failed to load data');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!data) return;

    let unfreezeReason: string | null = null;

    // Confirmation for FROZEN → COMPLETE (final state)
    if (data.event.status === 'FROZEN' && newStatus === 'COMPLETE') {
      const confirmed = window.confirm(
        'Mark event as COMPLETE?\n\n' +
        'This is a final action and cannot be undone. ' +
        'Once complete, no further changes can be made to the event.\n\n' +
        'Are you sure you want to continue?'
      );
      if (!confirmed) {
        return;
      }
    }

    // Prompt for reason when unfreezing
    if (data.event.status === 'FROZEN' && newStatus === 'CONFIRMING') {
      unfreezeReason = window.prompt(
        'Unfreezing Event\n\n' +
        'Please provide a reason for unfreezing this event.\n' +
        'This will be logged in the audit trail.'
      );

      // If user cancels the prompt, abort the unfreeze
      if (unfreezeReason === null) {
        return;
      }

      // Require a non-empty reason
      if (unfreezeReason.trim() === '') {
        alert('A reason is required to unfreeze the event.');
        return;
      }
    }

    setUpdating(true);
    try {
      const response = await fetch(`/api/h/${token}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          unfreezeReason: unfreezeReason || undefined
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update status');
      }

      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const toggleTeam = (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedTeams(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SORTED':
        return <span className="text-2xl text-green-600">✓</span>;
      case 'CRITICAL_GAP':
        return <span className="text-2xl text-red-600">⚠</span>;
      case 'GAP':
        return <span className="text-2xl text-yellow-600">⚠</span>;
      default:
        return null;
    }
  };

  const getNextStatus = (currentStatus: string): string | null => {
    switch (currentStatus) {
      case 'DRAFT':
        return 'CONFIRMING';
      case 'CONFIRMING':
        return 'FROZEN';
      case 'FROZEN':
        return 'COMPLETE';
      default:
        return null;
    }
  };

  const canUnfreeze = (currentStatus: string): boolean => {
    return currentStatus === 'FROZEN';
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
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

  const nextStatus = getNextStatus(data.event.status);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{data.event.name}</h1>
              <p className="text-gray-600 mb-4">
                {new Date(data.event.startDate).toLocaleDateString('en-NZ')} – {new Date(data.event.endDate).toLocaleDateString('en-NZ')}
              </p>
            </div>
            <a
              href={`/h/${token}/audit`}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition text-sm"
            >
              📋 View Audit Log
            </a>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-gray-600">Status:</span>{' '}
              <span className="font-bold text-lg">{data.event.status}</span>
            </div>
            <div className="flex gap-2">
              {nextStatus && (
                <button
                  onClick={() => handleStatusChange(nextStatus)}
                  disabled={updating || (nextStatus === 'FROZEN' && !data.freezeAllowed)}
                  className={`px-4 py-2 rounded transition ${
                    updating || (nextStatus === 'FROZEN' && !data.freezeAllowed)
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {updating ? 'Updating...' : `→ ${nextStatus}`}
                </button>
              )}
              {canUnfreeze(data.event.status) && (
                <button
                  onClick={() => handleStatusChange('CONFIRMING')}
                  disabled={updating}
                  className={`px-4 py-2 rounded transition ${
                    updating
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-yellow-600 text-white hover:bg-yellow-700'
                  }`}
                >
                  {updating ? 'Updating...' : 'Unfreeze'}
                </button>
              )}
            </div>
          </div>
          {!data.freezeAllowed && data.event.status === 'CONFIRMING' && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-red-800 font-medium">
                ⚠ Cannot freeze: {data.criticalGapCount} critical gaps
              </p>
            </div>
          )}
        </div>

        {/* Teams */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Teams</h2>

          {data.teams.map((team) => {
            const isExpanded = expandedTeams.has(team.id);

            return (
              <div
                key={team.id}
                className={`bg-white rounded-lg shadow-sm ${
                  team.status === 'CRITICAL_GAP' ? 'border-l-4 border-red-500' :
                  team.status === 'GAP' ? 'border-l-4 border-yellow-500' :
                  'border-l-4 border-green-500'
                }`}
              >
                {/* Team Header - Clickable */}
                <button
                  onClick={() => toggleTeam(team.id)}
                  className="w-full p-6 flex items-center gap-4 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex-shrink-0">
                    {getStatusBadge(team.status)}
                  </div>

                  <div className="flex-1">
                    <h3 className="text-xl font-bold">{team.name}</h3>
                    {team.scope && (
                      <p className="text-sm text-gray-600">{team.scope}</p>
                    )}
                    <p className="text-sm text-gray-700 mt-1">
                      Coordinator: {team.coordinator.name}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      {team.itemCount} items
                    </div>
                    {team.unassignedCount > 0 && (
                      <div className={`text-sm font-medium ${
                        team.criticalGapCount > 0 ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                        {team.unassignedCount} unassigned
                        {team.criticalGapCount > 0 && ` (${team.criticalGapCount} critical)`}
                      </div>
                    )}
                    {team.unassignedCount === 0 && (
                      <div className="text-sm text-green-600 font-medium">
                        All sorted
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    <span className="text-gray-400">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </button>

                {/* Expanded Items - Host Oversight View */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gradient-to-b from-gray-50 to-white">
                    {/* Team Detail Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-gray-200 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-lg font-bold text-gray-900">
                          Team Overview • {team.items.length} Items
                        </h4>
                        <div className="flex gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">Assigned</div>
                            <div className="text-xl font-bold text-green-600">
                              {team.items.filter(i => i.assignment).length}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">Gaps</div>
                            <div className={`text-xl font-bold ${team.unassignedCount > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                              {team.unassignedCount}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">Critical</div>
                            <div className={`text-xl font-bold ${team.criticalGapCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {team.criticalGapCount}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">Ack'd</div>
                            <div className="text-xl font-bold text-blue-600">
                              {team.items.filter(i => i.assignment?.acknowledged).length}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Unassigned Items Section */}
                    {team.unassignedCount > 0 && (
                      <div className="px-6 py-4 bg-yellow-50 border-b border-yellow-100">
                        <h5 className="text-sm font-bold text-yellow-900 mb-3 uppercase tracking-wide">
                          ⚠ {team.unassignedCount} Unassigned {team.unassignedCount === 1 ? 'Item' : 'Items'}
                        </h5>
                        <div className="space-y-2">
                          {team.items
                            .filter(item => !item.assignment)
                            .map((item) => (
                              <div
                                key={item.id}
                                className="bg-white rounded-lg border-2 border-yellow-300 p-3 shadow-sm"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      {item.critical && (
                                        <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded uppercase">
                                          Critical
                                        </span>
                                      )}
                                      <span className="font-semibold text-gray-900">{item.name}</span>
                                      {item.quantity && (
                                        <span className="text-sm text-gray-500">({item.quantity})</span>
                                      )}
                                    </div>
                                    <div className="flex gap-2 items-center text-sm">
                                      {item.day && (
                                        <span className="text-gray-600">
                                          📅 {item.day.name}
                                        </span>
                                      )}
                                      {(item.glutenFree || item.dairyFree || item.vegetarian) && (
                                        <div className="flex gap-1">
                                          {item.glutenFree && (
                                            <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded font-medium">GF</span>
                                          )}
                                          {item.dairyFree && (
                                            <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded font-medium">DF</span>
                                          )}
                                          {item.vegetarian && (
                                            <span className="bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded font-medium">V</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="inline-block bg-yellow-200 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
                                      NO ASSIGNMENT
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Assigned Items Section */}
                    {team.items.filter(i => i.assignment).length > 0 && (
                      <div className="px-6 py-4">
                        <h5 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                          ✓ {team.items.filter(i => i.assignment).length} Assigned {team.items.filter(i => i.assignment).length === 1 ? 'Item' : 'Items'}
                        </h5>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {team.items
                            .filter(item => item.assignment)
                            .map((item) => (
                              <div
                                key={item.id}
                                className="bg-white rounded border border-gray-200 p-3 hover:shadow-sm transition-shadow"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-900 truncate">
                                      {item.name}
                                      {item.critical && (
                                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                                          CRITICAL
                                        </span>
                                      )}
                                    </div>
                                    {item.quantity && (
                                      <div className="text-sm text-gray-500">{item.quantity}</div>
                                    )}
                                  </div>
                                  {item.assignment.acknowledged && (
                                    <span className="flex-shrink-0 text-lg" title="Acknowledged">✓</span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-600">
                                    👤 {item.assignment.person.name}
                                  </span>
                                  {item.assignment.acknowledged ? (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                                      Acknowledged
                                    </span>
                                  ) : (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                      Pending
                                    </span>
                                  )}
                                </div>

                                <div className="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                  {item.day && (
                                    <span>📅 {item.day.name}</span>
                                  )}
                                  {(item.glutenFree || item.dairyFree || item.vegetarian) && (
                                    <div className="flex gap-1">
                                      {item.glutenFree && <span className="bg-blue-50 text-blue-600 px-1 py-0.5 rounded">GF</span>}
                                      {item.dairyFree && <span className="bg-blue-50 text-blue-600 px-1 py-0.5 rounded">DF</span>}
                                      {item.vegetarian && <span className="bg-green-50 text-green-600 px-1 py-0.5 rounded">V</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-bold mb-2">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Total Teams</div>
              <div className="text-2xl font-bold">{data.teams.length}</div>
            </div>
            <div>
              <div className="text-gray-600">Total Items</div>
              <div className="text-2xl font-bold">
                {data.teams.reduce((sum, t) => sum + t.itemCount, 0)}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Unassigned</div>
              <div className="text-2xl font-bold text-yellow-600">
                {data.teams.reduce((sum, t) => sum + t.unassignedCount, 0)}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Critical Gaps</div>
              <div className="text-2xl font-bold text-red-600">
                {data.teams.reduce((sum, t) => sum + t.criticalGapCount, 0)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
