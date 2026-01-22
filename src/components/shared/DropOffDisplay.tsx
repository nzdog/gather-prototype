import { MapPin, Clock } from 'lucide-react';
import { formatDropOffTime } from '@/lib/formatDropOff';

interface DropOffDisplayProps {
  dropOffLocation?: string | null;
  dropOffAt?: string | null;
  dropOffNote?: string | null;
  variant?: 'inline' | 'stacked';
  showIcons?: boolean;
  className?: string;
}

/**
 * Displays drop-off location and time in a consistent format
 *
 * Formatting rules:
 * - Both present: "Drop-off: <place> · By: <time>"
 * - Place only: "Drop-off: <place>"
 * - Time only: "By: <time>"
 * - Neither: renders nothing
 */
export function DropOffDisplay({
  dropOffLocation,
  dropOffAt,
  dropOffNote,
  variant = 'inline',
  showIcons = true,
  className = '',
}: DropOffDisplayProps) {
  const formattedTime = formatDropOffTime(dropOffAt, dropOffNote);

  // Don't render if no drop-off info available
  if (!dropOffLocation && !formattedTime) {
    return null;
  }

  // Inline variant: single line with separator
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        {dropOffLocation && (
          <div className="flex items-center gap-1.5">
            {showIcons && <MapPin className="size-4 text-gray-400" />}
            <span className="text-gray-500">Drop-off:</span>
            <span className="text-gray-900">{dropOffLocation}</span>
          </div>
        )}
        {dropOffLocation && formattedTime && <span className="text-gray-400">·</span>}
        {formattedTime && (
          <div className="flex items-center gap-1.5">
            {showIcons && <Clock className="size-4 text-gray-400" />}
            <span className="text-gray-500">By:</span>
            <span className="text-gray-900">{formattedTime}</span>
          </div>
        )}
      </div>
    );
  }

  // Stacked variant: separate rows
  return (
    <div className={`space-y-2 ${className}`}>
      {dropOffLocation && (
        <div className="flex items-center gap-2 text-sm">
          {showIcons && <MapPin className="size-4 text-gray-400" />}
          <span className="text-gray-500">Drop-off:</span>
          <span className="text-gray-900">{dropOffLocation}</span>
        </div>
      )}
      {formattedTime && (
        <div className="flex items-center gap-2 text-sm">
          {showIcons && <Clock className="size-4 text-gray-400" />}
          <span className="text-gray-500">By:</span>
          <span className="text-gray-900">{formattedTime}</span>
        </div>
      )}
    </div>
  );
}
