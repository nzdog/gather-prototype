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
  day: { id: string; name: string; date: string } | null;
  assignment: {
    id: string;
    acknowledged: boolean;
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
  event: {
    id: string;
    name: string;
    status: string;
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
}

export default function CoordinatorView() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<CoordinatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SORTED':
        return <span className="text-green-600">✓</span>;
      case 'CRITICAL_GAP':
        return <span className="text-red-600">⚠</span>;
      default:
        return <span className="text-yellow-600">⚠</span>;
    }
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

  const unassignedCount = data.items.filter(i => i.status === 'UNASSIGNED').length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Frozen State Banner */}
        {data.event.status === 'FROZEN' && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <span className="text-2xl">🔒</span>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-bold text-blue-900">
                  Event Frozen
                </h3>
                <p className="text-sm text-blue-800 mt-1">
                  This event has been frozen. You cannot make changes to assignments.
                  {data.host && (
                    <span className="block mt-1 font-medium">
                      Contact {data.host.name} (event host) to request changes.
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold mb-2">{data.team.name}</h1>
          {data.team.scope && (
            <p className="text-gray-600 mb-4">{data.team.scope}</p>
          )}
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-gray-600">Event:</span>{' '}
              <span className="font-medium">{data.event.status}</span>
            </div>
            <div>
              <span className="text-gray-600">Team:</span>{' '}
              <span className="font-medium">
                {unassignedCount > 0 ? `${unassignedCount} gaps` : 'All sorted'}
              </span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-4 mb-6">
          <h2 className="text-xl font-bold">Items</h2>

          {data.items.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-lg shadow-sm p-4 ${
                item.status === 'UNASSIGNED' ? 'border-l-4 border-yellow-500' : 'border-l-4 border-green-500'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold">
                    {item.status === 'UNASSIGNED' && '⚠ '}
                    {item.name}
                    {item.critical && ' [!]'}
                  </h3>
                  {item.quantity && (
                    <p className="text-sm text-gray-600">{item.quantity}</p>
                  )}
                  {item.day && (
                    <p className="text-sm text-gray-600">{item.day.name}</p>
                  )}
                </div>
                {item.critical && (
                  <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded">
                    CRITICAL
                  </span>
                )}
              </div>

              {/* Dietary tags */}
              {(item.glutenFree || item.dairyFree || item.vegetarian) && (
                <div className="flex gap-2 mb-3">
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

              {/* Assignment control */}
              <div className="mt-3">
                {item.assignment ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm">
                      ✓ {item.assignment.person.name}
                      {item.assignment.acknowledged && ' (acknowledged)'}
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
                ) : (
                  <div>
                    {data.event.status !== 'FROZEN' ? (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssign(item.id, e.target.value);
                          }
                        }}
                        className="text-sm border rounded px-2 py-1"
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
                      <span className="text-sm text-gray-600">UNASSIGNED</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Other Teams */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-bold mb-4">Other Teams</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.otherTeams.map((team) => (
              <div key={team.id} className="flex items-center gap-2">
                {getStatusBadge(team.status)}
                <span className="text-sm">{team.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
