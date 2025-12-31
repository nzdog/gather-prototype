'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, MapPin, ArrowLeft, Check, AlertCircle, ChevronDown, ChevronRight, Grid3x3, List, Maximize2, Minimize2 } from 'lucide-react';

interface Item {
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
  day: {
    id: string;
    name: string;
    date: string;
  } | null;
  assignment: {
    id: string;
    acknowledged: boolean;
    person: {
      id: string;
      name: string;
    };
  } | null;
}

interface TeamData {
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  team: {
    id: string;
    name: string;
    coordinator: {
      id: string;
      name: string;
    };
  };
  items: Item[];
}

export default function HostTeamView() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const teamId = params.teamId as string;
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const isInitialLoad = useRef(true);

  useEffect(() => {
    fetchData();
  }, [token, teamId]);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/h/${token}/team/${teamId}`);
      if (!response.ok) {
        throw new Error('Failed to load data');
      }
      const result = await response.json();
      setData(result);

      // Only initialize collapsed state on first load
      if (isInitialLoad.current) {
        const allItemIds = new Set<string>(result.items.map((item: any) => item.id));
        setCollapsedItems(allItemIds);
        isInitialLoad.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
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
      const allIds = new Set(data?.items.map(item => item.id) || []);
      setCollapsedItems(allIds);
    } else {
      // Some or all collapsed, expand all
      setCollapsedItems(new Set());
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
        <div className="text-red-600">Error: {error || 'Failed to load'}</div>
      </div>
    );
  }

  const sortedItems = [...data.items].sort((a, b) => {
    if (!a.assignment && b.assignment) return -1;
    if (a.assignment && !b.assignment) return 1;
    if (a.critical && !b.critical) return -1;
    if (!a.critical && b.critical) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        {/* Back Button */}
        <button
          onClick={() => router.push(`/h/${token}`)}
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4 font-medium"
        >
          <ArrowLeft className="size-5" />
          Back to Host View
        </button>

        <div className="text-sm font-medium text-gray-500 mb-1">{data.event.name}</div>
        <h1 className="text-2xl font-bold text-gray-900">{data.team.name}</h1>
        <div className="text-sm text-gray-500 mt-1">
          Coordinator: {data.team.coordinator.name}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wide text-gray-500">Team Items (Read Only)</h2>
          <div className="flex items-center gap-2">
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

        {data.items.length === 0 ? (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center">
            <p className="text-gray-600">No items yet</p>
          </div>
        ) : (
          <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start' : 'flex flex-col gap-4 items-start'}`}>
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
                      {item.quantity && <span className="text-gray-500 flex-shrink-0">×{item.quantity}</span>}
                      {!item.assignment && item.critical && (
                        <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded flex-shrink-0">
                          CRITICAL
                        </span>
                      )}
                    </div>

                    {/* Dietary tags - Always Visible */}
                    {(item.glutenFree || item.dairyFree || item.vegetarian) && (
                      <div className="flex gap-2">
                        {item.glutenFree && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">GF</span>
                        )}
                        {item.dairyFree && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">DF</span>
                        )}
                        {item.vegetarian && (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">V</span>
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
                    {/* Day and location */}
                    <div className="text-sm text-gray-500 flex items-center gap-3">
                      {item.day && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-4" />
                          {item.day.name}
                        </span>
                      )}
                      {item.dropOffLocation && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-4" />
                          {item.dropOffLocation}
                        </span>
                      )}
                    </div>

                    {/* Notes */}
                    {item.notes && (
                      <div className="text-sm text-gray-600 mb-2 italic">{item.notes}</div>
                    )}

                    {/* Assignment Status - Read Only */}
                    <div className="mt-3">
                      {item.assignment ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {item.assignment.person.name}
                            </span>
                            {item.assignment.acknowledged ? (
                              <div className="inline-flex items-center gap-1.5 bg-green-100 text-green-800 px-3 py-1.5 rounded-full text-sm font-semibold">
                                <Check className="size-4" />
                                Confirmed
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full text-sm font-semibold">
                                <AlertCircle className="size-4" />
                                Awaiting confirmation
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-500">
                          Unassigned
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
