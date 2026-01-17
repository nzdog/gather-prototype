'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useModal } from '@/contexts/ModalContext';
import ItemStatusBadges from './ItemStatusBadges';
import { DropOffDisplay } from '@/components/shared/DropOffDisplay';

interface Day {
  id: string;
  name: string;
  date: string;
}

interface Person {
  id: string;
  personId: string;
  name: string;
  team: {
    id: string;
    name: string;
  };
}

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (itemId: string, data: any) => void;
  item: {
    id: string;
    name: string;
    description: string | null;
    critical: boolean;
    quantityAmount: number | null;
    quantityUnit: string | null;
    quantityState: string | null;
    placeholderAcknowledged: boolean;
    dietaryTags: string[];
    dayId: string | null;
    serveTime: string | null;
    dropOffLocation: string | null;
    dropOffNote: string | null;
    team: {
      id: string;
      name: string;
    };
    assignment?: {
      response: 'PENDING' | 'ACCEPTED' | 'DECLINED';
      person: {
        id: string;
        name: string;
      };
    } | null;
  } | null;
  days: Day[];
  eventId: string;
  people: Person[];
}

const QUANTITY_UNITS = [
  { value: 'KG', label: 'Kilograms (kg)' },
  { value: 'G', label: 'Grams (g)' },
  { value: 'L', label: 'Liters (L)' },
  { value: 'ML', label: 'Milliliters (ml)' },
  { value: 'COUNT', label: 'Count' },
  { value: 'PACKS', label: 'Packs' },
  { value: 'TRAYS', label: 'Trays' },
  { value: 'SERVINGS', label: 'Servings' },
  { value: 'CUSTOM', label: 'Custom' },
];

const QUANTITY_STATES = [
  { value: 'SPECIFIED', label: 'Specified' },
  { value: 'PLACEHOLDER', label: 'Placeholder (TBD)' },
  { value: 'NA', label: 'Not Applicable' },
];

const DIETARY_TAGS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'glutenFree', label: 'Gluten Free' },
  { value: 'dairyFree', label: 'Dairy Free' },
];

