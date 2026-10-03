interface ItemStatusBadgesProps {
  assignment?: {
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
  } | null;
}

/**
 * GTC-174 (D1): MAYBE renders AMBER, never red. Hinge §8 — "colour: yellow. The system
 * can work a maybe — just not with the silence machinery." A maybe is a surfaced
 * decision, not a gap; showing it red would say the item is loose when it is still the
 * guest's.
 */
export default function ItemStatusBadges({ assignment }: ItemStatusBadgesProps) {
  const isAssigned = !!assignment;

  const confirmationStyle = !isAssigned
    ? 'bg-gray-100 text-gray-500'
    : assignment.response === 'ACCEPTED'
      ? 'bg-green-100 text-green-800'
      : assignment.response === 'DECLINED'
        ? 'bg-red-100 text-red-800'
        : 'bg-amber-100 text-amber-800';

  const confirmationLabel = !isAssigned
    ? 'Unassigned'
    : assignment.response === 'ACCEPTED'
      ? 'Confirmed'
      : assignment.response === 'DECLINED'
        ? 'Declined'
        : assignment.response === 'MAYBE'
          ? 'Maybe'
          : 'Pending';

  return (
    <div className="flex gap-2">
      {/* Assignment Badge */}
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          isAssigned ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {isAssigned ? 'Assigned' : 'Unassigned'}
      </span>

      {/* Confirmation Badge */}
      <span className={`px-2 py-1 rounded text-xs font-medium ${confirmationStyle}`}>
        {confirmationLabel}
      </span>
    </div>
  );
}
