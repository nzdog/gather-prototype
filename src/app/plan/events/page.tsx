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
  const [eventToDelete, setEventToDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');

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

  const handleDelete = (eventId: string, eventName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event card click
    setEventToDelete({ id: eventId, name: eventName });
    setConfirmText(''); // Reset confirmation text
  };

  const executeDelete = async () => {
    if (!eventToDelete) return;

    try {
      const response = await fetch(`/api/events/${eventToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete event');

      // Reload events
      loadEvents();
      alert(`"${eventToDelete.name}" has been permanently deleted.`);
      closeDeleteModal();
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event. Please try again.');
    }
  };

  const closeDeleteModal = () => {
    setEventToDelete(null);
    setConfirmText(''); // Reset confirmation text when closing
  };

  const canDelete = confirmText === eventToDelete?.name;

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
              <p className="mt-2 text-gray-600">Manage and access all your events</p>
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

      {/* Delete Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-red-600 mb-2">⚠️ Permanently Delete Event</h2>
              <p className="text-gray-700 font-semibold mb-3">{eventToDelete.name}</p>
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                <p className="text-sm text-red-800 font-medium mb-2">
                  This action CANNOT be undone. All data will be lost:
                </p>
                <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                  <li>Teams and items</li>
                  <li>People and assignments</li>
                  <li>History and revisions</li>
                </ul>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type the event name to confirm deletion:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={`Type "${eventToDelete.name}" to confirm`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeDeleteModal}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={!canDelete}
                className={`flex-1 px-4 py-2 rounded-md font-medium ${
                  canDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
