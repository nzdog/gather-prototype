'use client';

import { useState } from 'react';
import { Users, X } from 'lucide-react';

interface ReachabilityData {
  direct: number;
  proxy: number;
  shared: number;
  untrackable: number;
}

interface PersonDetail {
  id: string;
  name: string;
  reachabilityTier: 'DIRECT' | 'PROXY' | 'SHARED' | 'UNTRACKABLE';
}

interface Props {
  data: ReachabilityData;
  people?: PersonDetail[];
}

export function ReachabilityBar({ data, people = [] }: Props) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const total = data.direct + data.proxy + data.shared + data.untrackable;

  if (total === 0) {
    return null;
  }

  // Calculate percentages
  const directPercent = (data.direct / total) * 100;
  const proxyPercent = (data.proxy / total) * 100;
  const sharedPercent = (data.shared / total) * 100;
  const untrackablePercent = (data.untrackable / total) * 100;

  // Trackable = DIRECT
  // Via Proxy = PROXY
  // Untrackable = SHARED + UNTRACKABLE (combined)
  const trackable = data.direct;
  const viaProxy = data.proxy;
  const untrackable = data.shared + data.untrackable;

  const handleSegmentClick = (tier: string) => {
    setSelectedTier(tier);
  };

  const getFilteredPeople = (tier: string): PersonDetail[] => {
    if (!people.length) return [];

    switch (tier) {
      case 'trackable':
        return people.filter((p) => p.reachabilityTier === 'DIRECT');
      case 'proxy':
        return people.filter((p) => p.reachabilityTier === 'PROXY');
      case 'untrackable':
        return people.filter(
          (p) => p.reachabilityTier === 'SHARED' || p.reachabilityTier === 'UNTRACKABLE'
        );
      default:
        return [];
    }
  };

  return (
    <div className="space-y-3">
      {/* Summary text */}
      <div className="text-sm text-gray-700">
        <span className="font-medium text-green-700">{trackable} trackable</span>
        {viaProxy > 0 && (
          <>
            {' · '}
            <span className="font-medium text-blue-700">{viaProxy} via proxy</span>
          </>
        )}
        {untrackable > 0 && (
          <>
            {' · '}
            <span className="font-medium text-amber-700">{untrackable} untrackable</span>
          </>
        )}
      </div>

      {/* Visual bar */}
      <div className="flex h-8 rounded-lg overflow-hidden border border-gray-200">
        {/* Trackable (DIRECT) */}
        {directPercent > 0 && (
          <div
            className="bg-green-500 hover:bg-green-600 cursor-pointer transition-colors flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${directPercent}%` }}
            onClick={() => handleSegmentClick('trackable')}
            title={`${data.direct} trackable (direct contact)`}
          >
            {directPercent > 10 && data.direct}
          </div>
        )}

        {/* Via Proxy (PROXY) */}
        {proxyPercent > 0 && (
          <div
            className="bg-blue-500 hover:bg-blue-600 cursor-pointer transition-colors flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${proxyPercent}%` }}
            onClick={() => handleSegmentClick('proxy')}
            title={`${data.proxy} via proxy`}
          >
            {proxyPercent > 10 && data.proxy}
          </div>
        )}

        {/* Shared link (SHARED) */}
        {sharedPercent > 0 && (
          <div
            className="bg-amber-400 hover:bg-amber-500 cursor-pointer transition-colors flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${sharedPercent}%` }}
            onClick={() => handleSegmentClick('untrackable')}
            title={`${data.shared} claimed via shared link`}
          >
            {sharedPercent > 10 && data.shared}
          </div>
        )}

        {/* Untrackable (UNTRACKABLE) */}
        {untrackablePercent > 0 && (
          <div
            className="bg-gray-400 hover:bg-gray-500 cursor-pointer transition-colors flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${untrackablePercent}%` }}
            onClick={() => handleSegmentClick('untrackable')}
            title={`${data.untrackable} untrackable`}
          >
            {untrackablePercent > 10 && data.untrackable}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span>Trackable (direct)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span>Via proxy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-amber-400 rounded"></div>
          <span>Shared link</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-gray-400 rounded"></div>
          <span>Untrackable</span>
        </div>
      </div>

      {/* Modal showing names in selected tier */}
      {selectedTier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">
                  {selectedTier === 'trackable' && 'Trackable People'}
                  {selectedTier === 'proxy' && 'Via Proxy'}
                  {selectedTier === 'untrackable' && 'Untrackable People'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTier(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto flex-1">
              {getFilteredPeople(selectedTier).length === 0 ? (
                <p className="text-gray-500 text-center py-8">No people in this category</p>
              ) : (
                <ul className="space-y-2">
                  {getFilteredPeople(selectedTier).map((person) => (
                    <li
                      key={person.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-medium text-sm">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-gray-900">{person.name}</span>
                      <span className="ml-auto text-xs text-gray-500">
                        {person.reachabilityTier}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setSelectedTier(null)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
