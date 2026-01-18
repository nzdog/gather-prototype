interface ItemStatusBadgesProps {
  assignment?: {
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  } | null;
}

export default function ItemStatusBadges({ assignment }: ItemStatusBadgesProps) {
  const isAssigned = !!assignment;
  const isConfirmed = assignment?.response === 'ACCEPTED';

  return (
    <div className="flex gap-2">
      {/* Assignment Badge */}
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          isAssigned
            ? 'bg-sage-100 text-sage-800'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {isAssigned ? 'Assigned' : 'Unassigned'}
      </span>

      {/* Confirmation Badge */}
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          isConfirmed
            ? 'bg-green-100 text-green-800'
            : 'bg-yellow-100 text-yellow-800'
        }`}
      >
        {isConfirmed ? 'Confirmed' : 'Not confirmed'}
      </span>
    </div>
  );
}
