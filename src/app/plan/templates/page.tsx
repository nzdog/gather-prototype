'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TemplateList from '@/components/templates/TemplateList';
import { ModalProvider } from '@/contexts/ModalContext';
import { useToast } from '@/contexts/ToastContext';

export default function TemplatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [hostId, setHostId] = useState<string>('');
  const [reusingTemplateId, setReusingTemplateId] = useState<string | null>(null);

  // Get hostId from query params or localStorage
  useEffect(() => {
    const hostIdFromQuery = searchParams?.get('hostId');
    const hostIdFromStorage = localStorage.getItem('gather_hostId');

    if (hostIdFromQuery) {
      setHostId(hostIdFromQuery);
      localStorage.setItem('gather_hostId', hostIdFromQuery);
    } else if (hostIdFromStorage) {
      setHostId(hostIdFromStorage);
    }
  }, [searchParams]);

  // "Use this again" — skip modal, clone directly with placeholder dates
  const handleUseAgain = async (templateId: string) => {
    setReusingTemplateId(templateId);
    try {
      const templateRes = await fetch(`/api/templates/${templateId}?hostId=${hostId}`);
      const templateData = await templateRes.json();
      const templateName = templateData.template?.name || 'My Event';

      const start = new Date();
      start.setDate(start.getDate() + 30);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const response = await fetch(`/api/templates/${templateId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId,
          eventName: templateName,
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          occasionType: templateData.template?.occasionType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/plan/${data.eventId}?fromReuse=true`);
      } else {
        const error = await response.json();
        toast.error(`Error creating event: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error reusing template:', error);
      toast.error('Error creating event. Please try again.');
    } finally {
      setReusingTemplateId(null);
    }
  };

  const handleDelete = (_templateId: string) => {
    // Template already deleted by TemplateList component
  };

  if (!hostId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ModalProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Start with one of your past events
                </h1>
                <p className="mt-2 text-gray-600">
                  Pick up where you left off — your teams, items, and structure are ready to go
                </p>
              </div>
              <button
                onClick={() => router.push('/plan/new')}
                className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark"
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
              hostId={hostId}
              onClone={handleUseAgain}
              onUseAgain={handleUseAgain}
              onDelete={handleDelete}
              reusingTemplateId={reusingTemplateId}
            />
          </div>
        </div>
      </div>
    </ModalProvider>
  );
}
