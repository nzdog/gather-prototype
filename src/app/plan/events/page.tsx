'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Users, ListTodo, ChevronRight, Archive, Trash2 } from 'lucide-react';

interface Event {
  id: string;
  name: string;
  occasionType: string;
  status: string;
  archived: boolean;
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
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const response = await fetch('/api/events');
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
      CONFIRMING: 'bg-sage-100 text-sage-800',
      FROZEN: 'bg-sage-100 text-sage-800',
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

  const handleArchive = async (eventId: string, eventName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event card click

    if (!confirm(`Archive "${eventName}"?\n\nYou can restore it later from archived events.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/events/${eventId}/archive`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to archive event');

      // Reload events
      loadEvents();
    } catch (error) {
      console.error('Error archiving event:', error);
      alert('Failed to archive event. Please try again.');
    }
  };

  const handleDelete = async (eventId: string, eventName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event card click

    const confirmed = confirm(
      `⚠️ PERMANENTLY DELETE "${eventName}"?\n\n` +
      `This action CANNOT be undone.\n\n` +
      `All data will be lost:\n` +
      `• Teams and items\n` +
      `• People and assignments\n` +
      `• History and revisions\n\n` +
      `Type the event name to confirm deletion.`
    );

    if (!confirmed) return;

    const userInput = prompt(`Type "${eventName}" to confirm permanent deletion:`);
    if (userInput !== eventName) {
      alert('Event name did not match. Deletion cancelled.');
      return;
    }

    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete event');

      // Reload events
      loadEvents();
      alert(`"${eventName}" has been permanently deleted.`);
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event. Please try again.');
    }
  };

  const handleRestore = async (eventId: string, _eventName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event card click

    try {
      const response = await fetch(`/api/events/${eventId}/restore`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to restore event');

      // Reload events
      loadEvents();
    } catch (error) {
      console.error('Error restoring event:', error);
      alert('Failed to restore event. Please try again.');
    }
  };

  const filteredEvents = showArchived
    ? events.filter((e) => e.archived)
    : events.filter((e) => !e.archived);

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
            <div className="flex items-center gap-4">
              {/* Toggle for archived events */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="w-4 h-4 text-accent rounded focus:ring-2 focus:ring-accent"
                />
                <span className="text-sm text-gray-700">Show Archived</span>
              </label>
              <button
                onClick={() => router.push('/plan/new')}
                className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark"
              >
                Create New Event
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {filteredEvents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {showArchived ? 'No archived events' : 'No events yet'}
            </h2>
            <p className="text-gray-600 mb-6">
              {showArchived
                ? 'Archived events will appear here'
                : 'Create your first event to get started with planning'}
            </p>
            {!showArchived && (
              <button
                onClick={() => router.push('/plan/new')}
                className="px-6 py-3 bg-accent text-white rounded-md hover:bg-accent-dark"
              >
                Create New Event
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEvents.map((event) => (
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

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {event.archived ? (
                      <>
                        <button
                          onClick={(e) => handleRestore(event.id, event.name, e)}
                          className="px-3 py-2 text-sm bg-accent text-white rounded hover:bg-accent-dark flex items-center gap-2"
                          title="Restore event"
                        >
                          <Archive className="w-4 h-4" />
                          Restore
                        </button>
                        <button
                          onClick={(e) => handleDelete(event.id, event.name, e)}
                          className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
                          title="Permanently delete"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => handleArchive(event.id, event.name, e)}
                        className="px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-2"
                        title="Archive event"
                      >
                        <Archive className="w-4 h-4" />
                        Archive
                      </button>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
