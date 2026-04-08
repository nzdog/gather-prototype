interface ItemStatusBadgesProps {
  assignment?: {
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  } | null;
}

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
