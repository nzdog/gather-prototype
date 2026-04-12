'use client';

interface MomentArcProps {
  currentMoment: 1 | 2 | 3 | 4;
  completedMoments?: number[];
}

const moments = [
  { number: 1, label: "Who's coming?" },
  { number: 2, label: "What's the plan?" },
  { number: 3, label: "Who's bringing what?" },
  { number: 4, label: 'Is everyone sorted?' },
] as const;

export default function MomentArc({ currentMoment, completedMoments = [] }: MomentArcProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3 sm:gap-6">
      {moments.map((moment) => {
        const isCurrent = moment.number === currentMoment;
        const isCompleted = completedMoments.includes(moment.number);

        return (
          <div
            key={moment.number}
            className={`flex items-center gap-2 transition-opacity ${
              isCurrent || isCompleted ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
                isCompleted
                  ? 'bg-green-600 text-white'
                  : isCurrent
                    ? 'bg-accent text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {isCompleted ? '✓' : moment.number}
            </span>
            <span
              className={`text-base ${
                isCompleted
                  ? 'text-green-700 font-medium'
                  : isCurrent
                    ? 'text-gray-900 font-medium'
                    : 'text-gray-400'
              }`}
            >
              {moment.label}
              {isCompleted && ' ✓'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