export default function EditItemModal({
  isOpen,
  onClose,
  onSave,
  item,
  days,
  eventId,
  people
}: EditItemModalProps) {
  const { openModal, closeModal } = useModal();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [critical, setCritical] = useState(false);
  const [quantityAmount, setQuantityAmount] = useState<string>('');
  const [quantityUnit, setQuantityUnit] = useState('SERVINGS');
  const [quantityState, setQuantityState] = useState('SPECIFIED');
  const [placeholderAcknowledged, setPlaceholderAcknowledged] = useState(false);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [dayId, setDayId] = useState<string>('');
  const [serveTime, setServeTime] = useState<string>('');
  const [dropOffLocation, setDropOffLocation] = useState<string>('');
  const [dropOffNote, setDropOffNote] = useState<string>('');
  const [assignedPersonId, setAssignedPersonId] = useState<string>('');

  // Modal blocking check
  useEffect(() => {
    if (isOpen) {
      if (!openModal('edit-item-modal')) {
        onClose();
      }
    } else {
      closeModal();
    }
  }, [isOpen]);

  // Sync form state with item prop
  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || '');
      setCritical(item.critical);
      setQuantityAmount(item.quantityAmount?.toString() || '');
      setQuantityUnit(item.quantityUnit || 'SERVINGS');
      setQuantityState(item.quantityState || 'SPECIFIED');
      setPlaceholderAcknowledged(item.placeholderAcknowledged || false);
      setDietaryTags(item.dietaryTags || []);
      setDayId(item.dayId || '');
      setServeTime(item.serveTime || '');
      setDropOffLocation(item.dropOffLocation || '');
      setDropOffNote(item.dropOffNote || '');
      setAssignedPersonId(item.assignment?.person?.id || '');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleDietaryTagToggle = (tag: string) => {
    setDietaryTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Item name is required');
      return;
    }

    const updateData: any = {
      name,
      description,
      critical,
      dietaryTags,
    };

    // Add quantity fields based on state
    switch (quantityState) {
      case 'SPECIFIED':
        updateData.quantityAmount = quantityAmount ? parseFloat(quantityAmount) : null;
        updateData.quantityUnit = quantityUnit;
        updateData.quantityState = 'SPECIFIED';
        updateData.placeholderAcknowledged = false;
        break;
      case 'PLACEHOLDER':
        updateData.quantityState = 'PLACEHOLDER';
        updateData.placeholderAcknowledged = placeholderAcknowledged;
        updateData.quantityAmount = null;
        updateData.quantityUnit = null;
        break;
      case 'NA':
        updateData.quantityState = 'NA';
        updateData.quantityAmount = null;
        updateData.quantityUnit = null;
        updateData.placeholderAcknowledged = false;
        break;
    }

    // Add timing and drop-off fields
    updateData.dayId = dayId || null;
    updateData.serveTime = serveTime || null;
    updateData.dropOffLocation = dropOffLocation || null;
    updateData.dropOffNote = dropOffNote || null;

    try {
      // Handle assignment changes FIRST, before saving other data
      const currentAssignmentId = item.assignment?.person?.id;
      if (assignedPersonId !== currentAssignmentId) {
        if (assignedPersonId) {
          // Assign to person
          const assignResponse = await fetch(`/api/events/${eventId}/items/${item.id}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personId: assignedPersonId }),
          });
          if (!assignResponse.ok) {
            const error = await assignResponse.json();
            throw new Error(error.error || 'Failed to assign item');
          }
        } else if (currentAssignmentId) {
          // Unassign
          const unassignResponse = await fetch(`/api/events/${eventId}/items/${item.id}/assign`, {
            method: 'DELETE',
          });
          if (!unassignResponse.ok) {
            const error = await unassignResponse.json();
            throw new Error(error.error || 'Failed to unassign item');
          }
        }
      }

      // Then save other item data
      await onSave(item.id, updateData);

      onClose();
    } catch (error: any) {
      console.error('Error saving item:', error);
      alert(error.message || 'Failed to save item');
      // Don't close modal on error
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">Edit Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Status Badges & Drop-off Summary */}
          <div className="bg-gray-50 p-3 rounded-md border border-gray-200 space-y-2">
            <ItemStatusBadges assignment={item.assignment} />
            <DropOffDisplay
              dropOffLocation={item.dropOffLocation}
              dropOffAt={null}
              dropOffNote={item.dropOffNote}
              variant="inline"
              showIcons={true}
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g., Grilled Chicken Skewers"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Additional details about the item..."
            />
          </div>

          {/* Quantity Section */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Quantity</h3>

            {/* Quantity State */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity Status
              </label>
              <select
                value={quantityState}
                onChange={(e) => setQuantityState(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {QUANTITY_STATES.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity Amount and Unit - Only show if SPECIFIED */}
            {quantityState === 'SPECIFIED' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={quantityAmount}
                    onChange={(e) => setQuantityAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="e.g., 100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <select
                    value={quantityUnit}
                    onChange={(e) => setQuantityUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {QUANTITY_UNITS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Placeholder Acknowledgement - Only show if PLACEHOLDER */}
            {quantityState === 'PLACEHOLDER' && (
              <div className="flex items-center p-3 bg-orange-50 border border-orange-200 rounded-md">
                <input
                  type="checkbox"
                  id="edit-placeholder-acknowledged"
                  checked={placeholderAcknowledged}
                  onChange={(e) => setPlaceholderAcknowledged(e.target.checked)}
                  className="h-4 w-4 text-accent focus:ring-accent border-gray-300 rounded"
                />
                <label
                  htmlFor="edit-placeholder-acknowledged"
                  className="ml-2 text-sm text-gray-700"
                >
                  Defer to Coordinator (quantity will be determined later)
                </label>
              </div>
            )}
          </div>

          {/* Dietary Tags */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Dietary Tags</h3>
            <div className="grid grid-cols-2 gap-2">
              {DIETARY_TAGS.map((tag) => (
                <div key={tag.value} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`edit-dietary-${tag.value}`}
                    checked={dietaryTags.includes(tag.value)}
                    onChange={() => handleDietaryTagToggle(tag.value)}
                    className="h-4 w-4 text-accent focus:ring-accent border-gray-300 rounded"
                  />
                  <label
                    htmlFor={`edit-dietary-${tag.value}`}
                    className="ml-2 text-sm text-gray-700"
                  >
                    {tag.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Timing */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Timing</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                <select
                  value={dayId}
                  onChange={(e) => setDayId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">All days</option>
                  {days.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serve Time</label>
                <input
                  type="time"
                  value={serveTime}
                  onChange={(e) => setServeTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., 18:00"
                />
              </div>
            </div>
          </div>

          {/* Drop-off Details */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Drop-off Details</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Drop-off Location
                </label>
                <input
                  type="text"
                  value={dropOffLocation}
                  onChange={(e) => setDropOffLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., Main Kitchen, Marquee"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Drop-off Note
                </label>
                <input
                  type="text"
                  value={dropOffNote}
                  onChange={(e) => setDropOffNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., 12 noon, Before 5pm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Human-readable time/instructions (e.g., "12 noon", "after mains")
                </p>
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Assignment</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assigned to
              </label>
              <select
                value={assignedPersonId}
                onChange={(e) => setAssignedPersonId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">Unassigned</option>
                {people
                  .filter((p) => p.team.id === item.team.id)
                  .map((person) => (
                    <option key={person.personId} value={person.personId}>
                      {person.name}
                    </option>
                  ))}
              </select>
              {people.filter((p) => p.team.id === item.team.id).length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  No people in this team yet. Add people to the team first.
                </p>
              )}
            </div>
          </div>

          {/* Critical */}
          <div className="border-t pt-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="edit-critical"
                checked={critical}
                onChange={(e) => setCritical(e.target.checked)}
                className="h-4 w-4 text-accent focus:ring-accent border-gray-300 rounded"
              />
              <label htmlFor="edit-critical" className="ml-2 text-sm text-gray-700">
                Mark as critical (must-have item)
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
