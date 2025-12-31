'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Lock, Users, Home, Grid3x3, List, ChevronDown, ChevronRight, Eye, Maximize2, Minimize2 } from 'lucide-react';

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
    guestCount: number | null;
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
  const [editingGuestCount, setEditingGuestCount] = useState(false);
  const [guestCountValue, setGuestCountValue] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

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

      // Only initialize collapsed state on first load
      if (isInitialLoad.current) {
        const allTeamIds = new Set<string>(result.teams.map((team: any) => team.id));
        setCollapsedTeams(allTeamIds);
        isInitialLoad.current = false;
      }
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

      if (unfreezeReason === null) {
        return;
      }

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

  const handleEditGuestCount = () => {
    setGuestCountValue(data?.event.guestCount?.toString() || '');
    setEditingGuestCount(true);
  };

  const handleSaveGuestCount = async () => {
    if (!data) return;

    const newCount = guestCountValue.trim() === '' ? null : parseInt(guestCountValue, 10);

    if (guestCountValue.trim() !== '' && (isNaN(newCount!) || newCount! < 0)) {
      alert('Please enter a valid number');
      return;
    }

    setUpdating(true);
    try {
      const response = await fetch(`/api/h/${token}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestCount: newCount }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update guest count');
      }

      setEditingGuestCount(false);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update guest count');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelEditGuestCount = () => {
    setEditingGuestCount(false);
    setGuestCountValue('');
  };

  const toggleTeamCollapse = (teamId: string) => {
    const newCollapsed = new Set(collapsedTeams);
    if (newCollapsed.has(teamId)) {
      newCollapsed.delete(teamId);
    } else {
      newCollapsed.add(teamId);
    }
    setCollapsedTeams(newCollapsed);
  };

  const toggleAllTeams = () => {
    if (collapsedTeams.size === 0) {
      // All expanded, collapse all
      const allIds = new Set(data?.teams.map(team => team.id) || []);
      setCollapsedTeams(allIds);
    } else {
      // Some or all collapsed, expand all
      setCollapsedTeams(new Set());
    }
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const formatter = new Intl.DateTimeFormat('en-NZ', {
      month: 'short',
      day: 'numeric',
      timeZone: 'Pacific/Auckland'
    });
    return `${formatter.format(start)}-${formatter.format(end).split(' ')[1]}`;
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-red-600">Error: {error || 'Failed to load'}</div>
      </div>
    );
  }

  const nextStatus = getNextStatus(data.event.status);
  const totalGaps = data.teams.reduce((sum, t) => sum + t.unassignedCount, 0);

  // Sort teams: critical gaps first, then regular gaps, then sorted
  const sortedTeams = [...data.teams].sort((a, b) => {
    if (a.status === 'CRITICAL_GAP' && b.status !== 'CRITICAL_GAP') return -1;
    if (b.status === 'CRITICAL_GAP' && a.status !== 'CRITICAL_GAP') return 1;
    if (a.status === 'GAP' && b.status === 'SORTED') return -1;
    if (b.status === 'GAP' && a.status === 'SORTED') return 1;
    return 0;
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <a href="/" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-3">
          <Home className="size-4" />
          Back to Demo
        </a>
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{data.event.name}</h1>
          <a
            href={`/h/${token}/audit`}
            className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition"
          >
            📋 Audit Log
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {formatDateRange(data.event.startDate, data.event.endDate)}
          </span>
          <span className="text-gray-300">·</span>
          {editingGuestCount ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={guestCountValue}
                onChange={(e) => setGuestCountValue(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded w-20 text-sm"
                placeholder="Guests"
                min="0"
                disabled={updating}
              />
              <button
                onClick={handleSaveGuestCount}
                disabled={updating}
                className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:bg-gray-300"
              >
                Save
              </button>
              <button
                onClick={handleCancelEditGuestCount}
                disabled={updating}
                className="px-2 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 disabled:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleEditGuestCount}
              className="text-sm text-blue-600 hover:underline"
            >
              {data.event.guestCount ? `${data.event.guestCount} guests` : 'Add guest count'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {data.event.status}
          </span>
          {canUnfreeze(data.event.status) && (
            <button
              onClick={() => handleStatusChange('CONFIRMING')}
              disabled={updating}
              className="text-xs px-2 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-300"
            >
              Unfreeze
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {data.event.status !== 'COMPLETE' && (
        <>
          {data.criticalGapCount > 0 ? (
            <div className="bg-red-50 px-6 py-4 flex items-center gap-3">
              <AlertCircle className="size-6 text-red-500" />
              <span className="font-semibold text-red-900">
                {data.criticalGapCount} critical {data.criticalGapCount === 1 ? 'gap remains' : 'gaps remain'}
              </span>
            </div>
          ) : totalGaps > 0 ? (
            <div className="bg-amber-50 px-6 py-4 flex items-center gap-3">
              <div className="size-6 rounded-full bg-amber-500 flex items-center justify-center text-white text-sm">!</div>
              <span className="font-semibold text-amber-900">
                Ready to freeze ({totalGaps} non-critical {totalGaps === 1 ? 'gap' : 'gaps'})
              </span>
            </div>
          ) : (
            <div className="bg-green-50 px-6 py-4 flex items-center gap-3">
              <div className="size-6 rounded-full bg-green-500 flex items-center justify-center text-white text-sm">✓</div>
              <span className="font-semibold text-green-900">Ready to freeze</span>
            </div>
          )}
        </>
      )}

      {/* Teams List */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wide text-gray-500">Teams</h2>
          <div className="flex items-center gap-2">
            {data && data.teams.length > 0 && (
              <button
                onClick={toggleAllTeams}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {collapsedTeams.size === 0 ? (
                  <>
                    <Minimize2 className="size-4" />
                    Collapse All
                  </>
                ) : (
                  <>
                    <Maximize2 className="size-4" />
                    Expand All
                  </>
                )}
              </button>
            )}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Grid view"
            >
              <Grid3x3 className="size-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="List view"
            >
              <List className="size-4" />
            </button>
          </div>
          </div>
        </div>
        <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start' : 'flex flex-col gap-4 items-start'}`}>
          {sortedTeams.map((team) => {
            const assignedCount = team.items.filter(i => i.assignment).length;
            const acknowledgedCount = team.items.filter(i => i.assignment?.acknowledged).length;

            return (
              <div
                key={team.id}
                className={`bg-white rounded-lg border-2 shadow-sm hover:shadow-md transition-shadow p-5 ${
                  viewMode === 'list' ? 'w-full max-w-md' : ''
                } ${
                  team.status === 'CRITICAL_GAP'
                    ? 'border-red-300'
                    : team.status === 'GAP'
                    ? 'border-amber-300'
                    : 'border-green-300'
                }`}
              >
                {/* Card Header - Always Visible */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`size-3 rounded-full mt-1.5 flex-shrink-0 ${
                        team.status === 'CRITICAL_GAP'
                          ? 'bg-red-500'
                          : team.status === 'GAP'
                          ? 'bg-amber-500'
                          : 'bg-green-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 text-lg mb-1">{team.name}</h3>
                      <p className="text-sm text-gray-600">{team.coordinator.name}</p>
                    </div>
                  </div>

                  {/* Collapse Toggle Button */}
                  <button
                    onClick={() => toggleTeamCollapse(team.id)}
                    className="ml-2 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0 border border-gray-300"
                    title={collapsedTeams.has(team.id) ? 'Expand' : 'Collapse'}
                  >
                    {collapsedTeams.has(team.id) ? (
                      <ChevronRight className="size-5 text-gray-700" />
                    ) : (
                      <ChevronDown className="size-5 text-gray-700" />
                    )}
                  </button>
                </div>

                {/* Status Badge - Always Visible */}
                <div className="mb-3">
                  {team.status === 'CRITICAL_GAP' ? (
                    <div className="inline-flex items-center gap-1.5 bg-red-100 text-red-800 px-3 py-1.5 rounded-full text-sm font-semibold">
                      <AlertCircle className="size-4" />
                      {team.criticalGapCount} critical {team.criticalGapCount === 1 ? 'gap' : 'gaps'}
                    </div>
                  ) : team.status === 'GAP' ? (
                    <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full text-sm font-semibold">
                      <AlertCircle className="size-4" />
                      {team.unassignedCount} {team.unassignedCount === 1 ? 'gap' : 'gaps'}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 bg-green-100 text-green-800 px-3 py-1.5 rounded-full text-sm font-semibold">
                      <Users className="size-4" />
                      All assigned
                    </div>
                  )}
                </div>

                {/* Collapsible Content */}
                {!collapsedTeams.has(team.id) && (
                  <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Items</div>
                    <div className="text-xl font-bold text-gray-900">{team.itemCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Assigned</div>
                    <div className="text-xl font-bold text-green-600">{assignedCount}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Unassigned</div>
                    <div className={`text-xl font-bold ${team.unassignedCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {team.unassignedCount}
                    </div>
                  </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Confirmed</div>
                        <div className="text-xl font-bold text-blue-600">{acknowledgedCount}</div>
                      </div>
                    </div>

                    {/* View Items Button */}
                    <Link
                      href={`/h/${token}/team/${team.id}`}
                      className="mt-4 mx-auto w-1/3 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Eye className="size-3" />
                      View Items
                    </Link>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Action Bar */}
      {data.event.status !== 'COMPLETE' && nextStatus && (
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <button
            onClick={() => handleStatusChange(nextStatus)}
            disabled={updating || (nextStatus === 'FROZEN' && !data.freezeAllowed)}
            className={`w-full h-14 rounded-lg font-semibold transition-all ${
              updating || (nextStatus === 'FROZEN' && !data.freezeAllowed)
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {updating ? (
              'Updating...'
            ) : nextStatus === 'FROZEN' ? (
              <span className="flex items-center justify-center gap-2">
                <Lock className="size-5" />
                Freeze Event
              </span>
            ) : (
              `${nextStatus === 'COMPLETE' ? 'Mark as ' : ''}${nextStatus}`
            )}
          </button>
          {nextStatus === 'FROZEN' && !data.freezeAllowed && (
            <p className="text-center text-sm text-red-600 mt-2">
              Cannot freeze: {data.criticalGapCount} critical {data.criticalGapCount === 1 ? 'gap' : 'gaps'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
