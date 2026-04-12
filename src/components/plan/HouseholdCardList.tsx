'use client';

import { useEffect, useRef, useState } from 'react';

export interface SavedHousehold {
  id: string;
  primaryContact: { name: string; email?: string; phone?: string };
  partner?: { name: string; email?: string; phone?: string };
  childCount: number;
  guests: Array<{ name: string; email?: string; phone?: string }>;
}

interface HouseholdCardListProps {
  households: SavedHousehold[];
  onEdit: (householdId: string) => void;
}

export default function HouseholdCardList({ households, onEdit }: HouseholdCardListProps) {
  if (households.length === 0) return null;

  return (
    <div className="space-y-3">
      {households.map((household) => (
        <HouseholdCard key={household.id} household={household} onEdit={onEdit} />
      ))}
    </div>
  );
}

function HouseholdCard({
  household,
  onEdit,
}: {
  household: SavedHousehold;
  onEdit: (householdId: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger fade-in on mount
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const additionalCount =
    (household.partner ? 1 : 0) + household.childCount + household.guests.length;

  const hasMemberSummary =
    household.partner || household.childCount > 0 || household.guests.length > 0;

  return (
    <div
      ref={cardRef}
      className="border border-gray-200 rounded-lg px-4 py-3 bg-white transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
    >
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
          {household.childCount > 0 && <span>🧒 {household.childCount}</span>}
          {household.guests.map((guest, i) => (
            <span key={i}>👤 {guest.name}</span>
          ))}
        </div>
      )}

      {/* Edit link */}
      <div className="flex justify-end mt-1">
        <button
          type="button"
          onClick={() => onEdit(household.id)}
          className="text-sm text-accent hover:text-accent-dark transition-colors"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
