'use client';

import { useState } from 'react';

interface AddTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (teamData: TeamFormData) => Promise<void>;
}

export interface TeamFormData {
  name: string;
  scope: string;
  domain?: string;
}

const DOMAINS = [
  { value: '', label: 'None (will be auto-detected)' },
  { value: 'PROTEINS', label: 'Proteins' },
  { value: 'VEGETARIAN_MAINS', label: 'Vegetarian Mains' },
  { value: 'SIDES', label: 'Sides' },
  { value: 'SALADS', label: 'Salads' },
  { value: 'STARTERS', label: 'Starters' },
  { value: 'DESSERTS', label: 'Desserts' },
  { value: 'DRINKS', label: 'Drinks' },
  { value: 'LATER_FOOD', label: 'Later Food' },
  { value: 'SETUP', label: 'Setup' },
  { value: 'CLEANUP', label: 'Cleanup' },
  { value: 'CUSTOM', label: 'Custom' },
];

export default function AddTeamModal({ isOpen, onClose, onAdd }: AddTeamModalProps) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [domain, setDomain] = useState('');
  const [adding, setAdding] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !scope.trim()) {
      alert('Please enter team name and scope');
      return;
    }

    setAdding(true);
    try {
      await onAdd({
        name: name.trim(),
        scope: scope.trim(),
        domain: domain || undefined,
      });

      // Reset form
      setName('');
      setScope('');
      setDomain('');
      onClose();
    } catch (error) {
      console.error('Error adding team:', error);
      alert('Failed to add team. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    if (!adding) {
      setName('');
      setScope('');
      setDomain('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Add New Team</h2>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 mb-6">
            {/* Team Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Desserts Team"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                disabled={adding}
              />
            </div>

            {/* Scope */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Scope (Description) *
              </label>
              <textarea
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="e.g., Responsible for all desserts including cakes, puddings, and ice cream"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={adding}
              />
            </div>

            {/* Domain */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Domain (Optional)
              </label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={adding}
              >
                {DOMAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                If not specified, AI will attempt to detect the domain
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={adding}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding || !name.trim() || !scope.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
