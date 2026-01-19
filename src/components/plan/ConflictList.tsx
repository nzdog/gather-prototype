'use client';

import { useState } from 'react';
import { Conflict } from '@prisma/client';
import ConflictCard from './ConflictCard';
import AcknowledgeModal from './AcknowledgeModal';
import ResolveWithAIModal from './ResolveWithAIModal';

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
  const [resolveWithAIModalOpen, setResolveWithAIModalOpen] = useState(false);
  const [aiResolveConflict, setAiResolveConflict] = useState<Conflict | null>(null);

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
      alert('Conflict resolved successfully!');
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
      alert('Conflict dismissed successfully!');
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
      alert('Conflict delegated to coordinator successfully!');
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

  const handleResolveWithAI = (conflictId: string) => {
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (conflict) {
      setAiResolveConflict(conflict);
      setResolveWithAIModalOpen(true);
    }
  };

  const handleAcceptAISuggestion = async (_conflictId: string) => {
    // The modal handles execution and resolution
    // Just refresh the conflict list
    setResolveWithAIModalOpen(false);
    setAiResolveConflict(null);
    onConflictsChanged?.();
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
      alert('Conflict acknowledged successfully!');
    } catch (error) {
      console.error('Error acknowledging conflict:', error);
      alert(error instanceof Error ? error.message : 'Failed to acknowledge conflict');
    }
  };

  if (conflicts.length === 0) {
    if (!hasRunCheck) {
      return (
        <div className="bg-sage-50 border border-sage-200 rounded-lg p-8">
          <div className="max-w-xs mx-auto text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-sage-100 rounded-full mb-3">
              <svg className="w-6 h-6 text-sage-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-sage-900 mb-1">Ready to check your plan</p>
            <p className="text-sm text-sage-600">Click "Check Plan" to assess for potential conflicts</p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-sage-50 border border-sage-200 rounded-lg p-8">
        <div className="max-w-xs mx-auto text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-sage-600 rounded-full mb-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-sage-900 mb-1">No conflicts found</p>
          <p className="text-sm text-sage-600">Your plan is looking great!</p>
        </div>
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
              onResolveWithAI={handleResolveWithAI}
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
              onResolveWithAI={handleResolveWithAI}
            />
          ))}
        </div>
      )}

      {/* Advisory Conflicts */}
      {advisoryConflicts.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-sage-900 mb-3 uppercase tracking-wide">Advisory</h2>
          {advisoryConflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              onResolve={handleResolve}
              onDismiss={handleDismiss}
              onDelegate={handleDelegate}
              onAcknowledge={handleAcknowledge}
              onResolveWithAI={handleResolveWithAI}
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

      {/* Resolve with AI Modal */}
      {aiResolveConflict && (
        <ResolveWithAIModal
          isOpen={resolveWithAIModalOpen}
          conflict={aiResolveConflict}
          eventId={eventId}
          onClose={() => {
            setResolveWithAIModalOpen(false);
            setAiResolveConflict(null);
          }}
          onAccept={handleAcceptAISuggestion}
        />
      )}
    </div>
  );
}
