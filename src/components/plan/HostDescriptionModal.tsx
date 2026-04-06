'use client';

import { useState, useEffect } from 'react';
import { useModal } from '@/contexts/ModalContext';
import GuidedPlanBuilder, { GuidedEventContext } from './GuidedPlanBuilder';

interface HostDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (hostDescription: string) => Promise<void>;
  onSkip: () => void;
  eventContext?: GuidedEventContext;
}

type ModalView = 'choice' | 'quick' | 'guided';

export default function HostDescriptionModal({
  isOpen,
  onClose,
  onGenerate,
  onSkip,
  eventContext,
}: HostDescriptionModalProps) {
  const { openModal, closeModal } = useModal();
  const [description, setDescription] = useState('');
  const [view, setView] = useState<ModalView>('choice');

  // Modal blocking check
  useEffect(() => {
    if (isOpen) {
      if (!openModal('host-description-modal')) {
        onClose();
      }
    } else {
      closeModal();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDescription('');
      setView('choice');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  const handleQuickGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
    onGenerate(description.trim());
  };

  const handleGuidedSubmit = (compiledPrompt: string) => {
    onClose();
    onGenerate(compiledPrompt);
  };

  // Near-full viewport modal for guided mode, standard for other views
  const modalSize = view === 'guided' ? 'max-w-[90vw] w-[90vw] h-[90vh]' : 'max-w-lg w-full';

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]"
      onClick={view === 'guided' ? undefined : onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-xl ${modalSize} mx-4 max-h-[90vh] overflow-y-auto flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* ── Choice screen ─────────────────────────────────────────────── */}
          {view === 'choice' && (
            <div>
              <h2 className="text-xl font-semibold mb-1">
                How would you like to generate your plan?
              </h2>
              <p className="text-gray-500 text-sm mb-5">Choose an approach that works for you.</p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-6">
                {/* Quick Generate */}
                <button
                  onClick={() => setView('quick')}
                  className="flex flex-col items-start text-left p-4 rounded-lg border-2 border-gray-200 hover:border-accent hover:bg-gray-50 transition-colors group"
                >
                  <span className="text-2xl mb-2">⚡</span>
                  <span className="font-semibold text-gray-800 group-hover:text-accent">
                    Quick Generate
                  </span>
                  <span className="text-sm text-gray-500 mt-1">
                    Describe your event in your own words
                  </span>
                </button>

                {/* Guided Build */}
                <button
                  onClick={() => setView('guided')}
                  className="flex flex-col items-start text-left p-4 rounded-lg border-2 border-gray-200 hover:border-accent hover:bg-gray-50 transition-colors group"
                >
                  <span className="text-2xl mb-2">🗂</span>
                  <span className="font-semibold text-gray-800 group-hover:text-accent">
                    Guided Build
                  </span>
                  <span className="text-sm text-gray-500 mt-1">
                    Choose what you want step by step
                  </span>
                </button>
              </div>

              <div className="flex justify-between items-center">
                <button onClick={handleSkip} className="text-sm text-gray-500 hover:text-gray-700">
                  Skip — generate without input
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Quick Generate screen ──────────────────────────────────────── */}
          {view === 'quick' && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Tell us about your event</h2>
              <p className="text-gray-600 text-sm mb-4">
                This helps generate a better plan (optional)
              </p>

              <form onSubmit={handleQuickGenerate}>
                <div className="mb-6">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Casual summer BBQ by the pool, formal sit-down Christmas dinner, kids birthday party in the park..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 justify-between">
                  <button
                    type="button"
                    onClick={() => setView('choice')}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 text-sm"
                  >
                    ← Back
                  </button>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleSkip}
                      className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                    >
                      Skip
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark flex items-center gap-2"
                    >
                      Generate Plan →
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* ── Guided Build screen ────────────────────────────────────────── */}
          {view === 'guided' && eventContext && (
            <GuidedPlanBuilder
              eventContext={eventContext}
              onBack={() => setView('choice')}
              onSubmit={handleGuidedSubmit}
            />
          )}

          {/* Fallback: if guided selected but no event context, drop back to quick */}
          {view === 'guided' && !eventContext && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Event data unavailable — using Quick Generate.
              </p>
              <form onSubmit={handleQuickGenerate}>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your event..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent resize-none mb-4"
                />
                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setView('choice')}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark"
                  >
                    Generate Plan →
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
