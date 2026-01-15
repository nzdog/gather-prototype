'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check } from 'lucide-react';
import { useModal } from '@/contexts/ModalContext';

interface Team {
  id: string;
  name: string;
  coordinator: {
    id: string;
    name: string;
  };
}

interface Person {
  id: string;
  personId: string;
  name: string;
  role: string;
  team: {
    id: string;
    name: string;
  };
}

interface AssignCoordinatorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  people: Person[];
  eventId: string;
  onAssignmentsComplete: () => void;
}

interface TeamAssignment {
  teamId: string;
  teamName: string;
  currentCoordinatorId: string;
  selectedPersonId: string;
}

export default function AssignCoordinatorsModal({
  isOpen,
  onClose,
  teams,
  people,
  eventId,
  onAssignmentsComplete,
}: AssignCoordinatorsModalProps) {
  const { openModal, closeModal } = useModal();
  const [assignments, setAssignments] = useState<TeamAssignment[]>([]);
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [expandedDropdown, setExpandedDropdown] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal blocking check
  useEffect(() => {
    if (isOpen) {
      if (!openModal('assign-coordinators-modal')) {
        onClose();
      }
    } else {
      closeModal();
    }
  }, [isOpen]);

  // Initialize assignments when modal opens
  useEffect(() => {
    if (isOpen && teams.length > 0) {
      const initialAssignments = teams.map((team) => ({
        teamId: team.id,
        teamName: team.name,
        currentCoordinatorId: team.coordinator.id,
        selectedPersonId: team.coordinator.id,
      }));
      setAssignments(initialAssignments);
    }
  }, [isOpen, teams]);

  // Close expanded dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setExpandedDropdown(null);
    if (expandedDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [expandedDropdown]);

  const handleAssignmentChange = (teamId: string, personId: string) => {
    setAssignments((prev) =>
      prev.map((a) => (a.teamId === teamId ? { ...a, selectedPersonId: personId } : a))
    );
    setExpandedDropdown(null);
  };

  // Check if a person is assigned to another team (not the current one)
  const isPersonAssignedToOtherTeam = (personId: string, currentTeamId: string) => {
    return assignments.some(
      (a) => a.teamId !== currentTeamId && a.selectedPersonId === personId
    );
  };

  // Get the team name a person is assigned to (if any)
  const getAssignedTeamName = (personId: string, currentTeamId: string) => {
    const assignment = assignments.find(
      (a) => a.teamId !== currentTeamId && a.selectedPersonId === personId
    );
    return assignment ? assignment.teamName : null;
  };

  const getFilteredPeople = (teamId: string) => {
    const searchTerm = searchTerms[teamId] || '';
    // Only filter by search term, show all people (we'll disable assigned ones)
    return people.filter((person) =>
      person.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const getSelectedPersonName = (teamId: string) => {
    const assignment = assignments.find((a) => a.teamId === teamId);
    if (!assignment) return 'Select person...';
    const person = people.find((p) => p.personId === assignment.selectedPersonId);
    return person ? person.name : 'Select person...';
  };

  const handleSubmit = async () => {
    // Find teams where coordinator has changed
    const changes = assignments.filter(
      (a) => a.selectedPersonId !== a.currentCoordinatorId
    );

    if (changes.length === 0) {
      alert('No changes to save');
      return;
    }

    const confirmMessage =
      `Assign ${changes.length} coordinator(s)?\n\n` +
      changes.map((c) => {
        const person = people.find((p) => p.personId === c.selectedPersonId);
        return `• ${c.teamName} → ${person?.name}`;
      }).join('\n');

    if (!confirm(confirmMessage)) return;

    setIsSubmitting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const change of changes) {
        try {
          const response = await fetch(
            `/api/events/${eventId}/people/${change.selectedPersonId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role: 'COORDINATOR',
                teamId: change.teamId,
              }),
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Failed to assign coordinator for team ${change.teamName}`);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error assigning coordinator for team ${change.teamName}:`, error);
        }
      }

      const message =
        `✓ Coordinator Assignments Complete\n\n` +
        `${successCount} coordinator(s) assigned successfully` +
        (errorCount > 0 ? `\n${errorCount} assignment(s) failed` : '');

      alert(message);

      if (successCount > 0) {
        onAssignmentsComplete();
        onClose();
      }
    } catch (error) {
      console.error('Error assigning coordinators:', error);
      alert('Failed to assign coordinators');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Assign Coordinators</h2>
            <p className="text-sm text-gray-600 mt-1">
              Assign one coordinator per team
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isSubmitting}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Team List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {assignments.map((assignment) => {
            const isExpanded = expandedDropdown === assignment.teamId;
            const filteredPeople = getFilteredPeople(assignment.teamId);
            const hasChanged = assignment.selectedPersonId !== assignment.currentCoordinatorId;

            return (
              <div key={assignment.teamId} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900">{assignment.teamName}</h3>
                  {hasChanged && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                      Changed
                    </span>
                  )}
                </div>

                {/* Custom Searchable Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedDropdown(isExpanded ? null : assignment.teamId);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isSubmitting}
                  >
                    {getSelectedPersonName(assignment.teamId)}
                  </button>

                  {/* Dropdown Menu */}
                  {isExpanded && (
                    <div
                      className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Search Bar */}
                      <div className="p-2 border-b sticky top-0 bg-white">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search people..."
                            value={searchTerms[assignment.teamId] || ''}
                            onChange={(e) => {
                              setSearchTerms((prev) => ({
                                ...prev,
                                [assignment.teamId]: e.target.value,
                              }));
                            }}
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            autoFocus
                          />
                        </div>
                      </div>

                      {/* People List */}
                      <div className="max-h-80 overflow-y-auto">
                        {filteredPeople.length > 0 ? (
                          filteredPeople.map((person) => {
                            const isSelected = assignment.selectedPersonId === person.personId;
                            const assignedToOther = isPersonAssignedToOtherTeam(person.personId, assignment.teamId);
                            const assignedTeamName = getAssignedTeamName(person.personId, assignment.teamId);

                            return (
                              <button
                                key={person.personId}
                                type="button"
                                onClick={() =>
                                  handleAssignmentChange(assignment.teamId, person.personId)
                                }
                                className={`w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-between ${
                                  isSelected ? 'bg-blue-50' : ''
                                } ${assignedToOther ? 'opacity-50' : ''}`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-sm ${assignedToOther ? 'text-gray-500' : 'text-gray-900'}`}>
                                      {person.name}
                                    </span>
                                    {assignedToOther && assignedTeamName && (
                                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-medium">
                                        Assigned to {assignedTeamName}
                                      </span>
                                    )}
                                    {isSelected && !assignedToOther && (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                                        Selected
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {person.role} • {person.team.name || 'Unassigned'}
                                  </div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3 py-4 text-sm text-gray-500 text-center">
                            No people found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-gray-50 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Assigning...' : 'Assign Coordinators'}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
