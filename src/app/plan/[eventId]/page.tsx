'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, AlertCircle, Save } from 'lucide-react';
import ConflictList from '@/components/plan/ConflictList';
import GateCheck from '@/components/plan/GateCheck';
import SaveTemplateModal from '@/components/templates/SaveTemplateModal';
import AddTeamModal, { TeamFormData } from '@/components/plan/AddTeamModal';
import AddItemModal, { ItemFormData } from '@/components/plan/AddItemModal';
import EditItemModal from '@/components/plan/EditItemModal';
import { Conflict } from '@prisma/client';

interface Event {
  id: string;
  name: string;
  status: string;
  occasionType: string;
  guestCount: number | null;
  startDate: string;
  endDate: string;
}

interface Team {
  id: string;
  name: string;
  scope: string;
  coordinator: {
    id: string;
    name: string;
  };
  _count: {
    items: number;
  };
}

interface Item {
  id: string;
  name: string;
  description: string | null;
  critical: boolean;
  quantityState: string;
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityText: string | null;
  placeholderAcknowledged: boolean;
  quantityDeferredTo: string | null;
  dietaryTags: string[];
  dayId: string | null;
  serveTime: string | null;
  team: {
    id: string;
    name: string;
  };
  assignment: {
    person: {
      id: string;
      name: string;
    };
  } | null;
  day?: {
    id: string;
    name: string;
    date: string;
  } | null;
}

interface Day {
  id: string;
  name: string;
  date: string;
}

