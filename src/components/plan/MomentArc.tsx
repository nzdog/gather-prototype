'use client';

interface MomentArcProps {
  currentMoment: 1 | 2 | 3 | 4;
}

const moments = [
  { number: 1, label: "Who's coming?" },
  { number: 2, label: "What's the plan?" },
  { number: 3, label: "Who's bringing what?" },
  { number: 4, label: 'Is everyone sorted?' },
] as const;

export default function MomentArc({ currentMoment }: MomentArcProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3 sm:gap-6">
      {moments.map((moment) => {
        const isCurrent = moment.number === currentMoment;

        return (
          <div
            key={moment.number}
            className={`flex items-center gap-2 transition-opacity ${
              isCurrent ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
                isCurrent ? 'bg-accent text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {moment.number}
            </span>
            <span
              className={`text-base ${isCurrent ? 'text-gray-900 font-medium' : 'text-gray-400'}`}
            >
              {moment.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
