'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  MapPin,
  Home,
  Check,
  Grid3x3,
  List,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import ItemStatusBadges from '@/components/plan/ItemStatusBadges';
import { DropOffDisplay } from '@/components/shared/DropOffDisplay';

interface Assignment {
  id: string;
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  item: {
    id: string;
    name: string;
    quantity: string | null;
    description: string | null;
    critical: boolean;
    glutenFree: boolean;
    dairyFree: boolean;
    vegetarian: boolean;
    notes: string | null;
    dropOffAt: string | null;
    dropOffLocation: string | null;
    dropOffNote: string | null;
    day: { id: string; name: string; date: string } | null;
  };
}

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
  day: { id: string; name: string; date: string } | null;
  dropOffLocation: string | null;
  dropOffAt: string | null;
  dropOffNote: string | null;
  assignment: {
    id: string;
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED';
    person: { id: string; name: string };
  } | null;
}

interface TeamMember {
  id: string;
  name: string;
}

interface OtherTeam {
  id: string;
  name: string;
  status: string;
}

interface CoordinatorData {
  person: {
    id: string;
    name: string;
  };
  event: {
    id: string;
    name: string;
    status: string;
    guestCount: number | null;
  };
  team: {
    id: string;
    name: string;
    scope: string | null;
  };
  host: {
    name: string;
  } | null;
  myStatus: string;
  items: Item[];
  teamMembers: TeamMember[];
  otherTeams: OtherTeam[];
  myAssignments: Assignment[];
}

function getFriendlyErrorMessage(error: string | null): string {
  if (!error)
    return 'Something went wrong loading your page. Try refreshing — if it keeps happening, ask your host to send you a new link.';

  const lowerError = error.toLowerCase();
  if (lowerError.includes('expired') || lowerError.includes('invalid')) {
    return 'This link may have expired. Ask your host to send you a new one.';
  }
  if (lowerError.includes('not found') || lowerError.includes('404')) {
    return "We couldn't find your coordinator page. Check you're using the right link, or ask your host to resend it.";
  }
  return 'Something went wrong loading your page. Try refreshing — if it keeps happening, ask your host to send you a new link.';
}

