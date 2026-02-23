'use client';

import { useState, useEffect } from 'react';
import { useModal } from '@/contexts/ModalContext';

interface HostDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (hostDescription: string) => Promise<void>;
  onSkip: () => void;
}

export default function HostDescriptionModal({
  isOpen,
  onClose,
  onGenerate,
  onSkip,
}: HostDescriptionModalProps) {
  const { openModal, closeModal } = useModal();
  const [description, setDescription] = useState('');

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
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
    onGenerate(description.trim());
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-2">Tell us about your event</h2>
          <p className="text-gray-600 text-sm mb-4">This helps generate a better plan (optional)</p>

          <form onSubmit={handleGenerate}>
            <div className="mb-6">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Casual summer BBQ by the pool, formal sit-down Christmas dinner, kids birthday party in the park..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
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
          </form>
        </div>
      </div>
    </div>
  );
}
