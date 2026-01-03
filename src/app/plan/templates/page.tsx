'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TemplateList from '@/components/templates/TemplateList';
import CloneTemplateModal from '@/components/templates/CloneTemplateModal';

// Mock hostId - in production, this would come from auth
const MOCK_HOST_ID = 'cmjwbjrpw0000n99xs11r44qh';

export default function TemplatesPage() {
  const router = useRouter();
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const handleClone = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setCloneModalOpen(true);
  };

  const handleDelete = (templateId: string) => {
    // Template already deleted by TemplateList component
    // Could show a success toast here
  };

  const handleCloneComplete = (eventId: string) => {
    // Redirect to the new event
    router.push(`/plan/${eventId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
              <p className="mt-2 text-gray-600">
                Save and reuse event structures for faster planning
              </p>
            </div>
            <button
              onClick={() => router.push('/plan/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create New Event
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <TemplateList
            hostId={MOCK_HOST_ID}
            onClone={handleClone}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Clone Modal */}
      {selectedTemplateId && (
        <CloneTemplateModal
          isOpen={cloneModalOpen}
          onClose={() => {
            setCloneModalOpen(false);
            setSelectedTemplateId(null);
          }}
          onClone={handleCloneComplete}
          templateId={selectedTemplateId}
          hostId={MOCK_HOST_ID}
        />
      )}
    </div>
  );
}
