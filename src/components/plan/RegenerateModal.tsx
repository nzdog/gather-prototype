'use client';

import { useState, useEffect } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { useModal } from '@/contexts/ModalContext';
import RegenerationPreview from './RegenerationPreview';

interface RegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegenerate: (options: {
    preserveProtected: boolean;
    modifier: string;
    preGeneratedPlan?: any;
  }) => void;
  manualTeamCount: number;
  manualItemCount: number;
  eventId: string;
}

type Step = 'input' | 'preview' | 'loading';

export default function RegenerateModal({
  isOpen,
  onClose,
  onRegenerate,
  manualTeamCount,
  manualItemCount,
  eventId,
}: RegenerateModalProps) {
  const { openModal, closeModal } = useModal();
  const [modifier, setModifier] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [preview, setPreview] = useState<any>(null);
  const [preserveProtected, setPreserveProtected] = useState(true);
  const [cachedAIResponse, setCachedAIResponse] = useState<any>(null);

  // Modal blocking check
  useEffect(() => {
    if (isOpen) {
      if (!openModal('regenerate-modal')) {
        onClose();
      }
    } else {
      closeModal();
      // Reset state when modal closes
      setStep('input');
      setPreview(null);
      setModifier('');
      setCachedAIResponse(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasManualAdditions = manualTeamCount > 0 || manualItemCount > 0;

  const handlePreview = async (preserve: boolean) => {
    setPreserveProtected(preserve);
    setStep('loading');

    try {
      const response = await fetch(`/api/events/${eventId}/regenerate/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modifier: modifier.trim(),
          preserveProtected: preserve,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      const data = await response.json();
      setPreview(data.preview);
      setCachedAIResponse(data.aiResponse); // Cache the AI response for later use
      setStep('preview');
    } catch (error) {
      console.error('Error generating preview:', error);
      alert('Failed to generate preview. Please try again.');
      setStep('input');
    }
  };

  const handleApprove = () => {
    // Close preview and trigger actual regeneration with cached AI response
    onRegenerate({
      preserveProtected,
      modifier: modifier.trim(),
      preGeneratedPlan: cachedAIResponse, // Pass the cached AI response
    });
  };

  const handleCancel = () => {
    if (step === 'preview') {
      // Go back to input step
      setStep('input');
      setPreview(null);
    } else {
      // Close modal completely
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            {step === 'input' && 'Regenerate Plan with AI'}
            {step === 'loading' && 'Generating Preview...'}
            {step === 'preview' && 'Review Changes'}
          </h2>
          <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Loading State */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-accent animate-spin mb-4" />
              <p className="text-gray-600">Claude is generating your preview...</p>
            </div>
          )}

          {/* Preview State */}
          {step === 'preview' && preview && (
            <RegenerationPreview
              preview={preview}
              onApprove={handleApprove}
              onCancel={handleCancel}
            />
          )}

          {/* Input State */}
          {step === 'input' && (
            <div className="space-y-6">
          {/* Manual Additions Warning */}
          {hasManualAdditions && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-900 mb-2">You have manual additions:</h3>
                  <ul className="text-amber-800 space-y-1">
                    {manualTeamCount > 0 && (
                      <li>
                        • {manualTeamCount} team{manualTeamCount !== 1 ? 's' : ''} added manually
                      </li>
                    )}
                    {manualItemCount > 0 && (
                      <li>
                        • {manualItemCount} item{manualItemCount !== 1 ? 's' : ''} added manually
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* No Manual Additions */}
          {!hasManualAdditions && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <p className="text-blue-900">
                This will replace all generated teams and items with a fresh AI-generated plan.
              </p>
            </div>
          )}

          {/* Modifier Input */}
          <div>
            <label htmlFor="modifier" className="block text-sm font-medium text-gray-700 mb-2">
              What changes would you like? (optional)
            </label>
            <textarea
              id="modifier"
              value={modifier}
              onChange={(e) => setModifier(e.target.value)}
              placeholder="e.g., More vegetarian options, Focus on appetizers, Add dessert team..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-blue-500 resize-none"
              rows={3}
            />
            <p className="text-sm text-gray-500 mt-1">
              Tell Claude how to adjust the plan. Leave blank for a standard regeneration.
            </p>
          </div>

          {/* Footer / Actions */}
          <div className="space-y-3">
                {hasManualAdditions ? (
                  <>
                    {/* Option 1: Keep Manual Additions */}
                    <button
                      onClick={() => handlePreview(true)}
                      className="w-full px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark transition-colors"
                    >
                      Preview Changes - Keep My Additions (Recommended)
                    </button>
                    <p className="text-xs text-gray-600 text-center -mt-1">
                      Shows what will change while preserving your manual teams and items
                    </p>

                    {/* Option 2: Replace Everything */}
                    <button
                      onClick={() => handlePreview(false)}
                      className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
                    >
                      Preview Changes - Regenerate Everything
                    </button>
                    <p className="text-xs text-gray-600 text-center -mt-1">
                      ⚠️ Shows plan that replaces all teams and items, including manual additions
                    </p>
                  </>
                ) : (
                  <>
                    {/* Simple Regenerate */}
                    <button
                      onClick={() => handlePreview(false)}
                      className="w-full px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark transition-colors"
                    >
                      Preview Changes
                    </button>
                    <p className="text-xs text-gray-600 text-center -mt-1">
                      Shows what the regenerated plan will look like
                    </p>
                  </>
                )}

            {/* Cancel */}
            <button
              onClick={handleCancel}
              className="w-full px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
          )}
        </div>
      </div>
    </div>
  );
}
