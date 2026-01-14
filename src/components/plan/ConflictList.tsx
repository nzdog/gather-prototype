'use client';

import { useState } from 'react';
import { Conflict } from '@prisma/client';
import ConflictCard from './ConflictCard';
import AcknowledgeModal from './AcknowledgeModal';

interface ConflictListProps {
  eventId: string;
  conflicts: Conflict[];
  onConflictsChanged?: () => void;
  hasRunCheck?: boolean;
}

export default function ConflictList({
  eventId,
  conflicts,
  onConflictsChanged,
  hasRunCheck = false,
}: ConflictListProps) {
  const [acknowledgeModalOpen, setAcknowledgeModalOpen] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);

  // Group conflicts by severity (critical first)
  const criticalConflicts = conflicts.filter((c) => c.severity === 'CRITICAL');
  const significantConflicts = conflicts.filter((c) => c.severity === 'SIGNIFICANT');
  const advisoryConflicts = conflicts.filter((c) => c.severity === 'ADVISORY');

  const handleResolve = async (conflictId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedBy: 'current-user-id' }), // TODO: Get actual user ID
      });

      if (!response.ok) {
        throw new Error('Failed to resolve conflict');
      }

      onConflictsChanged?.();
    } catch (error) {
      console.error('Error resolving conflict:', error);
      alert('Failed to resolve conflict');
    }
  };

  const handleDismiss = async (conflictId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/conflicts/${conflictId}/dismiss`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to dismiss conflict');
      }

      onConflictsChanged?.();
    } catch (error) {
      console.error('Error dismissing conflict:', error);
      alert('Failed to dismiss conflict');
    }
  };

  const handleDelegate = async (conflictId: string) => {
    try {
      const response = await fetch(`/api/events/${eventId}/conflicts/${conflictId}/delegate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delegate conflict');
      }

      onConflictsChanged?.();
    } catch (error) {
      console.error('Error delegating conflict:', error);
      alert(error instanceof Error ? error.message : 'Failed to delegate conflict');
    }
  };

  const handleAcknowledge = (conflictId: string) => {
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (conflict) {
      setSelectedConflict(conflict);
      setAcknowledgeModalOpen(true);
    }
  };

  const handleAcknowledgeSubmit = async (acknowledgement: {
    impactStatement: string;
    impactUnderstood: boolean;
    mitigationPlanType: string;
  }) => {
    if (!selectedConflict) return;

    try {
      const response = await fetch(
        `/api/events/${eventId}/conflicts/${selectedConflict.id}/acknowledge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...acknowledgement,
            acknowledgedBy: 'current-user-id', // TODO: Get actual user ID
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to acknowledge conflict');
      }

      setAcknowledgeModalOpen(false);
      setSelectedConflict(null);
      onConflictsChanged?.();
    } catch (error) {
      console.error('Error acknowledging conflict:', error);
      alert(error instanceof Error ? error.message : 'Failed to acknowledge conflict');
    }
  };

  if (conflicts.length === 0) {
    if (!hasRunCheck) {
      return (
        <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-6 text-center">
          <span className="text-3xl">⏸️</span>
          <p className="mt-2 text-gray-900 font-medium">No tests run yet</p>
          <p className="text-sm text-gray-700">Click "Check Plan" to assess your plan for conflicts</p>
        </div>
      );
    }

    return (
      <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6 text-center">
        <span className="text-3xl">✓</span>
        <p className="mt-2 text-green-900 font-medium">No conflicts found</p>
        <p className="text-sm text-green-700">Your plan looks good!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Critical Conflicts */}
      {criticalConflicts.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-red-900 mb-3 uppercase tracking-wide">Critical</h2>
          {criticalConflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              onResolve={handleResolve}
              onDismiss={handleDismiss}
              onDelegate={handleDelegate}
              onAcknowledge={handleAcknowledge}
            />
          ))}
        </div>
      )}

      {/* Significant Conflicts */}
      {significantConflicts.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-orange-900 mb-3 uppercase tracking-wide">
            Significant
          </h2>
          {significantConflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              onResolve={handleResolve}
              onDismiss={handleDismiss}
              onDelegate={handleDelegate}
              onAcknowledge={handleAcknowledge}
            />
          ))}
        </div>
      )}

      {/* Advisory Conflicts */}
      {advisoryConflicts.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-blue-900 mb-3 uppercase tracking-wide">Advisory</h2>
          {advisoryConflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              onResolve={handleResolve}
              onDismiss={handleDismiss}
              onDelegate={handleDelegate}
              onAcknowledge={handleAcknowledge}
            />
          ))}
        </div>
      )}

      {/* Acknowledge Modal */}
      {selectedConflict && (
        <AcknowledgeModal
          isOpen={acknowledgeModalOpen}
          conflict={selectedConflict}
          onClose={() => {
            setAcknowledgeModalOpen(false);
            setSelectedConflict(null);
          }}
          onSubmit={handleAcknowledgeSubmit}
        />
      )}
    </div>
  );
}
