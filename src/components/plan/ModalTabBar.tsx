'use client';

import { Calendar, Users, Package, AlertCircle, Link as LinkIcon, Clock } from 'lucide-react';

export type ModalTabId =
  | 'details'
  | 'people'
  | 'items'
  | 'teams'
  | 'planstatus'
  | 'invites'
  | 'history';

interface TabDef {
  id: ModalTabId;
  label: string;
  icon: React.ReactNode;
}

const ALL_TABS: TabDef[] = [
  { id: 'details', label: 'Details', icon: <Calendar className="w-4 h-4" /> },
  { id: 'people', label: 'People', icon: <Users className="w-4 h-4" /> },
  { id: 'items', label: 'Items', icon: <Package className="w-4 h-4" /> },
  { id: 'teams', label: 'Teams', icon: <Users className="w-4 h-4" /> },
  { id: 'planstatus', label: 'Plan Status', icon: <AlertCircle className="w-4 h-4" /> },
  { id: 'invites', label: 'Invites', icon: <LinkIcon className="w-4 h-4" /> },
  { id: 'history', label: 'History', icon: <Clock className="w-4 h-4" /> },
];

function getTabsForStatus(eventStatus: string): TabDef[] {
  if (eventStatus === 'DRAFT') {
    return ALL_TABS.filter((t) => t.id !== 'invites');
  }
  return ALL_TABS;
}

const TAB_LABELS: Record<ModalTabId, string> = {
  details: 'Details',
  people: 'People',
  items: 'Items',
  teams: 'Teams',
  planstatus: 'Plan Status',
  invites: 'Invites',
  history: 'History',
};

interface ModalTabBarProps {
  activeTab: ModalTabId;
  eventStatus: string;
  onNavigate: (tabId: ModalTabId) => void;
  /** Called when "Plan" breadcrumb is clicked to return to dashboard */
  onCloseToDashboard: () => void;
  /** Breadcrumb trail of tab IDs visited (optional — defaults to just active) */
  breadcrumbTrail?: ModalTabId[];
  /** Tabs to omit entirely, e.g. 'history' on V2 events (GTC-149) */
  hiddenTabs?: ModalTabId[];
}

export default function ModalTabBar({
  activeTab,
  eventStatus,
  onNavigate,
  onCloseToDashboard,
  breadcrumbTrail,
  hiddenTabs,
}: ModalTabBarProps) {
  const tabs = getTabsForStatus(eventStatus).filter((t) => !hiddenTabs?.includes(t.id));

  // Breadcrumb: Plan › [previous tabs] › current
  const trail = breadcrumbTrail ?? [activeTab];

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 px-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-3 pb-2">
        <button onClick={onCloseToDashboard} className="hover:text-accent hover:underline">
          Plan
        </button>
        {trail.map((crumbId, idx) => (
          <span key={crumbId} className="flex items-center gap-1.5">
            <span className="text-gray-400">›</span>
            {idx < trail.length - 1 ? (
              <button
                onClick={() => onNavigate(crumbId)}
                className="hover:text-accent hover:underline"
              >
                {TAB_LABELS[crumbId]}
              </button>
            ) : (
              <span className="text-gray-700 font-medium">{TAB_LABELS[crumbId]}</span>
            )}
          </span>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 -mb-px overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (!isActive) onNavigate(tab.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