export default function PlanEditorPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantityAmount, setEditQuantityAmount] = useState('');
  const [editQuantityUnit, setEditQuantityUnit] = useState('SERVINGS');
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [addTeamModalOpen, setAddTeamModalOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [selectedTeamForItem, setSelectedTeamForItem] = useState<Team | null>(null);
  const [teamItems, setTeamItems] = useState<Record<string, Item[]>>({});
  const [loadingTeamItems, setLoadingTeamItems] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemDescription, setEditItemDescription] = useState('');
  const [editItemCritical, setEditItemCritical] = useState(false);

  // Mock hostId - in production, this would come from auth
  const MOCK_HOST_ID = 'cmjwbjrpw0000n99xs11r44qh';

  useEffect(() => {
    // Handle invalid eventId (like "new")
    if (eventId === 'new' || !eventId) {
      setError('Invalid event ID. Please navigate from the demo page or use a valid event link.');
      setLoading(false);
      return;
    }

    loadEvent();
    loadTeams();
    loadDays();
    loadConflicts();
    loadItems();
  }, [eventId]);

  const loadEvent = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (!response.ok) throw new Error('Failed to load event');
      const data = await response.json();
      setEvent(data.event);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/teams`);
      if (!response.ok) throw new Error('Failed to load teams');
      const data = await response.json();
      setTeams(data.teams);
    } catch (err: any) {
      console.error('Error loading teams:', err);
    }
  };

  const loadDays = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/days`);
      if (!response.ok) throw new Error('Failed to load days');
      const data = await response.json();
      setDays(data.days || []);
    } catch (err: any) {
      console.error('Error loading days:', err);
      setDays([]); // Set empty array on error
    }
  };

  const loadConflicts = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/conflicts`);
      if (!response.ok) throw new Error('Failed to load conflicts');
      const data = await response.json();
      setConflicts(data.conflicts || []);
    } catch (err: any) {
      console.error('Error loading conflicts:', err);
    }
  };

  const loadItems = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/items`);
      if (!response.ok) throw new Error('Failed to load items');
      const data = await response.json();
      setItems(data.items || []);
    } catch (err: any) {
      console.error('Error loading items:', err);
    }
  };

  const handleGeneratePlan = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/generate`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to generate plan');

      // Reload teams and items after generation
      await loadTeams();
      await loadItems();

      alert('Plan generated! Demo team and items created.');
    } catch (err: any) {
      console.error('Error generating plan:', err);
      alert('Failed to generate plan');
    }
  };

  const handleCheckPlan = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/check`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to check plan');

      // Reload conflicts after check
      await loadConflicts();

      alert('Plan check complete! See conflicts below.');
    } catch (err: any) {
      console.error('Error checking plan:', err);
      alert('Failed to check plan');
    }
  };

  const handleDeferToCoordinator = async (itemId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeholderAcknowledged: true,
          quantityDeferredTo: 'COORDINATOR',
        }),
      });
      if (!response.ok) throw new Error('Failed to update item');

      // Reload items and conflicts
      await loadItems();
      await loadConflicts();
    } catch (err: any) {
      console.error('Error deferring item:', err);
      alert('Failed to defer item');
    }
  };

  const handleStartEditQuantity = (item: Item) => {
    setEditingItemId(item.id);
    setEditQuantityAmount(item.quantityAmount?.toString() || '');
    setEditQuantityUnit(item.quantityUnit || 'SERVINGS');
  };

  const handleSaveQuantity = async (itemId: string) => {
    try {
      const amount = parseFloat(editQuantityAmount);
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid quantity');
        return;
      }

      const response = await fetch(`/api/events/${eventId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantityAmount: amount,
          quantityUnit: editQuantityUnit,
          quantityState: 'SPECIFIED',
        }),
      });
      if (!response.ok) throw new Error('Failed to update item');

      // Reload items and conflicts
      await loadItems();
      await loadConflicts();

      // Clear editing state
      setEditingItemId(null);
      setEditQuantityAmount('');
      setEditQuantityUnit('SERVINGS');
    } catch (err: any) {
      console.error('Error saving quantity:', err);
      alert('Failed to save quantity');
    }
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditQuantityAmount('');
    setEditQuantityUnit('SERVINGS');
  };


  const handleSaveAsTemplate = async (templateName: string) => {
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: MOCK_HOST_ID,
          eventId: event?.id,
          name: templateName
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save template');
      }

      const data = await response.json();
      alert(`Template "${templateName}" saved successfully!`);

      // Optionally redirect to templates page
      // router.push('/plan/templates');
    } catch (error: any) {
      console.error('Error saving template:', error);
      throw error;
    }
  };

  const handleAddTeam = async (teamData: TeamFormData) => {
    try {
      const response = await fetch(`/api/events/${eventId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...teamData,
          coordinatorId: MOCK_HOST_ID // Host is initial coordinator
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add team');
      }

      // Reload teams
      await loadTeams();
    } catch (error: any) {
      console.error('Error adding team:', error);
      alert('Failed to add team');
      throw error;
    }
  };

  const handleAddItem = async (itemData: ItemFormData) => {
    if (!selectedTeamForItem) return;

    try {
      const response = await fetch(`/api/events/${eventId}/teams/${selectedTeamForItem.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });

      if (!response.ok) {
        throw new Error('Failed to add item');
      }

      // Reload teams and team items
      await loadTeams();
      await loadTeamItems(selectedTeamForItem.id);
    } catch (error: any) {
      console.error('Error adding item:', error);
      alert('Failed to add item');
      throw error;
    }
  };

  const loadTeamItems = async (teamId: string) => {
    setLoadingTeamItems(prev => new Set(prev).add(teamId));
    try {
      const response = await fetch(`/api/events/${eventId}/teams/${teamId}/items`);
      if (!response.ok) throw new Error('Failed to load team items');

      const data = await response.json();
      setTeamItems(prev => ({ ...prev, [teamId]: data.items }));
    } catch (error: any) {
      console.error('Error loading team items:', error);
    } finally {
      setLoadingTeamItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(teamId);
        return newSet;
      });
    }
  };

  const toggleTeamExpanded = async (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
      // Load items when expanding
      if (!teamItems[teamId]) {
        await loadTeamItems(teamId);
      }
    }
    setExpandedTeams(newExpanded);
  };

  const handleStartEditItem = (item: Item) => {
    setEditingItem(item);
    setEditItemName(item.name);
    setEditItemDescription(item.description || '');
    setEditItemCritical(item.critical);
  };

  const handleSaveEditItem = async (itemId: string, data: any) => {
    const item = editingItem; // Store reference before clearing
    try {
      const response = await fetch(`/api/events/${eventId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed to update item');

      // Reload team items to show updated data
      if (item?.team?.id) {
        await loadTeamItems(item.team.id);
      }
    } catch (error: any) {
      console.error('Error updating item:', error);
      alert('Failed to update item');
      throw error; // Re-throw to prevent modal from closing
    }
  };

  const handleDeleteItem = async (item: Item) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`/api/events/${eventId}/items/${item.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete item');

      // Reload team items and teams
      await loadTeamItems(item.team.id);
      await loadTeams();
    } catch (error: any) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item');
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    const itemCount = team._count.items;
    const message = itemCount > 0
      ? `Delete "${team.name}" and its ${itemCount} item(s)? This cannot be undone.`
      : `Delete "${team.name}"? This cannot be undone.`;

    if (!confirm(message)) return;

    try {
      const response = await fetch(`/api/events/${eventId}/teams/${team.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete team');

      // Remove from expanded teams
      const newExpanded = new Set(expandedTeams);
      newExpanded.delete(team.id);
      setExpandedTeams(newExpanded);

      // Remove from team items
      const newTeamItems = { ...teamItems };
      delete newTeamItems[team.id];
      setTeamItems(newTeamItems);

      // Reload teams
      await loadTeams();
    } catch (error: any) {
      console.error('Error deleting team:', error);
      alert('Failed to delete team');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading event...</div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
          <h2 className="text-xl font-semibold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error || 'Event not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go Home
          </button>
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
              <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                  {event.status}
                </span>
                <span>{event.occasionType}</span>
                {event.guestCount && <span>{event.guestCount} guests</span>}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/h/${eventId}`)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                View as Host
              </button>
              {event.status === 'DRAFT' && teams.length === 0 && (
                <button
                  onClick={handleGeneratePlan}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Generate Plan
                </button>
              )}
              <button
                onClick={handleCheckPlan}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Check Plan
              </button>
              {(event.status === 'CONFIRMING' || event.status === 'FROZEN' || event.status === 'COMPLETE') && (
                <button
                  onClick={() => setSaveTemplateModalOpen(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save as Template
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="col-span-8">
            {/* Conflicts */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Plan Assessment
              </h2>
              <ConflictList
                eventId={eventId}
                conflicts={conflicts}
                onConflictsChanged={loadConflicts}
              />
            </div>

            {/* Items with Placeholder Quantities */}
            {items.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Items & Quantities
                </h2>
                <div className="space-y-3">
                  {items.map((item) => {
                    const needsAction =
                      item.critical &&
                      item.quantityState === 'PLACEHOLDER' &&
                      !item.placeholderAcknowledged;

                    return (
                      <div
                        key={item.id}
                        className={`border rounded-lg p-4 ${
                          needsAction
                            ? 'border-orange-300 bg-orange-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-gray-900">
                                {item.name}
                              </h3>
                              {item.critical && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                                  CRITICAL
                                </span>
                              )}
                              <span className="text-sm text-gray-500">
                                {item.team.name}
                              </span>
                            </div>

                            {item.description && (
                              <p className="text-sm text-gray-600 mb-2">
                                {item.description}
                              </p>
                            )}

                            {/* Quantity Display/Edit */}
                            {editingItemId === item.id ? (
                              <div className="flex items-center gap-2 mt-2">
                                <input
                                  type="number"
                                  value={editQuantityAmount}
                                  onChange={(e) =>
                                    setEditQuantityAmount(e.target.value)
                                  }
                                  placeholder="Amount"
                                  className="w-24 px-3 py-1 border border-gray-300 rounded-md text-sm"
                                />
                                <select
                                  value={editQuantityUnit}
                                  onChange={(e) =>
                                    setEditQuantityUnit(e.target.value)
                                  }
                                  className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                                >
                                  <option value="SERVINGS">Servings</option>
                                  <option value="KG">Kilograms</option>
                                  <option value="G">Grams</option>
                                  <option value="L">Liters</option>
                                  <option value="ML">Milliliters</option>
                                  <option value="COUNT">Count</option>
                                  <option value="PACKS">Packs</option>
                                  <option value="TRAYS">Trays</option>
                                  <option value="CUSTOM">Custom</option>
                                </select>
                                <button
                                  onClick={() => handleSaveQuantity(item.id)}
                                  className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="text-sm mt-2">
                                {item.quantityState === 'SPECIFIED' ? (
                                  <span className="text-gray-700">
                                    Quantity: {item.quantityAmount}{' '}
                                    {item.quantityUnit?.toLowerCase()}
                                  </span>
                                ) : (
                                  <span className="text-orange-600">
                                    Quantity: {item.quantityText || 'TBD'}
                                  </span>
                                )}
                                {item.placeholderAcknowledged && (
                                  <span className="ml-2 text-gray-500">
                                    (Deferred to{' '}
                                    {item.quantityDeferredTo?.toLowerCase()})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          {needsAction && editingItemId !== item.id && (
                            <div className="flex flex-col gap-2 ml-4">
                              <button
                                onClick={() => handleStartEditQuantity(item)}
                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 whitespace-nowrap"
                              >
                                Enter Quantity
                              </button>
                              <button
                                onClick={() => handleDeferToCoordinator(item.id)}
                                className="px-3 py-1 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 whitespace-nowrap"
                              >
                                Defer to Coordinator
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Gate Check - Only show for DRAFT events */}
            {event.status === 'DRAFT' && (
              <div className="mb-6">
                <GateCheck
                  eventId={eventId}
                  onTransitionComplete={() => {
                    // Reload event data after successful transition
                    loadEvent();
                    loadTeams();
                    loadConflicts();
                  }}
                />
              </div>
            )}

            {/* Teams */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Teams</h2>
                <button
                  onClick={() => setAddTeamModalOpen(true)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Team
                </button>
              </div>

              {teams.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No teams yet. Add your first team to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {teams.map((team) => (
                    <div key={team.id} className="border border-gray-200 rounded-lg">
                      <button
                        onClick={() => toggleTeamExpanded(team.id)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          {expandedTeams.has(team.id) ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                          <div className="text-left">
                            <h3 className="font-medium text-gray-900">
                              {team.name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {team.coordinator.name} • {team._count.items} items
                            </p>
                          </div>
                        </div>
                      </button>

                      {expandedTeams.has(team.id) && (
                        <div className="px-4 py-3 bg-gray-50 border-t">
                          <p className="text-sm text-gray-600 mb-3">{team.scope}</p>
                          <div className="flex gap-2 mb-4">
                            <button
                              onClick={() => {
                                setSelectedTeamForItem(team);
                                setAddItemModalOpen(true);
                              }}
                              className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              Add Item
                            </button>
                            <button
                              onClick={() => handleDeleteTeam(team)}
                              className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 flex items-center gap-1"
                            >
                              Delete Team
                            </button>
                          </div>

                          {/* Items List */}
                          {loadingTeamItems.has(team.id) ? (
                            <div className="text-center py-4 text-gray-500">
                              <p className="text-sm">Loading items...</p>
                            </div>
                          ) : teamItems[team.id] && teamItems[team.id].length > 0 ? (
                            <div className="space-y-2">
                              {teamItems[team.id].map((item: any) => (
                                <div key={item.id} className="bg-white border border-gray-200 rounded-md p-3">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-gray-900">{item.name}</h4>
                                        {item.critical && (
                                          <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">
                                            Critical
                                          </span>
                                        )}
                                      </div>

                                      {item.description && (
                                        <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                      )}

                                      {/* Quantity Display */}
                                      <div className="text-sm mt-2">
                                        {item.quantityState === 'SPECIFIED' ? (
                                          <span className="text-gray-700">
                                            Quantity: {item.quantityAmount} {item.quantityUnit?.toLowerCase()}
                                          </span>
                                        ) : (
                                          <span className="text-orange-600">
                                            Quantity: {item.quantityText || 'TBD'}
                                          </span>
                                        )}
                                      </div>

                                      {/* Dietary Tags */}
                                      {item.dietaryTags && item.dietaryTags.length > 0 && (
                                        <div className="flex gap-1 mt-2">
                                          {item.dietaryTags.map((tag: string) => (
                                            <span
                                              key={tag}
                                              className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded"
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 ml-4">
                                      <button
                                        onClick={() => handleStartEditItem(item)}
                                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item)}
                                        className="px-2 py-1 bg-red-600 text-white text-xs rounded-md hover:bg-red-700"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-gray-500">
                              <p className="text-sm">No items yet. Add an item to get started.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="col-span-4">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Event Details
              </h2>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-600">Status</dt>
                  <dd className="font-medium text-gray-900">{event.status}</dd>
                </div>

                <div>
                  <dt className="text-gray-600">Occasion</dt>
                  <dd className="font-medium text-gray-900">
                    {event.occasionType}
                  </dd>
                </div>

                <div>
                  <dt className="text-gray-600">Dates</dt>
                  <dd className="font-medium text-gray-900">
                    {new Date(event.startDate).toLocaleDateString()} -{' '}
                    {new Date(event.endDate).toLocaleDateString()}
                  </dd>
                </div>

                {event.guestCount && (
                  <div>
                    <dt className="text-gray-600">Guest Count</dt>
                    <dd className="font-medium text-gray-900">
                      {event.guestCount}
                    </dd>
                  </div>
                )}

                <div className="pt-3 border-t">
                  <dt className="text-gray-600">Teams</dt>
                  <dd className="font-medium text-gray-900">{teams.length}</dd>
                </div>

                <div>
                  <dt className="text-gray-600">Items</dt>
                  <dd className="font-medium text-gray-900">
                    {teams.reduce((sum, team) => sum + team._count.items, 0)}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 pt-6 border-t">
                <button
                  onClick={() => router.push(`/plan/${eventId}/settings`)}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  Edit Event Details
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Template Modal */}
      {event && (
        <SaveTemplateModal
          isOpen={saveTemplateModalOpen}
          onClose={() => setSaveTemplateModalOpen(false)}
          onSave={handleSaveAsTemplate}
          eventName={event.name}
          teamCount={teams.length}
          itemCount={teams.reduce((sum, team) => sum + team._count.items, 0)}
          occasionType={event.occasionType}
        />
      )}

      {/* Add Team Modal */}
      <AddTeamModal
        isOpen={addTeamModalOpen}
        onClose={() => setAddTeamModalOpen(false)}
        onAdd={handleAddTeam}
      />

      {/* Add Item Modal */}
      {selectedTeamForItem && (
        <AddItemModal
          isOpen={addItemModalOpen}
          onClose={() => {
            setAddItemModalOpen(false);
            setSelectedTeamForItem(null);
          }}
          onAdd={handleAddItem}
          teamName={selectedTeamForItem.name}
        />
      )}

      {/* Edit Item Modal */}
      <EditItemModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveEditItem}
        item={editingItem}
        days={days}
      />
    </div>
  );
}
