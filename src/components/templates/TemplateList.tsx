'use client';

import { useState, useEffect } from 'react';
import { StructureTemplate } from '@prisma/client';

interface TemplateListProps {
  hostId: string;
  onClone: (templateId: string) => void;
  onUseAgain?: (templateId: string) => void;
  onDelete: (templateId: string) => void;
  reusingTemplateId?: string | null;
}

export default function TemplateList({
  hostId,
  onClone,
  onUseAgain,
  onDelete,
  reusingTemplateId,
}: TemplateListProps) {
  const [templates, setTemplates] = useState<StructureTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, [hostId]);

  const fetchTemplates = async () => {
    try {
      const hostResponse = await fetch(`/api/templates?hostId=${hostId}`);
      const hostData = await hostResponse.json();
      setTemplates(hostData.templates || []);
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

  if (loading) {
    return <div className="p-4 text-center text-gray-600">Loading...</div>;
  }

  if (templates.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        Your past events will appear here once your first event completes.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {templates.map((template) => {
        const teams = template.teams as any[];
        const totalItems = teams.reduce((sum, team) => sum + (team.items?.length || 0), 0);
        const createdDate = new Date(template.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
        const isReusing = reusingTemplateId === template.id;

        return (
          <div key={template.id} className="border rounded-lg p-4 hover:shadow-md transition">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg">{template.name}</h3>
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
              {onUseAgain ? (
                <button
                  onClick={() => onUseAgain(template.id)}
                  disabled={isReusing}
                  className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-dark transition disabled:opacity-50"
                >
                  {isReusing ? 'Creating...' : 'Use this again'}
                </button>
              ) : (
                <button
                  onClick={() => onClone(template.id)}
                  className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-dark transition"
                >
                  Use this again
                </button>
              )}
              <button
                onClick={() => handleDelete(template.id)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
