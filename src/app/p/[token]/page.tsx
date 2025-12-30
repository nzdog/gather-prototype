'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Assignment {
  id: string;
  acknowledged: boolean;
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
    day: {
      id: string;
      name: string;
      date: string;
    } | null;
  };
}

interface ParticipantData {
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
  } | null;
  assignments: Assignment[];
}

export default function ParticipantView() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<ParticipantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/p/${token}`);
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

  const handleAcknowledge = async (assignmentId: string) => {
    try {
      const response = await fetch(`/api/p/${token}/ack/${assignmentId}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to acknowledge');
      }
      // Refresh data
      await fetchData();
    } catch (err) {
      console.error('Failed to acknowledge:', err);
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

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold mb-2">{data.event.name}</h1>
          <p className="text-gray-600">
            {new Date(data.event.startDate).toLocaleDateString('en-NZ')} – {new Date(data.event.endDate).toLocaleDateString('en-NZ')}
          </p>
          {data.team && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-600">You&apos;re part of:</p>
              <p className="font-semibold">{data.team.name}</p>
              <p className="text-sm text-gray-600">Coordinator: {data.team.coordinator.name}</p>
            </div>
          )}
        </div>

        {/* Assignments */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Your Assignments</h2>

          {data.assignments.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-600">
              No assignments yet
            </div>
          ) : (
            data.assignments.map((assignment) => (
              <div
                key={assignment.id}
                className={`bg-white rounded-lg shadow-sm p-6 ${
                  assignment.acknowledged ? 'border-l-4 border-green-500' : 'border-l-4 border-yellow-500'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{assignment.item.name}</h3>
                    {assignment.item.quantity && (
                      <p className="text-gray-600">{assignment.item.quantity}</p>
                    )}
                  </div>
                  {assignment.item.critical && (
                    <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded">
                      CRITICAL
                    </span>
                  )}
                </div>

                {/* Dietary tags */}
                {(assignment.item.glutenFree || assignment.item.dairyFree || assignment.item.vegetarian) && (
                  <div className="flex gap-2 mb-3">
                    {assignment.item.glutenFree && (
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">GF</span>
                    )}
                    {assignment.item.dairyFree && (
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">DF</span>
                    )}
                    {assignment.item.vegetarian && (
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">V</span>
                    )}
                  </div>
                )}

                {/* Day and drop-off */}
                <div className="space-y-2 mb-4 text-sm">
                  {assignment.item.day && (
                    <p className="text-gray-700">
                      <span className="font-medium">Day:</span> {assignment.item.day.name}
                    </p>
                  )}
                  {assignment.item.dropOffLocation && (
                    <p className="text-gray-700">
                      <span className="font-medium">Drop-off:</span> {assignment.item.dropOffLocation}
                      {formatDropOff(assignment.item.dropOffAt, assignment.item.dropOffNote) && (
                        <span> • {formatDropOff(assignment.item.dropOffAt, assignment.item.dropOffNote)}</span>
                      )}
                    </p>
                  )}
                  {assignment.item.notes && (
                    <p className="text-gray-600 italic">{assignment.item.notes}</p>
                  )}
                </div>

                {/* Acknowledge button */}
                {!assignment.acknowledged ? (
                  <button
                    onClick={() => handleAcknowledge(assignment.id)}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                  >
                    Confirm ✓
                  </button>
                ) : (
                  <div className="text-green-600 font-medium">✓ Acknowledged</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
