'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TemplateList from '@/components/templates/TemplateList';
import CloneTemplateModal from '@/components/templates/CloneTemplateModal';

export default function TemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string>('');

  // Get hostId from query params or localStorage
  useEffect(() => {
    const hostIdFromQuery = searchParams?.get('hostId');
    const hostIdFromStorage = localStorage.getItem('gather_hostId');

    if (hostIdFromQuery) {
      setHostId(hostIdFromQuery);
      localStorage.setItem('gather_hostId', hostIdFromQuery);
    } else if (hostIdFromStorage) {
      setHostId(hostIdFromStorage);
    } else {
      // Default fallback
      setHostId('cmjwbjrpw0000n99xs11r44qh');
    }
  }, [searchParams]);

  const handleClone = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setCloneModalOpen(true);
  };

  const handleDelete = (_templateId: string) => {
    // Template already deleted by TemplateList component
    // Could show a success toast here
  };

  const handleCloneComplete = (eventId: string) => {
    // Redirect to the new event
    router.push(`/plan/${eventId}`);
  };

  if (!hostId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading templates...</p>
        </div>
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
          <TemplateList hostId={hostId} onClone={handleClone} onDelete={handleDelete} />
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
          hostId={hostId}
        />
      )}
    </div>
  );
}
