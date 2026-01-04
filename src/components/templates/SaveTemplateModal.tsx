'use client';

import { useState } from 'react';

interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateName: string) => Promise<void>;
  eventName: string;
  teamCount: number;
  itemCount: number;
  occasionType: string;
}

export default function SaveTemplateModal({
  isOpen,
  onClose,
  onSave,
  eventName,
  teamCount,
  itemCount,
  occasionType,
}: SaveTemplateModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    setSaving(true);
    try {
      await onSave(templateName);
      setTemplateName('');
      onClose();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Save as Template</h2>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-4">
            Save the structure of "{eventName}" as a reusable template.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-sm">
            <p className="font-medium mb-2">What's included:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>Team names and scopes ({teamCount} teams)</li>
              <li>Item names and suggested critical flags ({itemCount} items)</li>
              <li>Dietary tags and equipment needs</li>
              <li>Day names (e.g., "Christmas Eve")</li>
            </ul>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded p-3 mb-4 text-sm">
            <p className="font-medium mb-2">What's NOT included:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>Specific dates (you'll set these when cloning)</li>
              <li>Assignments to people</li>
              <li>Actual quantities (saved separately if available)</li>
              <li>Acknowledgements</li>
            </ul>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Template Name</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`e.g., "${occasionType} Template"`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !templateName.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
