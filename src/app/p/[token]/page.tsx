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

interface HostPreviewData {
  isHostPreview: true;
  person: { id: string; name: string };
  event: { id: string; name: string };
  assignments: {
    id: string;
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
    item: {
      id: string;
      name: string;
      quantity: string | null;
      critical: boolean;
      day: { id: string; name: string } | null;
    };
  }[];
}

interface Assignment {
  id: string;
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
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
  isDemo: boolean;
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
    venueName: string | null;
  };
  team: {
    id: string;
    name: string;
    coordinator: {
      id: string;
      name: string;
    } | null;
  } | null;
  /**
   * GTC-174 (D1): all three are DERIVED or narrowly stored server-side — there is no
   * rsvpStatus any more. `attendance` is the inference; `attendanceAskable` says whether
   * this guest is one of the two cases Hinge §3 lets us ask attendance of at all.
   */
  attendance: 'PENDING' | 'YES' | 'NO' | 'UNKNOWN';
  attendanceAnswer: 'YES' | 'NO' | null;
  attendanceAskable: boolean;
  assignments: Assignment[];
}

function getFriendlyErrorMessage(error: string | null): string {
  if (!error)
    return 'Something went wrong loading your page. Try refreshing — if it keeps happening, ask your host to send you a new link.';

  const lowerError = error.toLowerCase();
  if (lowerError.includes('expired') || lowerError.includes('invalid')) {
    return 'This link may have expired. Ask your host to send you a new one.';
  }
  if (lowerError.includes('not found') || lowerError.includes('404')) {
    return "We couldn't find your invitation. Check you're using the right link, or ask your host to resend it.";
  }
  return 'Something went wrong loading your page. Try refreshing — if it keeps happening, ask your host to send you a new link.';
}

