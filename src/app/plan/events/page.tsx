'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Users, ListTodo, ChevronRight } from 'lucide-react';

interface Event {
  id: string;
  name: string;
  occasionType: string;
  status: string;
  startDate: string;
  endDate: string;
  guestCount: number;
  createdAt: string;
  _count: {
    teams: number;
    days: number;
  };
}

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [hostId, setHostId] = useState<string>('');

  useEffect(() => {
    // Get hostId from localStorage
    const storedHostId = localStorage.getItem('gather_hostId');
    if (storedHostId) {
      setHostId(storedHostId);
      loadEvents(storedHostId);
    } else {
      // Fallback to default
      const defaultHostId = 'cmjwbjrpw0000n99xs11r44qh';
      setHostId(defaultHostId);
      loadEvents(defaultHostId);
    }
  }, []);

  const loadEvents = async (hostId: string) => {
    try {
      const response = await fetch(`/api/events?hostId=${hostId}`);
      if (!response.ok) throw new Error('Failed to load events');
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      DRAFT: 'bg-gray-100 text-gray-800',
      CONFIRMING: 'bg-blue-100 text-blue-800',
      FROZEN: 'bg-purple-100 text-purple-800',
      COMPLETE: 'bg-green-100 text-green-800',
    };
    return styles[status as keyof typeof styles] || styles.DRAFT;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    return start === end ? start : `${start} - ${end}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading events...</p>
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
              <h1 className="text-3xl font-bold text-gray-900">Your Events</h1>
              <p className="mt-2 text-gray-600">
                Manage and access all your events
              </p>
            </div>
            <button
              onClick={() => router.push('/plan/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create New Event
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {events.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No events yet</h2>
            <p className="text-gray-600 mb-6">
              Create your first event to get started with planning
            </p>
            <button
              onClick={() => router.push('/plan/new')}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create New Event
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={event.id}
                onClick={() => router.push(`/plan/${event.id}`)}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-xl font-semibold text-gray-900">{event.name}</h2>
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadge(
                          event.status
                        )}`}
                      >
                        {event.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDateRange(event.startDate, event.endDate)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>{event.guestCount} guests</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ListTodo className="w-4 h-4" />
                        <span>{event._count.teams} teams</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{event.occasionType}</span>
                      <span>Created {formatDate(event.createdAt)}</span>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
