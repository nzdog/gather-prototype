'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useModal } from '@/contexts/ModalContext';

interface Event {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  occasionType: string | null;
  occasionDescription: string | null;
  guestCount: number | null;
  guestCountConfidence: string;
  guestCountMin: number | null;
  guestCountMax: number | null;
  dietaryStatus: string;
  dietaryVegetarian: number;
  dietaryVegan: number;
  dietaryGlutenFree: number;
  dietaryDairyFree: number;
  dietaryAllergies: string | null;
  venueName: string | null;
  venueType: string | null;
  venueKitchenAccess: string | null;
  venueOvenCount: number;
  venueStoretopBurners: number | null;
  venueBbqAvailable: boolean | null;
  venueTimingStart: string | null;
  venueTimingEnd: string | null;
  venueNotes: string | null;
}

interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  event: Event | null;
  eventId: string;
  stepLabel?: string;
}

export default function EditEventModal({
  isOpen,
  onClose,
  onSave,
  event,
  eventId,
  stepLabel,
}: EditEventModalProps) {
  const { openModal, closeModal } = useModal();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1); // 1=basics, 2=guests/dietary, 3=venue

  // Modal blocking check
  useEffect(() => {
    if (isOpen) {
      if (!openModal('edit-event-modal')) {
        onClose();
      }
    } else {
      closeModal();
    }
  }, [isOpen]);

  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    occasionType: '',
    occasionDescription: '',
    guestCount: '',
    guestCountConfidence: 'MEDIUM',
    guestCountMin: '',
    guestCountMax: '',
    dietaryStatus: 'UNSPECIFIED',
    dietaryVegetarian: '',
    dietaryVegan: '',
    dietaryGlutenFree: '',
    dietaryDairyFree: '',
    dietaryAllergies: '',
    venueName: '',
    venueType: '',
    venueKitchenAccess: '',
    venueOvenCount: '',
    venueStoretopBurners: '',
    venueBbqAvailable: '',
    venueTimingStart: '',
    venueTimingEnd: '',
    venueNotes: '',
  });

  useEffect(() => {
    if (event) {
      setFormData({
        name: event.name || '',
        startDate: event.startDate ? event.startDate.split('T')[0] : '',
        endDate: event.endDate ? event.endDate.split('T')[0] : '',
        occasionType: event.occasionType || '',
        occasionDescription: event.occasionDescription || '',
        guestCount: event.guestCount?.toString() || '',
        guestCountConfidence: event.guestCountConfidence || 'MEDIUM',
        guestCountMin: event.guestCountMin?.toString() || '',
        guestCountMax: event.guestCountMax?.toString() || '',
        dietaryStatus: event.dietaryStatus || 'UNSPECIFIED',
        dietaryVegetarian: event.dietaryVegetarian?.toString() || '',
        dietaryVegan: event.dietaryVegan?.toString() || '',
        dietaryGlutenFree: event.dietaryGlutenFree?.toString() || '',
        dietaryDairyFree: event.dietaryDairyFree?.toString() || '',
        dietaryAllergies: event.dietaryAllergies || '',
        venueName: event.venueName || '',
        venueType: event.venueType || '',
        venueKitchenAccess: event.venueKitchenAccess || '',
        venueOvenCount: event.venueOvenCount?.toString() || '',
        venueStoretopBurners: event.venueStoretopBurners?.toString() || '',
        venueBbqAvailable:
          event.venueBbqAvailable === true
            ? 'true'
            : event.venueBbqAvailable === false
              ? 'false'
              : '',
        venueTimingStart: event.venueTimingStart || '',
        venueTimingEnd: event.venueTimingEnd || '',
        venueNotes: event.venueNotes || '',
      });
    }
  }, [event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Convert to proper types
      const payload = {
        ...formData,
        guestCount: formData.guestCount ? parseInt(formData.guestCount) : null,
        guestCountMin: formData.guestCountMin ? parseInt(formData.guestCountMin) : null,
        guestCountMax: formData.guestCountMax ? parseInt(formData.guestCountMax) : null,
        dietaryVegetarian: formData.dietaryVegetarian ? parseInt(formData.dietaryVegetarian) : 0,
        dietaryVegan: formData.dietaryVegan ? parseInt(formData.dietaryVegan) : 0,
        dietaryGlutenFree: formData.dietaryGlutenFree ? parseInt(formData.dietaryGlutenFree) : 0,
        dietaryDairyFree: formData.dietaryDairyFree ? parseInt(formData.dietaryDairyFree) : 0,
        venueOvenCount: formData.venueOvenCount ? parseInt(formData.venueOvenCount) : 0,
        venueStoretopBurners: formData.venueStoretopBurners
          ? parseInt(formData.venueStoretopBurners)
          : null,
        venueBbqAvailable:
          formData.venueBbqAvailable === 'true'
            ? true
            : formData.venueBbqAvailable === 'false'
              ? false
              : null,
        occasionType: formData.occasionType || null,
        venueType: formData.venueType || null,
        venueKitchenAccess: formData.venueKitchenAccess || null,
      };

      const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update event');
      }

      // If opened from checklist and on steps 1 or 2, advance to next step
      // Otherwise save and close the modal
      if (stepLabel && step < 3) {
        setStep(step + 1);
      } else {
        onSave();
        onClose();
      }
    } catch (error: any) {
      console.error('Error updating event:', error);
      alert(error.message || 'Failed to update event');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !event) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <div>
            {stepLabel && <p className="text-xs text-gray-400 mb-1">{stepLabel}</p>}
            <h2 className="text-lg font-semibold text-gray-900">Edit Event Details</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Step Navigation */}
          <div className="flex gap-2 mb-6">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStep(s)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${
                  step === s
                    ? 'bg-accent text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Step {s}
              </button>
            ))}
          </div>

          {/* Step 1: Basics */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Event Basics</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Occasion Type
                </label>
                <select
                  value={formData.occasionType}
                  onChange={(e) => setFormData({ ...formData, occasionType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select type...</option>
                  <option value="CHRISTMAS">Christmas</option>
                  <option value="THANKSGIVING">Thanksgiving</option>
                  <option value="EASTER">Easter</option>
                  <option value="WEDDING">Wedding</option>
                  <option value="BIRTHDAY">Birthday</option>
                  <option value="REUNION">Reunion</option>
                  <option value="RETREAT">Retreat</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.occasionDescription}
                  onChange={(e) =>
                    setFormData({ ...formData, occasionDescription: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          )}

          {/* Step 2: Guests & Dietary */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Guests & Dietary</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Count</label>
                <input
                  type="number"
                  value={formData.guestCount}
                  onChange={(e) => setFormData({ ...formData, guestCount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Guest Count Confidence
                </label>
                <select
                  value={formData.guestCountConfidence}
                  onChange={(e) =>
                    setFormData({ ...formData, guestCountConfidence: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="HIGH">High - Confirmed RSVPs</option>
                  <option value="MEDIUM">Medium - Expected</option>
                  <option value="LOW">Low - Estimate</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min</label>
                  <input
                    type="number"
                    value={formData.guestCountMin}
                    onChange={(e) => setFormData({ ...formData, guestCountMin: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max</label>
                  <input
                    type="number"
                    value={formData.guestCountMax}
                    onChange={(e) => setFormData({ ...formData, guestCountMax: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dietary Requirements
                </label>
                <select
                  value={formData.dietaryStatus}
                  onChange={(e) => setFormData({ ...formData, dietaryStatus: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="UNSPECIFIED">Not specified yet</option>
                  <option value="NONE">None</option>
                  <option value="SPECIFIED">Specified below</option>
                </select>
              </div>

              {formData.dietaryStatus === 'SPECIFIED' && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vegetarian
                    </label>
                    <input
                      type="number"
                      value={formData.dietaryVegetarian}
                      onChange={(e) =>
                        setFormData({ ...formData, dietaryVegetarian: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vegan</label>
                    <input
                      type="number"
                      value={formData.dietaryVegan}
                      onChange={(e) => setFormData({ ...formData, dietaryVegan: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Gluten Free
                    </label>
                    <input
                      type="number"
                      value={formData.dietaryGlutenFree}
                      onChange={(e) =>
                        setFormData({ ...formData, dietaryGlutenFree: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dairy Free
                    </label>
                    <input
                      type="number"
                      value={formData.dietaryDairyFree}
                      onChange={(e) =>
                        setFormData({ ...formData, dietaryDairyFree: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      min="0"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Allergies
                    </label>
                    <input
                      type="text"
                      value={formData.dietaryAllergies}
                      onChange={(e) =>
                        setFormData({ ...formData, dietaryAllergies: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="e.g., nuts, shellfish"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Venue */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Venue Details</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name</label>
                <input
                  type="text"
                  value={formData.venueName}
                  onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Type</label>
                <select
                  value={formData.venueType}
                  onChange={(e) => setFormData({ ...formData, venueType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select type...</option>
                  <option value="HOME">Home</option>
                  <option value="HIRED_VENUE">Hired Venue</option>
                  <option value="OUTDOOR">Outdoor</option>
                  <option value="MIXED">Mixed</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kitchen Access
                </label>
                <select
                  value={formData.venueKitchenAccess}
                  onChange={(e) => setFormData({ ...formData, venueKitchenAccess: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select...</option>
                  <option value="FULL">Full Kitchen</option>
                  <option value="LIMITED">Limited</option>
                  <option value="NONE">None</option>
                  <option value="CATERING_ONLY">Catering Only</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Oven Count</label>
                  <input
                    type="number"
                    value={formData.venueOvenCount}
                    onChange={(e) => setFormData({ ...formData, venueOvenCount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stovetop Burners
                  </label>
                  <input
                    type="number"
                    value={formData.venueStoretopBurners}
                    onChange={(e) =>
                      setFormData({ ...formData, venueStoretopBurners: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  BBQ Available
                </label>
                <select
                  value={formData.venueBbqAvailable}
                  onChange={(e) => setFormData({ ...formData, venueBbqAvailable: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Unknown</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Start Time
                  </label>
                  <input
                    type="text"
                    value={formData.venueTimingStart}
                    onChange={(e) => setFormData({ ...formData, venueTimingStart: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="e.g., 5:30pm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event End Time
                  </label>
                  <input
                    type="text"
                    value={formData.venueTimingEnd}
                    onChange={(e) => setFormData({ ...formData, venueTimingEnd: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="e.g., 11:00pm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Venue Notes</label>
                <textarea
                  value={formData.venueNotes}
                  onChange={(e) => setFormData({ ...formData, venueNotes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-6 border-t mt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : stepLabel && step < 3 ? 'Next' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
