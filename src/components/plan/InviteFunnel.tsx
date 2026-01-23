'use client';

import { useMemo } from 'react';
import { Users, Send, Eye, MessageSquare, CheckCircle } from 'lucide-react';

interface FunnelData {
  total: number;
  sent: number;
  opened: number;
  responded: number;
  confirmed: number; // ACCEPTED responses
}

interface Props {
  data: FunnelData;
}

export function InviteFunnel({ data }: Props) {
  const stages = useMemo(
    () => [
      {
        name: 'Waiting to send',
        count: data.total,
        icon: Users,
        color: 'bg-gray-100 text-gray-600',
        description: 'Total people',
      },
      {
        name: 'Sent',
        count: data.sent,
        icon: Send,
        color: 'bg-yellow-100 text-yellow-700',
        description: 'Invites marked as sent',
        dropoff: data.total > 0 ? data.total - data.sent : 0,
      },
      {
        name: 'Opened',
        count: data.opened,
        icon: Eye,
        color: 'bg-blue-100 text-blue-700',
        description: 'Opened their link',
        dropoff: data.sent > 0 ? data.sent - data.opened : 0,
      },
      {
        name: 'Responded',
        count: data.responded,
        icon: MessageSquare,
        color: 'bg-purple-100 text-purple-700',
        description: 'Submitted a response',
        dropoff: data.opened > 0 ? data.opened - data.responded : 0,
      },
      {
        name: 'Confirmed',
        count: data.confirmed,
        icon: CheckCircle,
        color: 'bg-green-100 text-green-700',
        description: 'Accepted their items',
        dropoff: data.responded > 0 ? data.responded - data.confirmed : 0,
      },
    ],
    [data]
  );

  const maxWidth = 100;
  const minWidth = 40;

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-lg mb-4">Invite Funnel</h3>

      <div className="space-y-3">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const widthPercent =
            data.total > 0
              ? minWidth + (stage.count / data.total) * (maxWidth - minWidth)
              : maxWidth;

          return (
            <div key={stage.name} className="relative">
              {/* Stage bar */}
              <div
                className={`${stage.color} rounded-lg p-3 transition-all duration-300`}
                style={{ width: `${widthPercent}%` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{stage.name}</span>
                  </div>
                  <span className="font-bold">{stage.count}</span>
                </div>
              </div>

              {/* Dropoff indicator */}
              {stage.dropoff !== undefined && stage.dropoff > 0 && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2">
                  <span className="text-xs text-red-500">-{stage.dropoff}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Conversion rate */}
      {data.total > 0 && (
        <div className="mt-4 pt-4 border-t text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Overall conversion</span>
            <span className="font-medium">{Math.round((data.confirmed / data.total) * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
