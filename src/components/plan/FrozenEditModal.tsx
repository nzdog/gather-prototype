'use client';

import { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useModal } from '@/contexts/ModalContext';

interface Person {
  id: string;
  personId: string;
  name: string;
  team: {
    id: string;
    name: string;
  };
}

interface FrozenEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: {
    id: string;
    name: string;
    description: string | null;
    quantity: string | null;
    critical: boolean;
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
  eventId: string;
  people: Person[];
}

type ActionType = 'reassign' | 'toggle_critical' | 'edit_item';

export default function FrozenEditModal({
  isOpen,
  onClose,
  onSuccess,
  item,
  eventId,
  people,
}: FrozenEditModalProps) {
  const { openModal, closeModal } = useModal();

  // Form state
  const [action, setAction] = useState<ActionType>('reassign');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reassign fields
  const [newPersonId, setNewPersonId] = useState<string>('');
  const [notifyRemoved, setNotifyRemoved] = useState(true);

  // Toggle critical fields
  const [critical, setCritical] = useState(false);

  // Edit item fields
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [description, setDescription] = useState('');

  // Modal blocking check
  useEffect(() => {
    if (isOpen) {
      if (!openModal('frozen-edit-modal')) {
        onClose();
      }
    } else {
      closeModal();
    }
  }, [isOpen]);

  // Sync form state with item prop
  useEffect(() => {
    if (item) {
      setCritical(item.critical);
      setName(item.name);
      setQuantity(item.quantity || '');
      setDescription(item.description || '');
      setNewPersonId('');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      alert('Please provide a reason for this change');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: any = {};

      switch (action) {
        case 'reassign':
          payload.newPersonId = newPersonId || null;
          payload.notifyRemoved = notifyRemoved;
          break;
        case 'toggle_critical':
          payload.critical = critical;
          break;
        case 'edit_item':
          payload.name = name;
          payload.quantity = quantity;
          payload.description = description;
          break;
      }

      const response = await fetch(`/api/events/${eventId}/frozen-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          itemId: item.id,
          reason: reason.trim(),
          payload,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to perform frozen edit');
      }

      const result = await response.json();
      console.log('Frozen edit result:', result);

      // Reset form
      setReason('');
      setNewPersonId('');
      setNotifyRemoved(true);

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error performing frozen edit:', error);
      alert(error.message || 'Failed to perform frozen edit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const teamPeople = people.filter((p) => p.team.id === item.team.id);
  const hasAssignment = !!item.assignment;
  const currentAssigneeId = item.assignment?.person?.id;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">Edit While Frozen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Warning Banner */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Surgical Edit Mode</p>
              <p className="mt-1">
                This event is frozen. Only critical changes are allowed. All changes will be logged
                with audit trail.
              </p>
            </div>
          </div>

          {/* Item Info */}
          <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
            <p className="text-sm text-gray-600">Item:</p>
            <p className="font-medium text-gray-900">{item.name}</p>
            {item.assignment && (
              <p className="text-sm text-gray-600 mt-1">
                Currently assigned to:{' '}
                <span className="font-medium">{item.assignment.person.name}</span>
              </p>
            )}
          </div>

          {/* Action Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What do you need to change?
            </label>
            <div className="space-y-2">
              <label className="flex items-start p-3 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="reassign"
                  checked={action === 'reassign'}
                  onChange={(e) => setAction(e.target.value as ActionType)}
                  className="mt-0.5 h-4 w-4 text-accent focus:ring-accent border-gray-300"
                />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Reassign to someone else</p>
                  <p className="text-xs text-gray-500">Change who's responsible for this item</p>
                </div>
              </label>

              <label className="flex items-start p-3 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="toggle_critical"
                  checked={action === 'toggle_critical'}
                  onChange={(e) => setAction(e.target.value as ActionType)}
                  className="mt-0.5 h-4 w-4 text-accent focus:ring-accent border-gray-300"
                />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Change critical status</p>
                  <p className="text-xs text-gray-500">Mark as critical/non-critical</p>
                </div>
              </label>

              <label className="flex items-start p-3 border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="action"
                  value="edit_item"
                  checked={action === 'edit_item'}
                  onChange={(e) => setAction(e.target.value as ActionType)}
                  className="mt-0.5 h-4 w-4 text-accent focus:ring-accent border-gray-300"
                />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Edit item details</p>
                  <p className="text-xs text-gray-500">Update name, quantity, or description</p>
                </div>
              </label>
            </div>
          </div>

          {/* Conditional Fields Based on Action */}
          <div className="border-t pt-4">
            {action === 'reassign' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Assignee
                  </label>
                  <select
                    value={newPersonId}
                    onChange={(e) => setNewPersonId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="">Unassigned (remove current assignment)</option>
                    {teamPeople.map((person) => (
                      <option
                        key={person.personId}
                        value={person.personId}
                        disabled={person.personId === currentAssigneeId}
                      >
                        {person.name}
                        {person.personId === currentAssigneeId ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                  {teamPeople.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      No people in this team. Add people to the team first.
                    </p>
                  )}
                </div>

                {hasAssignment && item.assignment && (
                  <div className="flex items-center p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <input
                      type="checkbox"
                      id="notify-removed"
                      checked={notifyRemoved}
                      onChange={(e) => setNotifyRemoved(e.target.checked)}
                      className="h-4 w-4 text-accent focus:ring-accent border-gray-300 rounded"
                    />
                    <label htmlFor="notify-removed" className="ml-2 text-sm text-gray-700">
                      Notify {item.assignment.person.name} that they've been unassigned
                    </label>
                  </div>
                )}
              </div>
            )}

            {action === 'toggle_critical' && (
              <div>
                <div className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <input
                    type="checkbox"
                    id="critical-toggle"
                    checked={critical}
                    onChange={(e) => setCritical(e.target.checked)}
                    className="h-4 w-4 text-accent focus:ring-accent border-gray-300 rounded"
                  />
                  <label htmlFor="critical-toggle" className="ml-2 text-sm text-gray-700">
                    Mark as critical (must-have item)
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Current status: {item.critical ? 'Critical' : 'Non-critical'}
                </p>
              </div>
            )}

            {action === 'edit_item' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="e.g., Grilled Chicken Skewers"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="e.g., 2 bags, 500g"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="Additional details..."
                  />
                </div>

                {item.assignment && item.assignment.response === 'ACCEPTED' && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-xs text-yellow-800">
                      <strong>Note:</strong> This item has been confirmed by{' '}
                      {item.assignment.person.name}. Editing will reset their confirmation and
                      notify them to re-confirm.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reason Field */}
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Why is this change needed? *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="E.g., Jake can't make it anymore, Need more quantity, This item is now essential..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              This reason will be logged in the audit trail for transparency.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save Change'}
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
        </form>
      </div>
    </div>
  );
}
