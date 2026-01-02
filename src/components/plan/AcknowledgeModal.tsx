'use client';

import { useState } from 'react';
import { Conflict, MitigationPlanType } from '@prisma/client';

interface AcknowledgeModalProps {
  isOpen: boolean;
  conflict: Conflict;
  onClose: () => void;
  onSubmit: (acknowledgement: {
    impactStatement: string;
    impactUnderstood: boolean;
    mitigationPlanType: MitigationPlanType;
  }) => void;
}

export default function AcknowledgeModal({
  isOpen,
  conflict,
  onClose,
  onSubmit,
}: AcknowledgeModalProps) {
  const [impactStatement, setImpactStatement] = useState('');
  const [impactUnderstood, setImpactUnderstood] = useState(false);
  const [mitigationPlanType, setMitigationPlanType] = useState<MitigationPlanType>('COMMUNICATE');
  const [errors, setErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  const validateAndSubmit = () => {
    const newErrors: string[] = [];

    // Validate impact statement length
    if (impactStatement.trim().length < 10) {
      newErrors.push('Impact statement must be at least 10 characters');
    }

    // Validate impact statement references affected party or action
    const hasReference =
      /guest|vegetarian|vegan|gluten|dairy|participant|coordinator|person|people/i.test(impactStatement) ||
      /communicate|notify|inform|substitute|replace|reassign|provide|bring|cater|accept|gap|external/i.test(impactStatement);

    if (!hasReference) {
      newErrors.push('Impact statement must reference affected parties or mitigation action');
    }

    // Validate impact understood
    if (!impactUnderstood) {
      newErrors.push('You must confirm that you understand the impact');
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    // Submit
    onSubmit({
      impactStatement: impactStatement.trim(),
      impactUnderstood,
      mitigationPlanType,
    });

    // Reset form
    setImpactStatement('');
    setImpactUnderstood(false);
    setMitigationPlanType('COMMUNICATE');
    setErrors([]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Acknowledge Critical Conflict
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {conflict.title}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Conflict Description */}
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-6">
            <p className="text-red-900 font-medium mb-2">Impact:</p>
            <p className="text-red-800">{conflict.description}</p>
            {conflict.affectedParties && Array.isArray(conflict.affectedParties) && (
              <p className="text-red-800 mt-2">
                <span className="font-medium">Affected: </span>
                {(conflict.affectedParties as string[]).join(', ')}
              </p>
            )}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded p-3 mb-4">
              <ul className="list-disc list-inside text-sm text-red-800">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {/* Impact Statement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How will you handle this?
              </label>
              <textarea
                value={impactStatement}
                onChange={(e) => setImpactStatement(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder='Example: "Vegetarians will eat from sides and salads — confirmed with Sarah and Tom"'
              />
              <p className="text-xs text-gray-500 mt-1">
                {impactStatement.trim().length}/10 characters minimum
              </p>
            </div>

            {/* Mitigation Plan Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mitigation type:
              </label>
              <select
                value={mitigationPlanType}
                onChange={(e) => setMitigationPlanType(e.target.value as MitigationPlanType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="COMMUNICATE">Communicate to guests</option>
                <option value="SUBSTITUTE">Provide substitute</option>
                <option value="REASSIGN">Reassign responsibility</option>
                <option value="ACCEPT_GAP">Accept gap</option>
                <option value="EXTERNAL_CATERING">External catering</option>
                <option value="BRING_OWN">Guests bring own</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Impact Understood Checkbox */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="impactUnderstood"
                checked={impactUnderstood}
                onChange={(e) => setImpactUnderstood(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="impactUnderstood" className="text-sm text-gray-700">
                I understand this means affected guests may have an incomplete meal
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6 pt-6 border-t">
            <button
              onClick={validateAndSubmit}
              className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition font-medium"
            >
              Acknowledge and continue
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