export default function ParticipantView() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<ParticipantData | null>(null);
  const [hostPreview, setHostPreview] = useState<HostPreviewData | null>(null);
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

      if (result.isHostPreview) {
        setHostPreview(result);
        return;
      }

      setData(result);
      isInitialLoad.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  /**
   * GTC-174 (D1): the conditional no-follow-up and the itemless degenerate case — the
   * ONLY two moments Hinge §3 lets us ask attendance. The server enforces the same rule
   * (409 otherwise), so this is the convenient path, not the guard.
   */
  const handleAttendanceAnswer = async (attending: boolean) => {
    if (data) setData({ ...data, attendanceAnswer: attending ? 'YES' : 'NO' });

    try {
      const response = await fetch(`/api/p/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attending }),
      });
      if (!response.ok) {
        throw new Error('Failed to record answer');
      }
      await fetchData();
    } catch (err) {
      await fetchData();
    }
  };

  /**
   * GTC-174 (D1): THE tap. One decision, three ways (Hinge §3) — and it is the whole
   * ask: attendance is inferred from it, never asked alongside it.
   */
  const handleResponse = async (
    assignmentId: string,
    responseType: 'ACCEPTED' | 'DECLINED' | 'MAYBE'
  ) => {
    // Optimistically update assignment response
    if (data) {
      const updatedAssignments = data.assignments.map((a) =>
        a.id === assignmentId ? { ...a, response: responseType } : a
      );
      setData({ ...data, assignments: updatedAssignments });
    }

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
      // Revert on failure
      await fetchData();
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

  if (error || (!data && !hostPreview)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-red-600 max-w-md text-center px-4">
          {getFriendlyErrorMessage(error)}
        </div>
      </div>
    );
  }

  if (hostPreview) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6 min-h-screen flex flex-col items-center justify-center">
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 w-full max-w-md text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sage-100 rounded-full mb-4">
              <Check className="size-8 text-sage-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Link checked, good to send</h1>
            <p className="text-gray-600 mb-6">
              This invite link is for <strong>{hostPreview.person.name}</strong> to{' '}
              <strong>{hostPreview.event.name}</strong>.
            </p>

            {hostPreview.assignments.length > 0 && (
              <div className="text-left border-t border-gray-100 pt-4 mb-6">
                <h2 className="text-sm uppercase tracking-wide text-gray-500 mb-3">
                  Assigned Items ({hostPreview.assignments.length})
                </h2>
                <ul className="space-y-2">
                  {hostPreview.assignments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="font-medium">{a.item.name}</span>
                      {a.item.quantity && <span className="text-gray-400">x{a.item.quantity}</span>}
                      {a.item.critical && (
                        <span className="bg-red-100 text-red-800 text-xs font-semibold px-1.5 py-0.5 rounded">
                          CRITICAL
                        </span>
                      )}
                      {a.item.day && (
                        <span className="text-gray-400 text-xs">({a.item.day.name})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hostPreview.assignments.length === 0 && (
              <p className="text-sm text-gray-500 mb-6">No items assigned yet.</p>
            )}

            <a
              href={`/plan/${hostPreview.event.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sage-600 text-white rounded-lg hover:bg-sage-700 transition-colors font-medium"
            >
              Back to event
            </a>
          </div>
        </div>
      </div>
    );
  }

  // After hostPreview and error early-returns, data is guaranteed non-null
  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6 min-h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 rounded-t-xl px-6 py-5">
          {data.isDemo && (
            <a
              href="/demo"
              className="inline-flex items-center gap-1 text-sm text-accent hover:text-sage-800 mb-3"
            >
              <Home className="size-4" />
              Back to Demo
            </a>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{data.event.name}</h1>
          <p className="text-sm text-gray-600 mt-1">Participant: {data.person.name}</p>
          <div className="text-sm text-gray-500 mt-1">
            {formatDateRange(data.event.startDate, data.event.endDate)}
            {data.event.guestCount && ` · ${data.event.guestCount} guests`}
          </div>
          {data.event.venueName && (
            <div className="text-sm text-gray-500 mt-1">📍 {data.event.venueName}</div>
          )}
          {data.team && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">You're part of:</p>
              <p className="font-semibold text-gray-900 mt-1">{data.team.name}</p>
              {data.team.coordinator && (
                <p className="text-sm text-gray-500">Coordinator: {data.team.coordinator.name}</p>
              )}
            </div>
          )}
        </div>

        {/* GTC-198 (A3d) — THE GUEST-SIDE INVERSION.
            This showed "This plan has been finalised — contact your host if you need
            to make changes" once the host froze. That is backwards: after the send is
            precisely when a guest is meant to answer.

            Moment 4 §7: "Responses, claims, and reassignments-with-reasons are not the
            plan changing; they are the plan being answered. Greens keep accumulating
            after the send — that's the Moment working."

            A3a deleted the server gate that 400'd these responses. This deletes the
            screen that hid the buttons. Nothing replaces it: there is no lock to
            announce to a guest. */}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* GTC-174 (D1) — ITEMS FIRST. The RSVP-gate that used to stand here
              ("Are you coming?" before the items were even shown) is deleted. Hinge §3
              ruled the tap IS the item ask and attendance is inferred from it: asking
              attendance up front asks the guest for the same decision twice.

              MECHANISM ONLY. GTC-191 (I4) rebuilds this page's presentation to the §3
              shape — Kate's voice, the item carrying its own logistics, nothing else —
              and adds the post-yes reminder offer. What is here is the working model,
              not the finished screen. */}

          {/* The conditional no-follow-up, and the itemless degenerate case.
              Both are the SAME beat — the only two moments §3 permits an attendance
              question. It shows while the server says attendance is askable and the
              guest has not answered; answering ends it, so "exactly one follow-up"
              needs no counter. */}
          {data.attendanceAskable && data.attendanceAnswer === null && (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {data.assignments.length === 0 ? 'Are you coming?' : 'No worries — still coming?'}
              </h2>
              <p className="text-gray-600 mb-4">
                {data.assignments.length === 0
                  ? "There's nothing for you to bring — just let us know if you'll be there."
                  : "That's all good. We just need to know whether to expect you."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => handleAttendanceAnswer(true)}
                  className="py-3 rounded-lg font-medium bg-sage-600 text-white hover:bg-sage-700 transition-all"
                >
                  Yes, still coming
                </button>
                <button
                  onClick={() => handleAttendanceAnswer(false)}
                  className="py-3 rounded-lg font-medium bg-gray-400 text-white hover:bg-gray-500 transition-all"
                >
                  Can't make it
                </button>
              </div>
            </div>
          )}

          {/* The answer, once given. Changing it is a re-answer of the same question,
              not a new one — the beat above stays closed. */}
          {data.attendanceAnswer !== null && (
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6 text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {data.attendanceAnswer === 'YES'
                  ? "Great — we'll see you there."
                  : 'Thanks for letting us know'}
              </h2>
              <p className="text-gray-600">
                {data.attendanceAnswer === 'YES'
                  ? 'Your host knows to expect you.'
                  : "We'll miss you at the event!"}
              </p>
              <button
                onClick={() => handleAttendanceAnswer(data.attendanceAnswer !== 'YES')}
                className="mt-4 text-sm text-accent hover:underline"
              >
                {data.attendanceAnswer === 'YES'
                  ? 'Changed your mind?'
                  : 'Changed your mind? Click here'}
              </button>
            </div>
          )}

          {/* Everything answered, at least one yes — attendance follows from the tap. */}
          {data.attendance === 'YES' &&
            data.assignments.length > 0 &&
            data.assignments.every((a) => a.response !== 'PENDING') && (
              <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-sage-100 rounded-full mb-4">
                  <Check className="size-8 text-sage-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  You're all set. See you there.
                </h2>
                <p className="text-gray-600">
                  {data.assignments.filter((a) => a.response === 'ACCEPTED').length > 0 && (
                    <>
                      You're bringing{' '}
                      {data.assignments.filter((a) => a.response === 'ACCEPTED').length}{' '}
                      {data.assignments.filter((a) => a.response === 'ACCEPTED').length === 1
                        ? 'item'
                        : 'items'}
                      .{' '}
                    </>
                  )}
                  Your host has been notified. You can change any answer below.
                </p>
              </div>
            )}

          {/* The items themselves — always visible, never gated. */}
          {data.assignments.length > 0 && (
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

                          {/* GTC-174 (D1) — THE TAP. One decision, three ways (Hinge §3).
                              It is the whole ask: a yes here IS a yes to coming, and no
                              attendance question follows it. A maybe is "a decision to
                              decide later" (§8) — the item stays this guest's, and D2
                              (GTC-175) will hang the decide-by clock off it. */}
                          {assignment.response === 'PENDING' ? (
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                onClick={() => handleResponse(assignment.id, 'ACCEPTED')}
                                className="py-3 rounded-lg font-medium bg-sage-600 text-white hover:bg-sage-700 transition-all"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => handleResponse(assignment.id, 'DECLINED')}
                                className="py-3 rounded-lg font-medium bg-gray-400 text-white hover:bg-gray-500 transition-all"
                              >
                                No
                              </button>
                              <button
                                onClick={() => handleResponse(assignment.id, 'MAYBE')}
                                className="py-3 rounded-lg font-medium bg-amber-500 text-white hover:bg-amber-600 transition-all"
                              >
                                Maybe
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <div
                                className={`w-full py-3 rounded-lg font-medium text-white flex items-center justify-center gap-2 ${
                                  assignment.response === 'ACCEPTED'
                                    ? 'bg-green-500'
                                    : assignment.response === 'MAYBE'
                                      ? 'bg-amber-500'
                                      : 'bg-gray-500'
                                }`}
                              >
                                {assignment.response !== 'MAYBE' && <Check className="size-5" />}
                                {assignment.response === 'ACCEPTED'
                                  ? "Yes — you're bringing this"
                                  : assignment.response === 'MAYBE'
                                    ? 'Maybe'
                                    : "No — you're not bringing this"}
                              </div>
                              <p className="text-sm text-gray-500 text-center">
                                {assignment.response === 'ACCEPTED'
                                  ? "Your host can see you've confirmed ✓"
                                  : assignment.response === 'MAYBE'
                                    ? "It's still yours — we'll check back before your host needs to know."
                                    : 'Your host has been notified'}
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {(['ACCEPTED', 'DECLINED', 'MAYBE'] as const)
                                  .filter((r) => r !== assignment.response)
                                  .map((r) => (
                                    <button
                                      key={r}
                                      onClick={() => handleResponse(assignment.id, r)}
                                      className="text-sm text-accent hover:underline py-1"
                                    >
                                      Change to{' '}
                                      {r === 'ACCEPTED' ? 'Yes' : r === 'DECLINED' ? 'No' : 'Maybe'}
                                    </button>
                                  ))}
                              </div>
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
        <div className="bg-white border-t border-gray-200 rounded-b-xl px-6 py-4">
          <p className="text-center text-sm text-gray-500">
            Questions? Contact your coordinator
            {data.team && data.team.coordinator && (
              <span className="text-accent"> {data.team.coordinator.name}</span>
            )}
          </p>
          <p className="text-center text-sm text-gray-400 mt-2">
            <a href="/privacy" className="hover:text-gray-600 hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
