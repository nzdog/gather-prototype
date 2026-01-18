import { useState } from 'react';
import { Calendar, MapPin, Check, AlertCircle, ChevronRight, ChevronLeft, Plus, Lock, Users } from 'lucide-react';

// ============================================================
// DATA - Richardson Family Christmas 2024
// ============================================================

const gatheringData = {
  name: "Richardson Family Christmas",
  dates: "Dec 24-26",
  guestCount: 27,
  host: "Kate",
  teams: [
    {
      id: 'puddings',
      name: 'Puddings',
      coordinator: 'Ian',
      items: [
        { id: 1, name: 'Christmas Pudding', quantity: 1, day: 'Christmas Day', location: 'Marquee', assignee: null, critical: true, notes: 'Traditional recipe please' },
        { id: 2, name: 'Brandy Butter', quantity: 1, day: 'Christmas Day', location: 'Marquee', assignee: null, critical: true, notes: 'Homemade preferred' },
        { id: 3, name: 'Ice Cream', quantity: 2, day: 'Christmas Day', location: 'Marquee', assignee: null, critical: false, notes: 'Vanilla and berry' },
        { id: 4, name: 'Pavlova', quantity: 2, day: 'Christmas Day', location: 'Marquee', assignee: 'Kate', critical: false, confirmed: true, notes: 'Please bring in disposable containers. Keep refrigerated until serving.' },
        { id: 5, name: 'Trifle', quantity: 1, day: 'Christmas Day', location: 'Marquee', assignee: 'Sarah', critical: false, confirmed: true, notes: '' },
      ]
    },
    {
      id: 'mains',
      name: 'Mains & Proteins',
      coordinator: 'Kate',
      items: [
        { id: 6, name: 'Ham', quantity: 1, day: 'Christmas Day', location: 'Marquee', assignee: 'Nigel', critical: true, confirmed: true, notes: 'Glazed, pre-sliced helpful' },
        { id: 7, name: 'Turkey', quantity: 1, day: 'Christmas Day', location: 'Marquee', assignee: 'Mike', critical: true, confirmed: false, notes: 'Free range, about 8kg' },
        { id: 8, name: 'Roast Vegetables', quantity: 3, day: 'Christmas Day', location: 'Marquee', assignee: 'Jacqui', critical: false, confirmed: true, notes: 'Mix of root vegetables' },
        { id: 9, name: 'Gravy', quantity: 2, day: 'Christmas Day', location: 'Marquee', assignee: 'Sarah', critical: false, confirmed: true, notes: '' },
      ]
    },
    {
      id: 'drinks',
      name: 'Drinks',
      coordinator: 'Sarah',
      items: [
        { id: 10, name: 'Champagne', quantity: 6, day: 'Christmas Day', location: 'Marquee', assignee: 'David', critical: false, confirmed: true, notes: 'For the toast' },
        { id: 11, name: 'Red Wine', quantity: 8, day: 'Christmas Day', location: 'Marquee', assignee: 'Mike', critical: false, confirmed: true, notes: '' },
        { id: 12, name: 'White Wine', quantity: 6, day: 'Christmas Day', location: 'Marquee', assignee: 'Lisa', critical: false, confirmed: true, notes: '' },
        { id: 13, name: 'Soft Drinks', quantity: 1, day: 'Christmas Day', location: 'Marquee', assignee: 'Tom', critical: false, confirmed: true, notes: 'Variety pack' },
      ]
    },
    {
      id: 'setup',
      name: 'Setup & Cleanup',
      coordinator: 'Jacqui',
      items: [
        { id: 14, name: 'Table Setup', quantity: 1, day: 'Christmas Eve', location: 'Marquee', assignee: 'Team', critical: false, confirmed: true, notes: '4pm start' },
        { id: 15, name: 'Decorations', quantity: 1, day: 'Christmas Eve', location: 'Marquee', assignee: 'Lisa', critical: false, confirmed: true, notes: '' },
        { id: 16, name: 'Cleanup Crew', quantity: 1, day: 'Boxing Day', location: 'Marquee', assignee: 'Team', critical: false, confirmed: true, notes: '10am' },
      ]
    },
    {
      id: 'later',
      name: 'Later Food',
      coordinator: 'Nigel',
      items: [
        { id: 17, name: 'Cheese Board', quantity: 2, day: 'Christmas Day', location: "Kate's House", assignee: 'David', critical: false, confirmed: true, notes: '' },
        { id: 18, name: 'Crackers & Bread', quantity: 1, day: 'Christmas Day', location: "Kate's House", assignee: null, critical: false, notes: '' },
        { id: 19, name: 'Fruit Platter', quantity: 1, day: 'Christmas Day', location: "Kate's House", assignee: 'Lisa', critical: false, confirmed: true, notes: '' },
      ]
    }
  ]
};

