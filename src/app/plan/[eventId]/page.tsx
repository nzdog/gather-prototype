'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, AlertCircle } from 'lucide-react';
import ConflictList from '@/components/plan/ConflictList';
import { Conflict } from '@prisma/client';

interface Event {
  id: string;
  name: string;
  status: string;
  occasionType: string;
  guestCount: number | null;
  startDate: string;
  endDate: string;
}

interface Team {
  id: string;
  name: string;
  scope: string;
  coordinator: {
    id: string;
    name: string;
  };
  _count: {
    items: number;
  };
}

export default function PlanEditorPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadEvent();
    loadTeams();
    loadConflicts();
  }, [eventId]);

  const loadEvent = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (!response.ok) throw new Error('Failed to load event');
      const data = await response.json();
      setEvent(data.event);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/teams`);
      if (!response.ok) throw new Error('Failed to load teams');
      const data = await response.json();
      setTeams(data.teams);
    } catch (err: any) {
      console.error('Error loading teams:', err);
    }
  };

  const loadConflicts = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/conflicts`);
      if (!response.ok) throw new Error('Failed to load conflicts');
      const data = await response.json();
      setConflicts(data.conflicts || []);
    } catch (err: any) {
      console.error('Error loading conflicts:', err);
    }
  };

  const handleCheckPlan = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/check`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to check plan');

      // Reload conflicts after check
      await loadConflicts();

      alert('Plan check complete! See conflicts below.');
    } catch (err: any) {
      console.error('Error checking plan:', err);
      alert('Failed to check plan');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading event...</div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
          <h2 className="text-xl font-semibold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error || 'Event not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  {event.status}
                </span>
                <span>{event.occasionType}</span>
                {event.guestCount && <span>{event.guestCount} guests</span>}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/h/${eventId}`)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                View as Host
              </button>
              <button
                onClick={handleCheckPlan}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Check Plan
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="col-span-8">
            {/* Conflicts */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Plan Assessment
              </h2>
              <ConflictList
                eventId={eventId}
                conflicts={conflicts}
                onConflictsChanged={loadConflicts}
              />
            </div>

            {/* Teams */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Teams</h2>
                <button className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Team
                </button>
              </div>

              {teams.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No teams yet. Add your first team to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {teams.map((team) => (
                    <div key={team.id} className="border border-gray-200 rounded-lg">
                      <button
                        onClick={() => toggleTeam(team.id)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          {expandedTeams.has(team.id) ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                          <div className="text-left">
                            <h3 className="font-medium text-gray-900">
                              {team.name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {team.coordinator.name} • {team._count.items} items
                            </p>
                          </div>
                        </div>
                      </button>

                      {expandedTeams.has(team.id) && (
                        <div className="px-4 py-3 bg-gray-50 border-t">
                          <p className="text-sm text-gray-600 mb-3">{team.scope}</p>
                          <button className="text-sm text-blue-600 hover:text-blue-700">
                            View Items →
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="col-span-4">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Event Details
              </h2>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-600">Status</dt>
                  <dd className="font-medium text-gray-900">{event.status}</dd>
                </div>

                <div>
                  <dt className="text-gray-600">Occasion</dt>
                  <dd className="font-medium text-gray-900">
                    {event.occasionType}
                  </dd>
                </div>

                <div>
                  <dt className="text-gray-600">Dates</dt>
                  <dd className="font-medium text-gray-900">
                    {new Date(event.startDate).toLocaleDateString()} -{' '}
                    {new Date(event.endDate).toLocaleDateString()}
                  </dd>
                </div>

                {event.guestCount && (
                  <div>
                    <dt className="text-gray-600">Guest Count</dt>
                    <dd className="font-medium text-gray-900">
                      {event.guestCount}
                    </dd>
                  </div>
                )}

                <div className="pt-3 border-t">
                  <dt className="text-gray-600">Teams</dt>
                  <dd className="font-medium text-gray-900">{teams.length}</dd>
                </div>

                <div>
                  <dt className="text-gray-600">Items</dt>
                  <dd className="font-medium text-gray-900">
                    {teams.reduce((sum, team) => sum + team._count.items, 0)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 pt-6 border-t">
                <button
                  onClick={() => router.push(`/plan/${eventId}/settings`)}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Edit Event Details
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
