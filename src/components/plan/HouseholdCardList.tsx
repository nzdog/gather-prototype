'use client';

import { useEffect, useRef, useState } from 'react';

export interface SavedHousehold {
  id: string;
  primaryContact: { name: string; email?: string; phone?: string };
  partner?: { name: string; email?: string; phone?: string };
  helpers: Array<{ name: string; email?: string; phone?: string }>;
  littleCount: number;
  guests: Array<{ name: string; email?: string; phone?: string }>;
}

interface HouseholdCardListProps {
  households: SavedHousehold[];
  onEdit: (householdId: string) => void;
  onDelete?: (householdId: string) => Promise<void>;
  editingHouseholdId?: string | null;
}

export default function HouseholdCardList({
  households,
  onEdit,
  onDelete,
  editingHouseholdId,
}: HouseholdCardListProps) {
  if (households.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-500 mb-3">Ducks in row so far</p>
      {households.map((household) => (
        <HouseholdCard
          key={household.id}
          household={household}
          onEdit={onEdit}
          onDelete={onDelete}
          isEditing={editingHouseholdId === household.id}
        />
      ))}
    </div>
  );
}

function HouseholdCard({
  household,
  onEdit,
  onDelete,
  isEditing,
}: {
  household: SavedHousehold;
  onEdit: (householdId: string) => void;
  onDelete?: (householdId: string) => Promise<void>;
  isEditing: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Trigger fade-in on mount
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      errorTimerRef.current = setTimeout(() => setError(null), 5000);
      return () => {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      };
    }
  }, [error]);

  // Clear error on any card interaction
  const clearError = () => {
    if (error) {
      setError(null);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(household.id);
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
      setError("Couldn't remove — try again.");
    }
  };

  const additionalCount =
    (household.partner ? 1 : 0) +
    household.helpers.length +
    household.littleCount +
    household.guests.length;

  const hasMemberSummary =
    household.partner ||
    household.helpers.length > 0 ||
    household.littleCount > 0 ||
    household.guests.length > 0;

  // Confirmation state
  if (confirmingDelete) {
    return (
      <div
        ref={cardRef}
        className="border border-gray-200 rounded-lg px-4 py-3 bg-white transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <p className="text-sm text-gray-900 mb-2">Remove {household.primaryContact.name}?</p>
        <div className="flex justify-center gap-4">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-red-600 font-medium hover:text-red-800 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Removing…' : 'Remove'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
            className="text-sm text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
          >
            Keep
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className="border border-gray-200 rounded-lg px-4 py-3 bg-white transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
      onClick={clearError}
    >
      {/* Error message */}
      {error && <p className="text-red-600 text-sm mb-1">{error}</p>}

      {/* Line 1: Name + badge */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">{household.primaryContact.name}</span>
        <div className="flex items-center gap-2">
          {additionalCount > 0 && (
            <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
              +{additionalCount}
            </span>
          )}
        </div>
      </div>

      {/* Line 2: Member summary */}
      {hasMemberSummary && (
        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500">
          {household.partner && <span>👫 {household.partner.name}</span>}
          {household.helpers.map((helper, i) => (
            <span key={`helper-${i}`}>👦 {helper.name}</span>
          ))}
          {household.littleCount > 0 && <span>🧒 {household.littleCount}</span>}
          {household.guests.map((guest, i) => (
            <span key={i}>👤 {guest.name}</span>
          ))}
        </div>
      )}

      {/* Action links */}
      <div className="flex justify-end gap-3 mt-1">
        <button
          type="button"
          onClick={() => {
            clearError();
            onEdit(household.id);
          }}
          className="text-sm text-accent hover:text-accent-dark transition-colors"
        >
          Edit
        </button>
        {onDelete && !isEditing && (
          <button
            type="button"
            onClick={() => {
              clearError();
              setConfirmingDelete(true);
            }}
            className="text-sm text-red-400 hover:text-red-600 transition-colors"
          >
            Del
          </button>
        )}
      </div>
    </div>
  );
}
