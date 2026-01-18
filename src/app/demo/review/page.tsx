'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GenerationReviewPanel from '@/components/plan/GenerationReviewPanel';
import { ReviewItem } from '@/components/plan/ItemReviewCard';

interface TeamGroup {
  teamName: string;
  items: (ReviewItem & { isNew?: boolean })[];
}

/**
 * Demo page showing the selective item regeneration flow
 *
 * Usage:
 * 1. Navigate to /demo/review?eventId={eventId} after generating a plan
 * 2. Review the generated items
 * 3. Select items to keep or regenerate
 * 4. Click "Regenerate Selected" to get new items for selected slots
 * 5. Click "Confirm & Continue" to confirm all items and proceed
 */
export default function ReviewDemoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId');

  const [teamGroups, setTeamGroups] = useState<TeamGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) {
      setError('No event ID provided. Please add ?eventId={eventId} to the URL');
      setLoading(false);
      return;
    }

    loadReviewItems();
  }, [eventId]);

  const loadReviewItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/events/${eventId}/review-items`);
      if (!response.ok) throw new Error('Failed to load review items');

      const data = await response.json();
      setTeamGroups(data.teamGroups || []);
    } catch (err: any) {
      console.error('Error loading review items:', err);
      setError(err.message || 'Failed to load items for review');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateSelected = async (keepIds: string[], regenerateIds: string[]) => {
    try {
      const response = await fetch(`/api/events/${eventId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keepItemIds: keepIds,
          regenerateItemIds: regenerateIds,
        }),
      });

      if (!response.ok) throw new Error('Failed to regenerate items');

      const data = await response.json();
      console.log('Regeneration complete:', data);

      // Reload the review items to show ALL items (kept + newly regenerated)
      await loadReviewItems();

      alert(
        `Successfully regenerated ${data.regenerated} items!\n\nYou can now review ALL items again (both kept and newly generated).`
      );
    } catch (err: any) {
      console.error('Error regenerating items:', err);
      throw err;
    }
  };

  const handleConfirmAndContinue = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/review-items`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to confirm items');

      const data = await response.json();
      console.log('Confirmed items:', data);

      alert(`Confirmed ${data.confirmedCount} items!`);

      // Navigate to the plan page
      router.push(`/plan/${eventId}`);
    } catch (err: any) {
      console.error('Error confirming items:', err);
      alert('Failed to confirm items');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage-900 mx-auto mb-4"></div>
          <p className="text-sage-600">Loading items for review...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-900 font-bold mb-2">Error</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (teamGroups.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-sage-50 border border-sage-200 rounded-lg p-6 max-w-md text-center">
          <h2 className="text-sage-900 font-bold mb-2">No Items to Review</h2>
          <p className="text-sage-700 mb-4">
            There are no AI-generated items to review for this event.
          </p>
          <button
            onClick={() => router.push(`/plan/${eventId}`)}
            className="px-4 py-2 bg-sage-600 text-white rounded-md hover:bg-sage-700"
          >
            Go to Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sage-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-sage-900 mb-2">Review Generated Plan</h1>
          <p className="text-sage-600">
            Review the AI-generated items below. You can keep items you like or regenerate specific
            ones to get alternatives.
          </p>
        </div>

        <GenerationReviewPanel
          teamGroups={teamGroups}
          eventId={eventId || ''}
          onConfirmAndContinue={handleConfirmAndContinue}
          onRegenerateSelected={handleRegenerateSelected}
        />

        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="font-bold text-sage-900 mb-2">How it Works</h3>
          <ol className="list-decimal list-inside space-y-2 text-sage-700">
            <li>Review each item generated by AI</li>
            <li>Click "Keep" for items you want to use</li>
            <li>Click "Regenerate" for items you want to replace</li>
            <li>Use "Keep All" or "Regen All" for quick selection</li>
            <li>Click "Regenerate Selected" to get new items for regenerated slots</li>
            <li>
              <strong>After regeneration, ALL items will remain visible</strong> (both kept and
              newly generated) so you can review everything again
            </li>
            <li>Repeat steps 2-6 until you're happy with all items</li>
            <li>Click "Confirm & Continue" to finalize your choices and proceed to the plan</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
