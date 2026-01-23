'use client';

import { useState } from 'react';
import { AlertTriangle, User, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface MissingPerson {
  id: string;
  name: string;
  status: string;
  hasPhone: boolean;
  lastAction: string | null;
  daysSinceAnchor: number | null;
}

interface Props {
  people: MissingPerson[];
  onPersonClick: (personId: string) => void;
}

export function WhosMissing({ people, onPersonClick }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Filter to people who haven't confirmed
  const missing = people.filter((p) => p.lastAction !== 'ACCEPTED');

  if (missing.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700">
          <span className="text-xl">🎉</span>
          <span className="font-medium">Everyone has confirmed!</span>
        </div>
      </div>
    );
  }

  // Categorize by urgency
  const notOpened = missing.filter((p) => p.status === 'NOT_SENT' || p.status === 'SENT');
  const openedNotResponded = missing.filter((p) => p.status === 'OPENED');
  const declined = missing.filter((p) => p.lastAction === 'DECLINED');

  const displayList = expanded ? missing : missing.slice(0, 5);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <span className="font-semibold text-amber-800">
          {missing.length} {missing.length === 1 ? 'person' : 'people'} still missing
        </span>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
        {notOpened.length > 0 && (
          <div className="bg-white/50 rounded px-2 py-1">
            <span className="text-amber-700">{notOpened.length} haven't opened</span>
          </div>
        )}
        {openedNotResponded.length > 0 && (
          <div className="bg-white/50 rounded px-2 py-1">
            <span className="text-amber-700">{openedNotResponded.length} opened, no response</span>
          </div>
        )}
        {declined.length > 0 && (
          <div className="bg-white/50 rounded px-2 py-1">
            <span className="text-red-700">{declined.length} declined</span>
          </div>
        )}
      </div>

      {/* Person list */}
      <div className="space-y-2">
        {displayList.map((person) => (
          <button
            key={person.id}
            onClick={() => {
              console.log('WhosMissing: Person clicked:', person.id, person.name);
              onPersonClick(person.id);
            }}
            className="w-full flex items-center justify-between p-2 bg-white rounded-lg hover:bg-amber-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{person.name}</span>
              {!person.hasPhone && <span className="text-xs text-gray-400">(no phone)</span>}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {person.daysSinceAnchor !== null && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {person.daysSinceAnchor}d ago
                </span>
              )}
              <StatusDot status={person.status} />
            </div>
          </button>
        ))}
      </div>

      {/* Expand/collapse */}
      {missing.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 flex items-center justify-center gap-1 text-sm text-amber-700 hover:text-amber-800"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show all {missing.length}
            </>
          )}
        </button>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NOT_SENT: 'bg-gray-400',
    SENT: 'bg-yellow-400',
    OPENED: 'bg-blue-400',
    RESPONDED: 'bg-purple-400',
  };

  return (
    <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-400'}`} title={status} />
  );
}
