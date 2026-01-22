'use client';

import { useState } from 'react';
import { Plus, Edit2, Users, Loader2, Upload, Maximize2, UserCog } from 'lucide-react';
import AddPersonModal, { AddPersonFormData } from './AddPersonModal';
import EditPersonModal from './EditPersonModal';
import TeamBoard from './TeamBoard';
import ImportCSVModal, { PersonRow } from './ImportCSVModal';
import AssignCoordinatorsModal from './AssignCoordinatorsModal';

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

interface PeopleSectionProps {
  eventId: string;
  teams: Team[];
  people: Person[];
  onPeopleChanged?: () => void;
  onMovePerson: (personId: string, teamId: string | null) => Promise<void>;
  onExpand?: () => void;
}

export default function PeopleSection({
  eventId,
  teams,
  people,
  onPeopleChanged,
  onMovePerson,
  onExpand,
}: PeopleSectionProps) {
  const [view, setView] = useState<'table' | 'board'>('table');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [assignCoordinatorsModalOpen, setAssignCoordinatorsModalOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);

  const handleAddPerson = async (data: AddPersonFormData) => {
    try {
      const response = await fetch(`/api/events/${eventId}/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add person');
      }

      onPeopleChanged?.();
    } catch (error) {
      throw error; // Re-throw so modal can show error
    }
  };

  const handleUpdatePerson = async (
    personId: string,
    data: { role?: string; teamId?: string | null }
  ) => {
    try {
      const response = await fetch(`/api/events/${eventId}/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update person');
      }

      const result = await response.json();

      // Show notification if someone was demoted from coordinator
      if (result.demotedCoordinator) {
        const { name, teamName } = result.demotedCoordinator;
        alert(
          `✓ Coordinator Updated\n\n` +
            `${name} was automatically demoted from Coordinator to Participant on the ${teamName} team.\n\n` +
            `Only one person can be coordinator per team.`
        );
      }

      onPeopleChanged?.();
    } catch (error) {
      throw error; // Re-throw so modal can show error
    }
  };

  const handleRemovePerson = async (personId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/people/${personId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove person');
      }

      onPeopleChanged?.();
    } catch (error) {
      throw error; // Re-throw so modal can show error
    }
  };

  const handleEditPerson = (person: Person) => {
    setSelectedPerson(person);
    setEditModalOpen(true);
  };

  const handleBatchImport = async (people: PersonRow[]) => {
    try {
      const response = await fetch(`/api/events/${eventId}/people/batch-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ people }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import people');
      }

      const result = await response.json();

      // Show summary
      const { imported, skipped, errors } = result;
      alert(
        `Import complete!\n\n` +
          `✓ Imported: ${imported}\n` +
          (skipped > 0 ? `⊘ Skipped: ${skipped} (duplicates)\n` : '') +
          (errors?.length > 0 ? `✗ Errors: ${errors.length}` : '')
      );

      onPeopleChanged?.();
    } catch (error) {
      throw error; // Re-throw so modal can show error
    }
  };

  const handleAutoAssign = async () => {
    setIsAutoAssigning(true);
    try {
      const response = await fetch(`/api/events/${eventId}/people/auto-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to auto-assign people');
      }

      const result = await response.json();

      // Success feedback
      alert(`Successfully assigned ${result.assigned} people to teams!`);

      // Refresh data
      onPeopleChanged?.();
    } catch (error: any) {
      console.error('Auto-assign error:', error);
      alert(error.message || 'Failed to auto-assign people');
    } finally {
      setIsAutoAssigning(false);
    }
  };

  function getRoleBadgeColor(role: string): string {
    switch (role) {
      case 'HOST':
        return 'bg-sage-100 text-sage-800';
      case 'COORDINATOR':
        return 'bg-sage-100 text-sage-800';
      case 'PARTICIPANT':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">People</h2>
              <span className="text-sm text-gray-500">({people.length})</span>
            </div>
            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">View</span>
              <div className="flex gap-1 bg-gray-100 rounded-md p-1">
                <button
                  onClick={() => setView('table')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    view === 'table'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Table
                </button>
                <button
                  onClick={() => setView('board')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    view === 'board'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Board
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {/* Assign Coordinators Button */}
            <button
              onClick={() => setAssignCoordinatorsModalOpen(true)}
              disabled={teams.length === 0}
              className="px-3 py-1 bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <UserCog className="w-4 h-4" />
              Assign Coordinators
            </button>
            {/* Auto-Assign Button */}
            <button
              onClick={handleAutoAssign}
              disabled={isAutoAssigning || people.length === 0}
              className="px-3 py-1 bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isAutoAssigning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Auto-Assign
                </>
              )}
            </button>
            {/* Import CSV Button */}
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-3 py-1 bg-accent text-white rounded-md hover:bg-accent-dark flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
            {/* Add Person Button */}
            <button
              onClick={() => setAddModalOpen(true)}
              className="px-3 py-1 bg-accent text-white rounded-md hover:bg-accent-dark flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Person
            </button>
            {/* Expand Button */}
            {onExpand && (
              <button
                onClick={onExpand}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="Expand section"
                title="Expand full-screen"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {view === 'board' && (
          <p className="text-xs text-gray-500 mb-4">Move people between teams in Board view.</p>
        )}

        {people.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No people added yet. Add people to assign items to them.</p>
          </div>
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Role</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Team</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Items</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">{person.name}</p>
                        {person.email && <p className="text-sm text-gray-600">{person.email}</p>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(person.role)}`}
                      >
                        {person.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">{person.team.name}</td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-900">{person.itemCount}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleEditPerson(person)}
                        className="px-2 py-1 bg-accent text-white text-xs rounded-md hover:bg-accent-dark flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <TeamBoard
            teams={teams}
            people={people}
            onMovePerson={onMovePerson}
            onEditPerson={handleEditPerson}
          />
        )}
      </div>

      {/* Add Person Modal */}
      <AddPersonModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddPerson}
        teams={teams}
      />

      {/* Edit Person Modal */}
      <EditPersonModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedPerson(null);
        }}
        onSave={handleUpdatePerson}
        onRemove={handleRemovePerson}
        person={selectedPerson}
        teams={teams}
        eventId={eventId}
      />

      {/* Import CSV Modal */}
      <ImportCSVModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleBatchImport}
        teams={teams}
      />

      {/* Assign Coordinators Modal */}
      <AssignCoordinatorsModal
        isOpen={assignCoordinatorsModalOpen}
        onClose={() => setAssignCoordinatorsModalOpen(false)}
        teams={teams.map((team) => {
          // Find the coordinator for this team
          const coordinator = people.find((p) => p.team.id === team.id && p.role === 'COORDINATOR');
          return {
            id: team.id,
            name: team.name,
            coordinator: coordinator
              ? { id: coordinator.personId, name: coordinator.name }
              : { id: '', name: 'Unassigned' },
          };
        })}
        people={people}
        eventId={eventId}
        onAssignmentsComplete={() => {
          onPeopleChanged?.();
        }}
      />
    </>
  );
}
