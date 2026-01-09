'use client';

import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreVertical } from 'lucide-react';

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

interface TeamBoardProps {
  teams: Team[];
  people: Person[];
  onMovePerson: (personId: string, teamId: string | null) => Promise<void>;
  onEditPerson?: (person: Person) => void;
}

function DraggablePersonChip({
  person,
  menuOpen,
  onMenuToggle,
  onClickMove,
  onEditPerson,
  teams,
}: {
  person: Person;
  menuOpen: string | null;
  onMenuToggle: (personId: string) => void;
  onClickMove: (person: Person, targetTeamId: string | null) => void;
  onEditPerson?: (person: Person) => void;
  teams: Team[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: person.personId,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm hover:shadow-md transition-shadow ${
          isDragging ? 'opacity-50' : ''
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            {...listeners}
            className="cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditPerson?.(person);
            }}
            className="flex-1 min-w-0 text-left hover:bg-gray-50 rounded px-1 -mx-1 transition-colors"
          >
            <p className="text-sm font-medium text-gray-900 truncate hover:text-blue-600 transition-colors">
              {person.name}
            </p>
            {person.email && <p className="text-xs text-gray-500 truncate">{person.email}</p>}
          </button>
          {person.itemCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded flex-shrink-0">
              {person.itemCount} {person.itemCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle(person.personId);
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          {menuOpen === person.personId && (
            <div className="absolute right-0 top-8 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
              <div className="py-1">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b">
                  Move to
                </div>
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => onClickMove(person, team.id)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {team.name}
                  </button>
                ))}
                <button
                  onClick={() => onClickMove(person, null)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 border-t"
                >
                  Unassigned
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DroppableTeamCard({
  team,
  people,
  menuOpen,
  onMenuToggle,
  onClickMove,
  onEditPerson,
  teams,
}: {
  team: Team | null;
  people: Person[];
  menuOpen: string | null;
  onMenuToggle: (personId: string) => void;
  onClickMove: (person: Person, targetTeamId: string | null) => void;
  onEditPerson?: (person: Person) => void;
  teams: Team[];
}) {
  const isUnassigned = team === null;
  const teamId = isUnassigned ? 'unassigned' : team.id;
  const teamName = isUnassigned ? 'Unassigned' : team.name;

  const { setNodeRef, isOver } = useDroppable({
    id: teamId,
  });

  return (
    <div
      ref={setNodeRef}
      className={`bg-gray-50 border-2 rounded-lg p-4 min-h-[200px] flex flex-col transition-colors ${
        isOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      }`}
    >
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900">{teamName}</h3>
        <p className="text-xs text-gray-500 mt-1">
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </p>
      </div>
      <div className="space-y-2 flex-1">
        {people.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No people yet</div>
        ) : (
          people.map((person) => (
            <DraggablePersonChip
              key={person.personId}
              person={person}
              menuOpen={menuOpen}
              onMenuToggle={onMenuToggle}
              onClickMove={onClickMove}
              onEditPerson={onEditPerson}
              teams={teams}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function TeamBoard({ teams, people, onMovePerson, onEditPerson }: TeamBoardProps) {
  const [activePerson, setActivePerson] = useState<Person | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Group people by team
  const peopleByTeam: Record<string, Person[]> = {};
  const unassignedPeople: Person[] = [];

  people.forEach((person) => {
    if (!person.team.id) {
      unassignedPeople.push(person);
    } else {
      if (!peopleByTeam[person.team.id]) {
        peopleByTeam[person.team.id] = [];
      }
      peopleByTeam[person.team.id].push(person);
    }
  });

  const handleDragStart = (event: DragStartEvent) => {
    const person = people.find((p) => p.personId === event.active.id);
    setActivePerson(person || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePerson(null);

    if (!over) return;

    const personId = active.id as string;
    const targetTeamId = over.id === 'unassigned' ? null : (over.id as string);

    // Find the person
    const person = people.find((p) => p.personId === personId);
    if (!person) return;

    // Check if already in target team
    if (
      (targetTeamId === null && !person.team.id) ||
      (targetTeamId && person.team.id === targetTeamId)
    ) {
      return; // No change needed
    }

    // Move the person
    await onMovePerson(personId, targetTeamId);
  };

  const handleClickMove = async (person: Person, targetTeamId: string | null) => {
    setMenuOpen(null);
    await onMovePerson(person.personId, targetTeamId);
  };

  const handleMenuToggle = (personId: string) => {
    setMenuOpen(menuOpen === personId ? null : personId);
  };

  const PersonChip = ({ person }: { person: Person }) => (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{person.name}</p>
          {person.email && <p className="text-xs text-gray-500 truncate">{person.email}</p>}
        </div>
        {person.itemCount > 0 && (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded flex-shrink-0">
            {person.itemCount} {person.itemCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">Drag people to move them between teams.</p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Unassigned Card First */}
          <DroppableTeamCard
            team={null}
            people={unassignedPeople}
            menuOpen={menuOpen}
            onMenuToggle={handleMenuToggle}
            onClickMove={handleClickMove}
            onEditPerson={onEditPerson}
            teams={teams}
          />

          {/* Team Cards */}
          {teams.map((team) => (
            <DroppableTeamCard
              key={team.id}
              team={team}
              people={peopleByTeam[team.id] || []}
              menuOpen={menuOpen}
              onMenuToggle={handleMenuToggle}
              onClickMove={handleClickMove}
              onEditPerson={onEditPerson}
              teams={teams}
            />
          ))}
        </div>

        <DragOverlay>
          {activePerson && (
            <div className="rotate-3">
              <PersonChip person={activePerson} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Close menu when clicking outside */}
      {menuOpen && <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(null)} />}
    </div>
  );
}
