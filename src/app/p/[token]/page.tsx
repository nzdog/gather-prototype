'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Calendar,
  Check,
  Home,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
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
    day: {
      id: string;
      name: string;
      date: string;
    } | null;
  };
}

interface ParticipantData {
  person: {
    id: string;
    name: string;
  };
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    guestCount: number | null;
  };
  team: {
    id: string;
    name: string;
    coordinator: {
      id: string;
      name: string;
    };
  } | null;
  rsvpStatus: 'PENDING' | 'YES' | 'NO' | 'NOT_SURE';
  rsvpRespondedAt: string | null;
  rsvpFollowupSentAt: string | null;
  assignments: Assignment[];
}

export default function ParticipantView() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<ParticipantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedAssignments, setCollapsedAssignments] = useState<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

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

      // Only initialize collapsed state on first load
      if (isInitialLoad.current) {
        const allAssignmentIds = new Set<string>(
          result.assignments.map((assignment: any) => assignment.id)
        );
        setCollapsedAssignments(allAssignmentIds);
        isInitialLoad.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRsvpResponse = async (rsvpStatus: 'YES' | 'NO' | 'NOT_SURE') => {
    try {
      const response = await fetch(`/api/p/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpStatus }),
      });
      if (!response.ok) {
        throw new Error('Failed to record RSVP');
      }
      await fetchData();
    } catch (err) {
      console.error('Failed to record RSVP:', err);
    }
  };

  const handleResponse = async (assignmentId: string, responseType: 'ACCEPTED' | 'DECLINED') => {
    try {
      const response = await fetch(`/api/p/${token}/ack/${assignmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: responseType }),
      });
      if (!response.ok) {
        throw new Error('Failed to record response');
      }
      await fetchData();
    } catch (err) {
      console.error('Failed to record response:', err);
    }
  };

  const toggleAssignmentCollapse = (assignmentId: string) => {
    const newCollapsed = new Set(collapsedAssignments);
    if (newCollapsed.has(assignmentId)) {
      newCollapsed.delete(assignmentId);
    } else {
      newCollapsed.add(assignmentId);
    }
    setCollapsedAssignments(newCollapsed);
  };

  const toggleAllAssignments = () => {
    if (collapsedAssignments.size === 0) {
      // All expanded, collapse all
      const allIds = new Set(data?.assignments.map((a) => a.id) || []);
      setCollapsedAssignments(allIds);
    } else {
      // Some or all collapsed, expand all
      setCollapsedAssignments(new Set());
    }
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const formatter = new Intl.DateTimeFormat('en-NZ', {
      month: 'short',
      day: 'numeric',
      timeZone: 'Pacific/Auckland',
    });
    return `${formatter.format(start)}-${formatter.format(end).split(' ')[1]}`;
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <a
          href="/"
          className="inline-flex items-center gap-1 text-sm text-accent hover:text-sage-800 mb-3"
        >
          <Home className="size-4" />
          Back to Demo
        </a>
        <h1 className="text-2xl font-bold text-gray-900">{data.event.name}</h1>
        <p className="text-sm text-gray-600 mt-1">Participant: {data.person.name}</p>
        <div className="text-sm text-gray-500 mt-1">
          {formatDateRange(data.event.startDate, data.event.endDate)}
          {data.event.guestCount && ` · ${data.event.guestCount} guests`}
        </div>
        {data.team && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">You're part of:</p>
            <p className="font-semibold text-gray-900 mt-1">{data.team.name}</p>
            <p className="text-sm text-gray-500">Coordinator: {data.team.coordinator.name}</p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* RSVP Question - PENDING state */}
        {data.rsvpStatus === 'PENDING' && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Are you coming?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleRsvpResponse('YES')}
                className="py-3 rounded-lg font-medium bg-sage-600 text-white hover:bg-sage-700 transition-all"
              >
                Yes
              </button>
              <button
                onClick={() => handleRsvpResponse('NO')}
                className="py-3 rounded-lg font-medium bg-gray-400 text-white hover:bg-gray-500 transition-all"
              >
                No
              </button>
              <button
                onClick={() => handleRsvpResponse('NOT_SURE')}
                className="py-3 rounded-lg font-medium bg-gray-300 text-gray-800 hover:bg-gray-400 transition-all"
              >
                Not sure
              </button>
            </div>
          </div>
        )}

        {/* RSVP Question - NOT_SURE state with followup sent (forced conversion) */}
        {data.rsvpStatus === 'NOT_SURE' && data.rsvpFollowupSentAt && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Are you coming?</h2>
            <p className="text-gray-600 mb-4">
              We need to finalize the headcount — please let us know if you're coming.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => handleRsvpResponse('YES')}
                className="py-3 rounded-lg font-medium bg-sage-600 text-white hover:bg-sage-700 transition-all"
              >
                Yes
              </button>
              <button
                onClick={() => handleRsvpResponse('NO')}
                className="py-3 rounded-lg font-medium bg-gray-400 text-white hover:bg-gray-500 transition-all"
              >
                No
              </button>
            </div>
          </div>
        )}

        {/* RSVP Question - NOT_SURE state without followup (show all 3 options) */}
        {data.rsvpStatus === 'NOT_SURE' && !data.rsvpFollowupSentAt && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Are you coming?</h2>
            <p className="text-sm text-gray-500 mb-4">
              You selected "Not sure" — you can update your response here.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleRsvpResponse('YES')}
                className="py-3 rounded-lg font-medium bg-sage-600 text-white hover:bg-sage-700 transition-all"
              >
                Yes
              </button>
              <button
                onClick={() => handleRsvpResponse('NO')}
                className="py-3 rounded-lg font-medium bg-gray-400 text-white hover:bg-gray-500 transition-all"
              >
                No
              </button>
              <button
                onClick={() => handleRsvpResponse('NOT_SURE')}
                className="py-3 rounded-lg font-medium bg-gray-300 text-gray-800 hover:bg-gray-400 transition-all"
              >
                Not sure
              </button>
            </div>
          </div>
        )}

        {/* Thank you message for NO */}
        {data.rsvpStatus === 'NO' && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Thanks for letting us know</h2>
            <p className="text-gray-600">We'll miss you at the event!</p>
            <button
              onClick={() => handleRsvpResponse('YES')}
              className="mt-4 text-sm text-accent hover:underline"
            >
              Changed your mind? Click here
            </button>
          </div>
        )}

        {/* Assignments Section - Only show if YES or NOT_SURE */}
        {(data.rsvpStatus === 'YES' || data.rsvpStatus === 'NOT_SURE') && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm uppercase tracking-wide text-gray-500">Your Assignments</h2>
              {data && data.assignments.length > 0 && (
                <button
                  onClick={toggleAllAssignments}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {collapsedAssignments.size === 0 ? (
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
            </div>

            {data.assignments.length === 0 ? (
              <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 text-center">
                <p className="text-gray-600">No assignments yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
                {data.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
                  >
                    {/* Card Header - Always Visible */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-2xl font-bold text-gray-900">
                            {assignment.item.name}
                          </h2>
                          {assignment.item.quantity && (
                            <span className="text-xl text-gray-500">
                              ×{assignment.item.quantity}
                            </span>
                          )}
                        </div>

                        {/* Critical Badge - Always Visible */}
                        {assignment.item.critical && (
                          <div className="mb-2">
                            <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded">
                              CRITICAL
                            </span>
                          </div>
                        )}

                        {/* Status Badges */}
                        <div className="mb-2">
                          <ItemStatusBadges assignment={assignment} />
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
                        onClick={() => toggleAssignmentCollapse(assignment.id)}
                        className="ml-2 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0 border border-gray-300"
                        title={collapsedAssignments.has(assignment.id) ? 'Expand' : 'Collapse'}
                      >
                        {collapsedAssignments.has(assignment.id) ? (
                          <ChevronRight className="size-5 text-gray-700" />
                        ) : (
                          <ChevronDown className="size-5 text-gray-700" />
                        )}
                      </button>
                    </div>

                    {/* Collapsible Content */}
                    {!collapsedAssignments.has(assignment.id) && (
                      <div className="space-y-4 mt-4">
                        {/* Drop-off Details */}
                        {(assignment.item.day ||
                          assignment.item.dropOffLocation ||
                          assignment.item.dropOffNote ||
                          assignment.item.dropOffAt) && (
                          <div className="space-y-2">
                            {assignment.item.day && (
                              <div className="flex items-center gap-3">
                                <Calendar className="size-5 text-gray-400" />
                                <span className="text-gray-900">{assignment.item.day.name}</span>
                              </div>
                            )}
                            <DropOffDisplay
                              dropOffLocation={assignment.item.dropOffLocation}
                              dropOffAt={assignment.item.dropOffAt}
                              dropOffNote={assignment.item.dropOffNote}
                              variant="stacked"
                              showIcons={true}
                            />
                          </div>
                        )}

                        {/* Notes */}
                        {assignment.item.notes && (
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-600">{assignment.item.notes}</p>
                          </div>
                        )}

                        {/* Response Buttons */}
                        {assignment.response === 'PENDING' ? (
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => handleResponse(assignment.id, 'ACCEPTED')}
                              className="py-2.5 rounded-lg font-medium bg-sage-600 text-white hover:bg-sage-700 transition-all"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleResponse(assignment.id, 'DECLINED')}
                              className="py-2.5 rounded-lg font-medium bg-gray-400 text-white hover:bg-gray-500 transition-all"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div
                              className={`w-full py-2.5 rounded-lg font-medium text-white flex items-center justify-center gap-2 ${
                                assignment.response === 'ACCEPTED' ? 'bg-green-500' : 'bg-gray-500'
                              }`}
                            >
                              <Check className="size-5" />
                              {assignment.response === 'ACCEPTED' ? 'Accepted' : 'Declined'}
                            </div>
                            <button
                              onClick={() =>
                                handleResponse(
                                  assignment.id,
                                  assignment.response === 'ACCEPTED' ? 'DECLINED' : 'ACCEPTED'
                                )
                              }
                              className="text-sm text-accent hover:underline"
                            >
                              Change to {assignment.response === 'ACCEPTED' ? 'Decline' : 'Accept'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <p className="text-center text-sm text-gray-500">
          Questions? Contact your coordinator
          {data.team && <span className="text-accent"> {data.team.coordinator.name}</span>}
        </p>
      </div>
    </div>
  );
}