export default function CoordinatorView() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<CoordinatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const isInitialLoad = useRef(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    quantity: '',
    critical: false,
    glutenFree: false,
    dairyFree: false,
    vegetarian: false,
    notes: '',
    dropOffLocation: '',
    dropOffNote: '',
    dayId: '',
  });

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/c/${token}`);
      if (!response.ok) {
        throw new Error('Failed to load data');
      }
      const result = await response.json();
      setData(result);

      // Only initialize collapsed state on first load
      if (isInitialLoad.current) {
        const allItemIds = new Set<string>();
        result.items.forEach((item: any) => allItemIds.add(item.id));
        if (result.myAssignments) {
          result.myAssignments.forEach((assignment: any) => allItemIds.add(assignment.id));
        }
        setCollapsedItems(allItemIds);
        isInitialLoad.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (itemId: string, personId: string) => {
    if (data?.event.status === 'FROZEN') {
      alert(`Event is frozen. Contact ${data.host?.name || 'the host'} to make changes.`);
      return;
    }
    try {
      const response = await fetch(`/api/c/${token}/items/${itemId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to assign');
      }
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign';
      alert(message);
    }
  };

  const handleUnassign = async (itemId: string) => {
    if (data?.event.status === 'FROZEN') {
      alert(`Event is frozen. Contact ${data.host?.name || 'the host'} to make changes.`);
      return;
    }
    try {
      const response = await fetch(`/api/c/${token}/items/${itemId}/assign`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to unassign');
      }
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unassign';
      alert(message);
    }
  };

  const formatDropOff = (dropOffAt: string | null, dropOffNote: string | null) => {
    if (dropOffNote) return dropOffNote;
    if (!dropOffAt) return null;

    const date = new Date(dropOffAt);
    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const toggleItemCollapse = (itemId: string) => {
    const newCollapsed = new Set(collapsedItems);
    if (newCollapsed.has(itemId)) {
      newCollapsed.delete(itemId);
    } else {
      newCollapsed.add(itemId);
    }
    setCollapsedItems(newCollapsed);
  };

  const toggleAllItems = () => {
    if (collapsedItems.size === 0) {
      // All expanded, collapse all
      const allIds = new Set(data?.items.map((item) => item.id) || []);
      setCollapsedItems(allIds);
    } else {
      // Some or all collapsed, expand all
      setCollapsedItems(new Set());
    }
  };

  const handleCreateItem = async () => {
    if (!newItem.name.trim()) {
      alert('Item name is required');
      return;
    }

    try {
      const response = await fetch(`/api/c/${token}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItem.name,
          quantity: newItem.quantity || null,
          critical: newItem.critical,
          glutenFree: newItem.glutenFree,
          dairyFree: newItem.dairyFree,
          vegetarian: newItem.vegetarian,
          notes: newItem.notes || null,
          dropOffLocation: newItem.dropOffLocation || null,
          dropOffNote: newItem.dropOffNote || null,
          dayId: newItem.dayId || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create item');
      }

      // Reset form and close modal
      setNewItem({
        name: '',
        quantity: '',
        critical: false,
        glutenFree: false,
        dairyFree: false,
        vegetarian: false,
        notes: '',
        dropOffLocation: '',
        dropOffNote: '',
        dayId: '',
      });
      setShowAddModal(false);

      // Refresh data
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create item');
    }
  };

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!confirm(`Delete "${itemName}"?\n\nThis will also remove any assignment for this item.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/c/${token}/items/${itemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete item');
      }

      // Refresh data
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete item');
    }
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
        <div className="text-red-600 max-w-md text-center px-4">
          {getFriendlyErrorMessage(error)}
        </div>
      </div>
    );
  }

  const unassignedItems = data.items.filter((i) => !i.assignment);
  const unassignedCount = unassignedItems.length;
  const criticalCount = unassignedItems.filter((i) => i.critical).length;

  // Sort items: critical unassigned first, then regular unassigned, then assigned
  const sortedItems = [...data.items].sort((a, b) => {
    const aUnassigned = !a.assignment;
    const bUnassigned = !b.assignment;
    if (aUnassigned && a.critical && !(bUnassigned && b.critical)) return -1;
    if (bUnassigned && b.critical && !(aUnassigned && a.critical)) return 1;
    if (aUnassigned && !bUnassigned) return -1;
    if (bUnassigned && !aUnassigned) return 1;
    return 0;
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <a
          href="/demo"
          className="inline-flex items-center gap-1 text-sm text-accent hover:text-sage-800 mb-3"
        >
          <Home className="size-4" />
          Back to Demo
        </a>
        <div className="text-sm font-medium text-gray-500 mb-1">{data.event.name}</div>
        <h1 className="text-2xl font-bold text-gray-900">{data.team.name}</h1>
        <p className="text-sm text-gray-600 mt-1">Coordinator: {data.person.name}</p>
        {data.team.scope && <p className="text-sm text-gray-500 mt-1">{data.team.scope}</p>}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-1 rounded">
            Coordinating
          </span>
          {data.event.guestCount && (
            <span className="text-sm text-gray-500">{data.event.guestCount} guests</span>
          )}
        </div>
      </div>

      {/* Frozen State Banner */}
      {data.event.status === 'FROZEN' && (
        <div className="bg-sage-50 px-6 py-4 flex items-start gap-3">
          <span className="text-2xl">🔒</span>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-sage-900">Plan is FROZEN</h3>
            <p className="text-xs text-sage-800 mt-1">
              Contact {data.host?.name || 'the host'} to request changes.
            </p>
          </div>
        </div>
      )}

      {/* Status Bar */}
      {data.event.status !== 'FROZEN' && (
        <>
          {criticalCount > 0 ? (
            <div className="bg-red-50 px-6 py-4 flex items-center gap-3">
              <AlertCircle className="size-5 text-red-500" />
              <span className="font-semibold text-red-900">
                {criticalCount} critical {criticalCount === 1 ? 'item needs' : 'items need'}{' '}
                assignment
              </span>
            </div>
          ) : unassignedCount > 0 ? (
            <div className="bg-amber-50 px-6 py-4 flex items-center gap-3">
              <AlertCircle className="size-5 text-amber-500" />
              <span className="font-semibold text-amber-900">
                {unassignedCount} {unassignedCount === 1 ? 'item needs' : 'items need'} assignment
              </span>
            </div>
          ) : (
            <div className="bg-green-50 px-6 py-4 flex items-center gap-3">
              <div className="size-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">
                ✓
              </div>
              <span className="font-semibold text-green-900">All items assigned</span>
            </div>
          )}
        </>
      )}

      {/* Items List */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wide text-gray-500">Team Items</h2>
          <div className="flex items-center gap-2">
            {data.event.status !== 'FROZEN' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent text-white hover:bg-accent-dark rounded-lg transition-colors"
              >
                <Plus className="size-4" />
                Add Item
              </button>
            )}
            {data && data.items.length > 0 && (
              <button
                onClick={toggleAllItems}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {collapsedItems.size === 0 ? (
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
        <div
          className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start' : 'flex flex-col gap-4 items-start'}`}
        >
          {sortedItems.map((item) => (
            <div
              key={item.id}
              className={`bg-white border border-gray-200 rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow ${
                viewMode === 'list' ? 'w-full max-w-md' : ''
              }`}
            >
              {/* Card Header - Always Visible */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {!item.assignment && item.critical && (
                      <AlertCircle className="size-4 text-red-500 flex-shrink-0" />
                    )}
                    <span className="font-semibold text-gray-900">{item.name}</span>
                    {item.quantity && (
                      <span className="text-gray-500 flex-shrink-0">×{item.quantity}</span>
                    )}
                    {!item.assignment && item.critical && (
                      <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded flex-shrink-0">
                        CRITICAL
                      </span>
                    )}
                  </div>

                  {/* Status Badges */}
                  <div className="mb-2">
                    <ItemStatusBadges assignment={item.assignment} />
                  </div>

                  {/* Dietary tags - Always Visible */}
                  {(item.glutenFree || item.dairyFree || item.vegetarian) && (
                    <div className="flex gap-2 mb-2">
                      {item.glutenFree && (
                        <span className="bg-sage-100 text-sage-800 text-xs px-2 py-1 rounded">
                          GF
                        </span>
                      )}
                      {item.dairyFree && (
                        <span className="bg-sage-100 text-sage-800 text-xs px-2 py-1 rounded">
                          DF
                        </span>
                      )}
                      {item.vegetarian && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                          V
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Collapse Toggle Button */}
                <button
                  onClick={() => toggleItemCollapse(item.id)}
                  className="ml-2 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0 border border-gray-300"
                  title={collapsedItems.has(item.id) ? 'Expand' : 'Collapse'}
                >
                  {collapsedItems.has(item.id) ? (
                    <ChevronRight className="size-5 text-gray-700" />
                  ) : (
                    <ChevronDown className="size-5 text-gray-700" />
                  )}
                </button>
              </div>

              {/* Collapsible Content */}
              {!collapsedItems.has(item.id) && (
                <div className="space-y-2">
                  {/* Day and drop-off details */}
                  <div className="space-y-2">
                    {item.day && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="size-4 text-gray-400" />
                        <span className="text-gray-900">{item.day.name}</span>
                      </div>
                    )}
                    <DropOffDisplay
                      dropOffLocation={item.dropOffLocation}
                      dropOffAt={item.dropOffAt}
                      dropOffNote={item.dropOffNote}
                      variant="inline"
                      showIcons={true}
                    />
                  </div>

                  {/* Notes */}
                  {item.notes && (
                    <div className="text-sm text-gray-600 mb-2 italic">{item.notes}</div>
                  )}

                  {/* Assignment control */}
                  <div className="mt-3">
                    {item.assignment ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {item.assignment.person.name}
                          </span>
                          {data.event.status !== 'FROZEN' && (
                            <button
                              onClick={() => handleUnassign(item.id)}
                              className="text-sm text-red-600 hover:text-red-800"
                            >
                              Unassign
                            </button>
                          )}
                        </div>
                        {item.assignment.response === 'ACCEPTED' ? (
                          <div className="inline-flex items-center gap-1.5 bg-green-100 text-green-800 px-3 py-1.5 rounded-full text-sm font-semibold">
                            <Check className="size-4" />
                            Confirmed
                          </div>
                        ) : item.assignment.response === 'DECLINED' ? (
                          <div className="inline-flex items-center gap-1.5 bg-red-100 text-red-800 px-3 py-1.5 rounded-full text-sm font-semibold">
                            <AlertCircle className="size-4" />
                            Declined
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full text-sm font-semibold">
                            <AlertCircle className="size-4" />
                            Awaiting confirmation
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {data.event.status !== 'FROZEN' ? (
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAssign(item.id, e.target.value);
                              }
                            }}
                            className="text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-gray-400 transition-colors"
                            defaultValue=""
                          >
                            <option value="">Assign to...</option>
                            {data.teamMembers.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm font-medium text-amber-600">UNASSIGNED</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  {data.event.status !== 'FROZEN' && (
                    <div className="pt-3 mt-3 border-t border-gray-200">
                      <button
                        onClick={() => handleDeleteItem(item.id, item.name)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="size-4" />
                        Delete Item
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Your Assignments */}
      {data.myAssignments && data.myAssignments.length > 0 && (
        <div className="px-4 md:px-6 py-4 bg-sage-50 border-t-2 border-sage-200">
          <h2 className="text-sm uppercase tracking-wide text-sage-900 font-bold mb-3">
            Your Personal Assignments
          </h2>
          <div
            className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start' : 'flex flex-col gap-4 items-start'}`}
          >
            {data.myAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className={`bg-white rounded-lg p-4 shadow-sm border ${
                  viewMode === 'list' ? 'w-full max-w-md' : ''
                } ${assignment.response === 'ACCEPTED' ? 'border-green-300' : assignment.response === 'DECLINED' ? 'border-red-300' : 'border-blue-300'}`}
              >
                {/* Card Header - Always Visible */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 text-lg">
                        {assignment.item.name}
                      </h3>
                      {assignment.item.quantity && (
                        <span className="text-gray-500 flex-shrink-0">
                          ×{assignment.item.quantity}
                        </span>
                      )}
                      {assignment.item.critical && (
                        <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded flex-shrink-0">
                          CRITICAL
                        </span>
                      )}
                    </div>

                    {/* Dietary tags - Always Visible */}
                    {(assignment.item.glutenFree ||
                      assignment.item.dairyFree ||
                      assignment.item.vegetarian) && (
                      <div className="flex gap-2">
                        {assignment.item.glutenFree && (
                          <span className="bg-sage-100 text-sage-800 text-xs px-2 py-1 rounded">
                            GF
                          </span>
                        )}
                        {assignment.item.dairyFree && (
                          <span className="bg-sage-100 text-sage-800 text-xs px-2 py-1 rounded">
                            DF
                          </span>
                        )}
                        {assignment.item.vegetarian && (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                            V
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Collapse Toggle Button */}
                  <button
                    onClick={() => toggleItemCollapse(assignment.id)}
                    className="ml-2 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0 border border-gray-300"
                    title={collapsedItems.has(assignment.id) ? 'Expand' : 'Collapse'}
                  >
                    {collapsedItems.has(assignment.id) ? (
                      <ChevronRight className="size-5 text-gray-700" />
                    ) : (
                      <ChevronDown className="size-5 text-gray-700" />
                    )}
                  </button>
                </div>

                {/* Collapsible Content */}
                {!collapsedItems.has(assignment.id) && (
                  <div>
                    {/* Drop-off Details */}
                    <div className="space-y-2 mb-3">
                      {assignment.item.day && (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="size-4 text-gray-400" />
                          <span className="text-gray-900">
                            {assignment.item.day.name}
                            {formatDropOff(
                              assignment.item.dropOffAt,
                              assignment.item.dropOffNote
                            ) &&
                              `, ${formatDropOff(assignment.item.dropOffAt, assignment.item.dropOffNote)}`}
                          </span>
                        </div>
                      )}
                      {assignment.item.dropOffLocation && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="size-4 text-gray-400" />
                          <span className="text-gray-900">{assignment.item.dropOffLocation}</span>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {assignment.item.notes && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-sm text-gray-600">{assignment.item.notes}</p>
                      </div>
                    )}

                    {/* Response Status */}
                    {assignment.response === 'ACCEPTED' ? (
                      <div className="flex items-center justify-center gap-2 text-green-600 font-medium py-2.5">
                        <Check className="size-5" />
                        Accepted
                      </div>
                    ) : assignment.response === 'DECLINED' ? (
                      <div className="flex items-center justify-center gap-2 text-red-600 font-medium py-2.5">
                        <AlertCircle className="size-5" />
                        Declined
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-amber-600 font-medium py-2.5">
                        <AlertCircle className="size-5" />
                        Awaiting your response
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Teams */}
      {data.otherTeams.length > 0 && (
        <div className="bg-white border-t-2 border-gray-200 px-6 py-4">
          <h2 className="text-sm uppercase tracking-wide text-gray-500 mb-3">Other Teams</h2>
          <div className="grid grid-cols-2 gap-2">
            {data.otherTeams.map((team) => (
              <div key={team.id} className="flex items-center gap-2">
                <div
                  className={`size-2 rounded-full ${
                    team.status === 'SORTED'
                      ? 'bg-green-500'
                      : team.status === 'CRITICAL_GAP'
                        ? 'bg-red-500'
                        : 'bg-amber-500'
                  }`}
                />
                <span className="text-sm text-gray-700">{team.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add New Item</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="size-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., Potato salad"
                />
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="text"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., 2 large bowls, Plenty"
                />
              </div>

              {/* Day */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                <select
                  value={newItem.dayId}
                  onChange={(e) => setNewItem({ ...newItem, dayId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Select day...</option>
                  {data.items[0]?.day && (
                    <option value={data.items[0].day.id}>{data.items[0].day.name}</option>
                  )}
                </select>
              </div>

              {/* Drop-off Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Drop-off Location
                </label>
                <input
                  type="text"
                  value={newItem.dropOffLocation}
                  onChange={(e) => setNewItem({ ...newItem, dropOffLocation: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., Main kitchen"
                />
              </div>

              {/* Drop-off Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Drop-off Note
                </label>
                <input
                  type="text"
                  value={newItem.dropOffNote}
                  onChange={(e) => setNewItem({ ...newItem, dropOffNote: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., Before 5pm"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={newItem.notes}
                  onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent"
                  rows={3}
                  placeholder="Additional information..."
                />
              </div>

              {/* Checkboxes */}
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newItem.critical}
                    onChange={(e) => setNewItem({ ...newItem, critical: e.target.checked })}
                    className="rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm font-medium text-gray-700">Critical Item</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newItem.glutenFree}
                    onChange={(e) => setNewItem({ ...newItem, glutenFree: e.target.checked })}
                    className="rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-gray-700">Gluten Free</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newItem.dairyFree}
                    onChange={(e) => setNewItem({ ...newItem, dairyFree: e.target.checked })}
                    className="rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-gray-700">Dairy Free</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newItem.vegetarian}
                    onChange={(e) => setNewItem({ ...newItem, vegetarian: e.target.checked })}
                    className="rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-gray-700">Vegetarian</span>
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateItem}
                className="px-4 py-2 text-sm bg-accent text-white hover:bg-accent-dark rounded-lg transition-colors"
              >
                Create Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <p className="text-center text-sm text-gray-400">
          <a href="/privacy" className="hover:text-gray-600 hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
