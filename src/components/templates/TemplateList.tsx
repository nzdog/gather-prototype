'use client';

import { useState, useEffect } from 'react';
import { StructureTemplate } from '@prisma/client';

interface TemplateListProps {
  hostId: string;
  onClone: (templateId: string) => void;
  onDelete: (templateId: string) => void;
}

export default function TemplateList({ hostId, onClone, onDelete }: TemplateListProps) {
  const [templates, setTemplates] = useState<StructureTemplate[]>([]);
  const [gatherTemplates, setGatherTemplates] = useState<StructureTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my' | 'gather'>('my');

  useEffect(() => {
    fetchTemplates();
  }, [hostId]);

  const fetchTemplates = async () => {
    try {
      // Fetch host templates
      const hostResponse = await fetch(`/api/templates?hostId=${hostId}`);
      const hostData = await hostResponse.json();
      setTemplates(hostData.templates || []);

      // Fetch Gather curated templates
      const gatherResponse = await fetch('/api/templates/gather');
      const gatherData = await gatherResponse.json();
      setGatherTemplates(gatherData.templates || []);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setLoading(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId }),
      });

      if (response.ok) {
        setTemplates(templates.filter((t) => t.id !== templateId));
        onDelete(templateId);
      } else {
        console.error('Error deleting template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const displayTemplates = activeTab === 'my' ? templates : gatherTemplates;

  if (loading) {
    return <div className="p-4 text-center text-gray-600">Loading templates...</div>;
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setActiveTab('my')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'my'
              ? 'border-b-2 border-blue-600 text-accent'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          My Templates ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('gather')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'gather'
              ? 'border-b-2 border-blue-600 text-accent'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Gather Templates ({gatherTemplates.length})
        </button>
      </div>

      {/* Template List */}
      {displayTemplates.length === 0 ? (
        <div className="text-center p-8 text-gray-500">
          {activeTab === 'my'
            ? 'No templates saved yet. Create a template from a completed event.'
            : 'No Gather templates available yet.'}
        </div>
      ) : (
        <div className="grid gap-4">
          {displayTemplates.map((template) => {
            const teams = template.teams as any[];
            const totalItems = teams.reduce((sum, team) => sum + (team.items?.length || 0), 0);
            const createdDate = new Date(template.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            return (
              <div key={template.id} className="border rounded-lg p-4 hover:shadow-md transition">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{template.name}</h3>
                      {activeTab === 'gather' && template.version && (
                        <span className="px-2 py-1 text-xs bg-sage-100 text-sage-800 rounded">
                          v{template.version}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-2">
                      <span className="flex items-center gap-1">
                        <span className="font-medium">Occasion:</span> {template.occasionType}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium">Teams:</span> {teams.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium">Items:</span> {totalItems}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium">Created:</span> {createdDate}
                      </span>
                    </div>

                    {template.createdFrom && (
                      <p className="text-xs text-gray-500">Saved from a completed event</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onClone(template.id)}
                    className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-dark transition"
                  >
                    Use Template
                  </button>
                  {activeTab === 'my' && (
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
