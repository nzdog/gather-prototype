'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Trash2, Info } from 'lucide-react';

// Mock hostId - in production, this would come from auth
const MOCK_HOST_ID = 'cmjwbjrpw0000n99xs11r44qh';

interface HostMemory {
  id: string;
  learningEnabled: boolean;
  aggregateContributionConsent: boolean;
  useHistoryByDefault: boolean;
}

interface MemoryStats {
  completedEvents: number;
  templatesSaved: number;
  patternsLearned: number;
  defaultsSet: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const [hostMemory, setHostMemory] = useState<HostMemory | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadHostMemory();
  }, []);

  const loadHostMemory = async () => {
    try {
      const response = await fetch(`/api/memory?hostId=${MOCK_HOST_ID}`);
      if (!response.ok) throw new Error('Failed to load host memory');

      const data = await response.json();
      setHostMemory(data.hostMemory);
      setStats(data.stats);
    } catch (error) {
      console.error('Error loading host memory:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (
    field: 'learningEnabled' | 'aggregateContributionConsent' | 'useHistoryByDefault'
  ) => {
    if (!hostMemory) return;

    const newValue = !hostMemory[field];

    // Show warning for aggregate contribution
    if (field === 'aggregateContributionConsent' && newValue) {
      const confirmed = confirm(
        'By enabling this, you consent to Gather using anonymized patterns from your events to improve suggestions for all users. You can revoke this consent at any time.'
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/memory/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: MOCK_HOST_ID,
          [field]: newValue,
        }),
      });

      if (!response.ok) throw new Error('Failed to update settings');

      const data = await response.json();
      setHostMemory(data.hostMemory);
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteData = async () => {
    const confirmed = confirm(
      'This will permanently delete all your templates, patterns, and learned preferences. This action cannot be undone. Continue?'
    );

    if (!confirmed) return;

    const doubleConfirm = confirm(
      'Are you absolutely sure? All your saved templates and learned patterns will be deleted.'
    );

    if (!doubleConfirm) return;

    try {
      const response = await fetch(`/api/memory?hostId=${MOCK_HOST_ID}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete memory');

      await response.json();
      alert('Your data has been deleted. A deletion receipt has been created for transparency.');

      // Reload
      await loadHostMemory();
    } catch (error) {
      console.error('Error deleting memory:', error);
      alert('Failed to delete data');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
              <p className="mt-2 text-gray-600">Manage your host memory and privacy preferences</p>
            </div>
            <button
              onClick={() => router.push('/plan/templates')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Back to Templates
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Memory Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Gather Memory</h2>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-accent">{stats.completedEvents}</div>
                <div className="text-sm text-gray-600 mt-1">Completed Events</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-purple-600">{stats.templatesSaved}</div>
                <div className="text-sm text-gray-600 mt-1">Templates Saved</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">{stats.patternsLearned}</div>
                <div className="text-sm text-gray-600 mt-1">Patterns Learned</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-3xl font-bold text-orange-600">{stats.defaultsSet}</div>
                <div className="text-sm text-gray-600 mt-1">Defaults Set</div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">How Host Memory Works</p>
                <p>
                  Gather learns from your completed events to provide better suggestions for future
                  events. All learning is private to you unless you explicitly opt in to contribute
                  anonymized patterns.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Privacy Settings */}
        {hostMemory && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Privacy & Learning Settings
            </h2>

            <div className="space-y-6">
              {/* Learning Enabled */}
              <div className="flex items-start justify-between pb-6 border-b">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 mb-1">Learn from my events</h3>
                  <p className="text-sm text-gray-600">
                    When enabled, Gather learns patterns from your completed events to improve
                    suggestions for future events. This data stays private to you.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    <strong>Purpose:</strong> Improving your personal event planning experience
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={hostMemory.learningEnabled}
                    onChange={() => handleToggle('learningEnabled')}
                    disabled={saving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>

              {/* Aggregate Contribution */}
              <div className="flex items-start justify-between pb-6 border-b">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 mb-1">Contribute to Gather patterns</h3>
                  <p className="text-sm text-gray-600">
                    Share anonymized patterns from your events to help improve Gather for all users.
                    No personal information is shared.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    <strong>Purpose:</strong> Improving Gather for the community
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <span className="text-xs text-orange-600 font-medium">
                      Requires explicit opt-in
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={hostMemory.aggregateContributionConsent}
                    onChange={() => handleToggle('aggregateContributionConsent')}
                    disabled={saving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>

              {/* Use History by Default */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 mb-1">Use my history by default</h3>
                  <p className="text-sm text-gray-600">
                    Automatically apply learned preferences and defaults when creating new events.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={hostMemory.useHistoryByDefault}
                    onChange={() => handleToggle('useHistoryByDefault')}
                    disabled={saving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Data Deletion */}
        <div className="bg-white rounded-lg shadow-md p-6 border-2 border-red-200">
          <div className="flex items-start gap-3 mb-4">
            <Trash2 className="w-6 h-6 text-red-600 mt-0.5" />
            <div>
              <h2 className="text-xl font-semibold text-red-900 mb-1">Delete My Data</h2>
              <p className="text-sm text-gray-600">
                Permanently delete all your templates, patterns, and learned preferences. This
                action cannot be undone.
              </p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-900 font-medium mb-2">This will delete:</p>
            <ul className="text-sm text-red-800 list-disc list-inside space-y-1">
              <li>All your saved templates</li>
              <li>All learned patterns and preferences</li>
              <li>All quantity profiles</li>
              <li>All default settings</li>
            </ul>
            <p className="text-xs text-red-700 mt-3">
              A deletion receipt will be created for transparency.
            </p>
          </div>

          <button
            onClick={handleDeleteData}
            className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete All My Data
          </button>
        </div>
      </div>
    </div>
  );
}
