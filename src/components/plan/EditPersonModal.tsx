'use client';

import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';

interface Team {
  id: string;
  name: string;
}

interface Person {
  id: string;
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  team: Team;
  itemCount: number;
}

interface Assignment {
  id: string;
  item: {
    id: string;
    name: string;
    critical: boolean;
  };
}

interface EditPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (personId: string, data: { role?: string; teamId?: string }) => Promise<void>;
  onRemove: (personId: string) => Promise<void>;
  person: Person | null;
  teams: Team[];
  eventId: string;
}

export default function EditPersonModal({
  isOpen,
  onClose,
  onSave,
  onRemove,
  person,
  teams,
  eventId,
}: EditPersonModalProps) {
  const [role, setRole] = useState('PARTICIPANT');
  const [teamId, setTeamId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  useEffect(() => {
    if (person) {
      setRole(person.role);
      setTeamId(person.team.id);
      loadAssignments();
    }
  }, [person]);

  const loadAssignments = async () => {
    if (!person) return;

    setLoadingAssignments(true);
    try {
      const response = await fetch(`/api/events/${eventId}/assignments`);
      if (!response.ok) throw new Error('Failed to load assignments');
      const data = await response.json();

      // Filter assignments for this person
      const personAssignments = data.assignments.filter(
        (a: any) => a.person.id === person.personId
      );
      setAssignments(personAssignments);
    } catch (error: any) {
      console.error('Error loading assignments:', error);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const updates: { role?: string; teamId?: string } = {};
    let hasChanges = false;

    if (role !== person?.role) {
      updates.role = role;
      hasChanges = true;
    }

    if (teamId !== person?.team.id) {
      updates.teamId = teamId;
      hasChanges = true;

      // Warn about team change
      if (person && person.itemCount > 0) {
        const confirmed = confirm(
          `Changing teams will remove ${person.itemCount} item assignment(s). Continue?`
        );
        if (!confirmed) return;
      }
    }

    if (!hasChanges) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(person!.personId, updates);
      onClose();
    } catch (error: any) {
      console.error('Error updating person:', error);
      alert(error.message || 'Failed to update person');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!person) return;

    const message =
      person.itemCount > 0
        ? `Remove ${person.name} from this event? This will unassign ${person.itemCount} item(s).`
        : `Remove ${person.name} from this event?`;

    if (!confirm(message)) return;

    setIsSubmitting(true);
    try {
      await onRemove(person.personId);
      onClose();
    } catch (error: any) {
      console.error('Error removing person:', error);
      alert(error.message || 'Failed to remove person');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !person) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">Edit Person</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Person Info */}
          <div className="bg-gray-50 rounded-md p-3">
            <h3 className="font-medium text-gray-900">{person.name}</h3>
            {person.email && <p className="text-sm text-gray-600 mt-1">{person.email}</p>}
            {person.phone && <p className="text-sm text-gray-600">{person.phone}</p>}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value="HOST">Host</option>
              <option value="COORDINATOR">Coordinator</option>
              <option value="PARTICIPANT">Participant</option>
            </select>
          </div>

          {/* Team */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {teamId !== person.team.id && person.itemCount > 0 && (
              <p className="text-xs text-orange-600 mt-1">
                Warning: Changing teams will remove all item assignments
              </p>
            )}
          </div>

          {/* Assignments */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              Assigned Items ({person.itemCount})
            </h3>
            {loadingAssignments ? (
              <p className="text-sm text-gray-500">Loading assignments...</p>
            ) : assignments.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-gray-50 rounded-md p-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900">{assignment.item.name}</span>
                      {assignment.item.critical && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                          Critical
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No items assigned yet</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>

          {/* Remove Button */}
          <div className="pt-4 border-t">
            <button
              type="button"
              onClick={handleRemove}
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Remove from Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