// Helper to compute team status
function getTeamStatus(team: typeof gatheringData.teams[0]) {
  const unassigned = team.items.filter(i => !i.assignee);
  const criticalUnassigned = unassigned.filter(i => i.critical);
  
  if (criticalUnassigned.length > 0) {
    return { status: 'CRITICAL_GAP', gapCount: criticalUnassigned.length };
  } else if (unassigned.length > 0) {
    return { status: 'GAP', gapCount: unassigned.length };
  }
  return { status: 'SORTED', gapCount: 0 };
}

// ============================================================
// PARTICIPANT VIEW
// ============================================================

function ParticipantView({ item, onBack }: { item: typeof gatheringData.teams[0]['items'][0], onBack: () => void }) {
  const [confirmed, setConfirmed] = useState(item.confirmed || false);
  
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <button onClick={onBack} className="flex items-center gap-2 text-blue-600 mb-3 -ml-1">
          <ChevronLeft className="size-5" />
          <span className="font-medium">Back</span>
        </button>
        <div className="text-lg text-gray-900">{gatheringData.name}</div>
        <div className="text-sm text-gray-500 mt-1">{gatheringData.dates} · {gatheringData.guestCount} guests</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          {/* Item Name */}
          <div className="flex items-start justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{item.name}</h2>
            <span className="text-xl text-gray-500">×{item.quantity}</span>
          </div>

          {/* Drop-off Details */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3">
              <Calendar className="size-5 text-gray-400" />
              <span className="text-gray-900">{item.day}, 12:00pm</span>
            </div>
            <div className="flex items-center gap-3">
              <MapPin className="size-5 text-gray-400" />
              <span className="text-gray-900">{item.location}</span>
            </div>
          </div>

          {/* Notes */}
          {item.notes && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600">{item.notes}</p>
            </div>
          )}

          {/* Acknowledge Button */}
          <button
            onClick={() => setConfirmed(!confirmed)}
            className={`w-full h-14 rounded-lg font-medium transition-all ${
              confirmed
                ? 'bg-green-500 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {confirmed ? (
              <span className="flex items-center justify-center gap-2">
                <Check className="size-5" />
                Confirmed
              </span>
            ) : (
              "I've got this"
            )}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <p className="text-center text-sm text-gray-500">
          Questions? Contact <span className="text-blue-600">{gatheringData.host}</span>
        </p>
      </div>
    </div>
  );
}

// ============================================================
// COORDINATOR VIEW
// ============================================================

function CoordinatorView({ team, onBack, onSelectItem }: { 
  team: typeof gatheringData.teams[0], 
  onBack: () => void,
  onSelectItem: (item: typeof gatheringData.teams[0]['items'][0]) => void 
}) {
  const items = team.items;
  const unassignedCount = items.filter(i => !i.assignee).length;
  const criticalCount = items.filter(i => !i.assignee && i.critical).length;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <button onClick={onBack} className="flex items-center gap-2 text-blue-600 mb-3 -ml-1">
          <ChevronLeft className="size-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-1 rounded">
            Coordinating
          </span>
          <span className="text-sm text-gray-500">{gatheringData.guestCount} guests</span>
        </div>
      </div>

      {/* Status Bar */}
      {unassignedCount > 0 ? (
        <div className={`${criticalCount > 0 ? 'bg-red-50' : 'bg-amber-50'} px-6 py-4 flex items-center gap-3`}>
          <AlertCircle className={`size-5 ${criticalCount > 0 ? 'text-red-500' : 'text-amber-500'}`} />
          <span className={`font-semibold ${criticalCount > 0 ? 'text-red-900' : 'text-amber-900'}`}>
            {criticalCount > 0
              ? `${criticalCount} critical ${criticalCount === 1 ? 'item needs' : 'items need'} assignment`
              : `${unassignedCount} ${unassignedCount === 1 ? 'item needs' : 'items need'} assignment`}
          </span>
        </div>
      ) : (
        <div className="bg-green-50 px-6 py-4 flex items-center gap-3">
          <div className="size-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</div>
          <span className="font-semibold text-green-900">All items assigned</span>
        </div>
      )}

      {/* Items List */}
      <div className="flex-1 overflow-y-auto">
        {[...items]
          .sort((a, b) => {
            if (!a.assignee && a.critical) return -1;
            if (!b.assignee && b.critical) return 1;
            if (!a.assignee) return -1;
            if (!b.assignee) return 1;
            return 0;
          })
          .map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="w-full bg-white border-b border-gray-200 px-6 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {!item.assignee && item.critical && (
                      <AlertCircle className="size-4 text-red-500" />
                    )}
                    <span className="font-semibold text-gray-900">{item.name}</span>
                    <span className="text-gray-500">×{item.quantity}</span>
                  </div>
                  <div className="text-sm text-gray-500 mb-2">
                    {item.day} · {item.location}
                  </div>
                  <div className={`text-sm font-medium ${item.assignee ? 'text-gray-900' : 'text-amber-600'}`}>
                    {item.assignee || 'Unassigned'}
                  </div>
                </div>
                <ChevronRight className="size-5 text-gray-400 mt-1" />
              </div>
            </button>
          ))}
      </div>

      {/* Bottom Bar */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <button className="flex items-center gap-2 text-blue-600 font-medium">
          <Plus className="size-5" />
          Add Item
        </button>
      </div>
    </div>
  );
}

// ============================================================
// HOST VIEW
// ============================================================

function HostView({ onSelectTeam }: { onSelectTeam: (team: typeof gatheringData.teams[0]) => void }) {
  const teams = gatheringData.teams.map(team => ({
    ...team,
    ...getTeamStatus(team)
  }));

  const criticalGaps = teams.filter(t => t.status === 'CRITICAL_GAP').reduce((acc, t) => acc + t.gapCount, 0);
  const totalGaps = teams.reduce((acc, t) => acc + t.gapCount, 0);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <h1 className="text-2xl font-bold text-gray-900">{gatheringData.name}</h1>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-gray-500">{gatheringData.dates}</span>
          <span className="text-gray-300">·</span>
          <button className="text-sm text-blue-600 hover:underline">{gatheringData.guestCount} guests</button>
        </div>
      </div>

      {/* Status Banner */}
      {criticalGaps > 0 ? (
        <div className="bg-red-50 px-6 py-4 flex items-center gap-3">
          <AlertCircle className="size-6 text-red-500" />
          <span className="font-semibold text-red-900">
            {criticalGaps} critical {criticalGaps === 1 ? 'gap remains' : 'gaps remain'}
          </span>
        </div>
      ) : totalGaps > 0 ? (
        <div className="bg-amber-50 px-6 py-4 flex items-center gap-3">
          <div className="size-6 rounded-full bg-amber-500 flex items-center justify-center text-white text-sm">!</div>
          <span className="font-semibold text-amber-900">
            Ready to freeze ({totalGaps} non-critical {totalGaps === 1 ? 'gap' : 'gaps'})
          </span>
        </div>
      ) : (
        <div className="bg-green-50 px-6 py-4 flex items-center gap-3">
          <div className="size-6 rounded-full bg-green-500 flex items-center justify-center text-white text-sm">✓</div>
          <span className="font-semibold text-green-900">Ready to freeze</span>
        </div>
      )}

      {/* Teams List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <h2 className="text-sm uppercase tracking-wide text-gray-500 mb-3">Teams</h2>
        <div className="space-y-2">
          {[...teams]
            .sort((a, b) => {
              if (a.status === 'CRITICAL_GAP' && b.status !== 'CRITICAL_GAP') return -1;
              if (b.status === 'CRITICAL_GAP' && a.status !== 'CRITICAL_GAP') return 1;
              if (a.status === 'GAP' && b.status === 'SORTED') return -1;
              if (b.status === 'GAP' && a.status === 'SORTED') return 1;
              return 0;
            })
            .map((team) => (
              <button
                key={team.id}
                onClick={() => onSelectTeam(team)}
                className="w-full bg-white rounded-lg border border-gray-200 px-5 py-4 text-left hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className={`size-3 rounded-full ${
                        team.status === 'CRITICAL_GAP'
                          ? 'bg-red-500'
                          : team.status === 'GAP'
                          ? 'bg-amber-500'
                          : 'bg-green-500'
                      }`}
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">{team.name}</div>
                      <div className="text-sm text-gray-500">{team.coordinator}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm font-medium ${
                        team.status === 'CRITICAL_GAP'
                          ? 'text-red-600'
                          : team.status === 'GAP'
                          ? 'text-amber-600'
                          : 'text-green-600'
                      }`}
                    >
                      {team.status === 'CRITICAL_GAP'
                        ? `${team.gapCount} critical gaps`
                        : team.status === 'GAP'
                        ? `${team.gapCount} ${team.gapCount === 1 ? 'gap' : 'gaps'}`
                        : 'All assigned'}
                    </span>
                    <ChevronRight className="size-5 text-gray-400" />
                  </div>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <button
          disabled={criticalGaps > 0}
          className={`w-full h-14 rounded-lg font-semibold transition-all ${
            criticalGaps > 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <Lock className="size-5" />
            Freeze Event
          </span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// HOST TEAM VIEW (drill-down from Host)
// ============================================================

function HostTeamView({ team, onBack }: { team: typeof gatheringData.teams[0], onBack: () => void }) {
  const items = team.items;
  const unassignedCount = items.filter(i => !i.assignee).length;
  const criticalCount = items.filter(i => !i.assignee && i.critical).length;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <button onClick={onBack} className="flex items-center gap-2 text-blue-600 mb-3 -ml-1">
          <ChevronLeft className="size-5" />
          <span className="font-medium">Back</span>
        </button>
        <h1 className="text-xl font-bold text-gray-900">{team.name}</h1>
        <div className="text-sm text-gray-500 mt-1">Coordinator: {team.coordinator}</div>
      </div>

      {/* Status Bar */}
      {criticalCount > 0 ? (
        <div className="bg-red-50 px-6 py-4 flex items-center gap-3">
          <AlertCircle className="size-5 text-red-500" />
          <span className="font-semibold text-red-900">
            {criticalCount} critical {criticalCount === 1 ? 'item' : 'items'} unassigned
          </span>
        </div>
      ) : unassignedCount > 0 ? (
        <div className="bg-amber-50 px-6 py-4 flex items-center gap-3">
          <AlertCircle className="size-5 text-amber-500" />
          <span className="font-semibold text-amber-900">
            {unassignedCount} {unassignedCount === 1 ? 'item needs' : 'items need'} assignment
          </span>
        </div>
      ) : (
        <div className="bg-green-50 px-6 py-4 flex items-center gap-3">
          <div className="size-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</div>
          <span className="font-semibold text-green-900">All items assigned</span>
        </div>
      )}

      {/* Items List */}
      <div className="flex-1 overflow-y-auto">
        {[...items]
          .sort((a, b) => {
            if (!a.assignee && a.critical) return -1;
            if (!b.assignee && b.critical) return 1;
            if (!a.assignee) return -1;
            if (!b.assignee) return 1;
            return 0;
          })
          .map((item) => (
            <div
              key={item.id}
              className="bg-white border-b border-gray-200 px-6 py-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {!item.assignee && item.critical && (
                      <AlertCircle className="size-4 text-red-500" />
                    )}
                    <span className="font-semibold text-gray-900">{item.name}</span>
                    <span className="text-gray-500">×{item.quantity}</span>
                  </div>
                  <div className="text-sm text-gray-500 mb-2">
                    {item.day} · {item.location}
                  </div>
                  <div className={`text-sm font-medium ${item.assignee ? 'text-gray-900' : 'text-amber-600'}`}>
                    {item.assignee || 'Unassigned'}
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ============================================================
// ROLE SELECTOR (Demo Entry Point)
// ============================================================

function RoleSelector({ onSelectRole }: { onSelectRole: (role: string, context?: any) => void }) {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Gather Demo</h1>
          <p className="text-gray-500">Richardson Family Christmas</p>
        </div>
        
        <div className="w-full max-w-sm space-y-3">
          <p className="text-sm text-gray-500 text-center mb-4">Choose your view:</p>
          
          <button
            onClick={() => onSelectRole('participant', gatheringData.teams[0].items[3])} // Kate's Pavlova
            className="w-full bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="font-semibold text-gray-900 mb-1">👤 Participant</div>
            <div className="text-sm text-gray-500">You're Kate bringing Pavlova</div>
          </button>
          
          <button
            onClick={() => onSelectRole('coordinator', gatheringData.teams[0])} // Puddings team
            className="w-full bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="font-semibold text-gray-900 mb-1">📋 Coordinator</div>
            <div className="text-sm text-gray-500">You're Ian coordinating Puddings</div>
          </button>
          
          <button
            onClick={() => onSelectRole('host')}
            className="w-full bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="font-semibold text-gray-900 mb-1">🏠 Host</div>
            <div className="text-sm text-gray-500">You're Kate hosting the event</div>
          </button>
        </div>
      </div>
      
      <div className="p-6 text-center">
        <p className="text-xs text-gray-400">Tap any role to see that person's view</p>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  const [view, setView] = useState<'selector' | 'participant' | 'coordinator' | 'host' | 'hostTeam'>('selector');
  const [context, setContext] = useState<any>(null);
  
  const handleSelectRole = (role: string, ctx?: any) => {
    setContext(ctx);
    setView(role as any);
  };
  
  const handleBack = () => {
    if (view === 'hostTeam') {
      setView('host');
    } else {
      setView('selector');
      setContext(null);
    }
  };
  
  const handleSelectTeam = (team: typeof gatheringData.teams[0]) => {
    setContext(team);
    setView('hostTeam');
  };
  
  const handleSelectItem = (item: typeof gatheringData.teams[0]['items'][0]) => {
    setContext(item);
    setView('participant');
  };

  return (
    <div className="h-screen w-full bg-gray-100">
      <div className="h-full max-w-md mx-auto bg-white shadow-xl">
        {view === 'selector' && <RoleSelector onSelectRole={handleSelectRole} />}
        {view === 'participant' && context && <ParticipantView item={context} onBack={handleBack} />}
        {view === 'coordinator' && context && <CoordinatorView team={context} onBack={handleBack} onSelectItem={handleSelectItem} />}
        {view === 'host' && <HostView onSelectTeam={handleSelectTeam} />}
        {view === 'hostTeam' && context && <HostTeamView team={context} onBack={handleBack} />}
      </div>
    </div>
  );
}
