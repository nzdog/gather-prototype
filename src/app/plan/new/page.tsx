'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Users, MapPin, ChefHat } from 'lucide-react';

export default function NewPlanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // Multi-step form: 1=basics, 2=guests, 3=venue
  const [canCreate, setCanCreate] = useState<boolean | null>(null); // null = checking, true = can create, false = blocked
  const [checkingEntitlement, setCheckingEntitlement] = useState(true);

  // Check entitlement on page load
  useEffect(() => {
    async function checkEntitlement() {
      try {
        const response = await fetch('/api/entitlements/check-create');
        if (response.ok) {
          const data = await response.json();
          setCanCreate(data.canCreate);
        } else {
          // If the endpoint doesn't exist or fails, assume user can create
          setCanCreate(true);
        }
      } catch (err) {
        // On error, assume user can create to avoid blocking them
        console.error('Error checking entitlement:', err);
        setCanCreate(true);
      } finally {
        setCheckingEntitlement(false);
      }
    }
    checkEntitlement();
  }, []);

  const [formData, setFormData] = useState({
    // Core
    name: '',
    startDate: '',
    endDate: '',

    // Occasion
    occasionType: '',
    occasionDescription: '',

    // Guest parameters
    guestCount: '',
    guestCountConfidence: 'MEDIUM',
    guestCountMin: '',
    guestCountMax: '',

    // Dietary
    dietaryStatus: 'UNSPECIFIED',
    dietaryVegetarian: '',
    dietaryVegan: '',
    dietaryGlutenFree: '',
    dietaryDairyFree: '',
    dietaryAllergies: '',

    // Venue
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Debug: Log form data before submit
      console.log('Form data before submit:', formData);

      // Client-side validation for required fields
      const missingFields: string[] = [];
      if (!formData.name) missingFields.push('name');
      if (!formData.startDate) missingFields.push('startDate');
      if (!formData.endDate) missingFields.push('endDate');

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

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
        // Convert empty strings to null for optional enums
        occasionType: formData.occasionType || null,
        venueType: formData.venueType || null,
        venueKitchenAccess: formData.venueKitchenAccess || null,
      };

      console.log('Payload being sent:', payload);

      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create event');
      }

      const result = await response.json();
      router.push(`/plan/${result.event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Show loading state while checking entitlement
  if (checkingEntitlement) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-gray-600">Checking your plan...</p>
        </div>
      </div>
    );
  }

  // Show blocked message if user cannot create
  if (canCreate === false) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.push('/')}
              className="text-accent hover:text-accent-dark mb-4 flex items-center gap-2"
            >
              ← Back to Home
            </button>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Create New Plan</h1>
          </div>

          {/* Blocked Message */}
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Event Limit Reached</h2>
              <p className="text-gray-600 text-lg">
                You've used your free event this year. Upgrade for unlimited gatherings.
              </p>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => router.push('/billing/upgrade')}
                className="w-full px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark"
              >
                Upgrade to Unlimited
              </button>
              <button
                onClick={() => router.push('/')}
                className="w-full px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
              >
                View My Events
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Upgrade Benefits</h3>
              <ul className="text-left text-gray-600 space-y-2 max-w-md mx-auto">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Unlimited events per year</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Priority support</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>Advanced planning features</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-accent hover:text-accent-dark mb-4 flex items-center gap-2"
          >
            ← Back to Home
          </button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Create New Plan</h1>
          <p className="text-gray-600">
            Tell us about your event. The more details you provide, the better we can help you plan.
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-16 rounded-full ${
                s === step ? 'bg-accent' : s < step ? 'bg-sage-300' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-8 space-y-6">
          {/* STEP 1: Basics */}
          {step === 1 && (
            <>
              <h2 className="text-2xl font-bold mb-4">Event Basics</h2>

              {/* Event Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Event Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Richardson Family Christmas 2025"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* Occasion Type */}
              <div>
                <label
                  htmlFor="occasionType"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Occasion Type
                </label>
                <select
                  id="occasionType"
                  name="occasionType"
                  value={formData.occasionType}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="">Select type</option>
                  <option value="CHRISTMAS">Christmas</option>
                  <option value="THANKSGIVING">Thanksgiving</option>
                  <option value="EASTER">Easter</option>
                  <option value="WEDDING">Wedding</option>
                  <option value="BIRTHDAY">Birthday</option>
                  <option value="REUNION">Family Reunion</option>
                  <option value="RETREAT">Retreat</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Occasion Description */}
              <div>
                <label
                  htmlFor="occasionDescription"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Description (optional)
                </label>
                <textarea
                  id="occasionDescription"
                  name="occasionDescription"
                  value={formData.occasionDescription}
                  onChange={handleChange}
                  rows={3}
                  placeholder="e.g., Three-day family gathering at the beach house"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    <Calendar className="inline w-4 h-4 mr-1" />
                    Start Date *
                  </label>
                  <input
                    type="date"
                    id="startDate"
                    name="startDate"
                    required
                    value={formData.startDate}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                    <Calendar className="inline w-4 h-4 mr-1" />
                    End Date *
                  </label>
                  <input
                    type="date"
                    id="endDate"
                    name="endDate"
                    required
                    value={formData.endDate}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  // Validate required fields before proceeding
                  if (!formData.name) {
                    setError('Event name is required');
                    return;
                  }
                  if (!formData.startDate) {
                    setError('Start date is required');
                    return;
                  }
                  if (!formData.endDate) {
                    setError('End date is required');
                    return;
                  }
                  setError('');
                  console.log('Step 1 complete, formData:', formData);
                  setStep(2);
                }}
                className="w-full px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark"
              >
                Next: Guest Details →
              </button>
            </>
          )}

          {/* STEP 2: Guests & Dietary */}
          {step === 2 && (
            <>
              <h2 className="text-2xl font-bold mb-4">
                <Users className="inline w-6 h-6 mr-2" />
                Guests & Dietary
              </h2>

              {/* Guest Count */}
              <div>
                <label
                  htmlFor="guestCount"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Expected Guest Count
                </label>
                <input
                  type="number"
                  id="guestCount"
                  name="guestCount"
                  min="1"
                  value={formData.guestCount}
                  onChange={handleChange}
                  placeholder="e.g., 40"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* Confidence */}
              <div>
                <label
                  htmlFor="guestCountConfidence"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  How confident are you in this number?
                </label>
                <select
                  id="guestCountConfidence"
                  name="guestCountConfidence"
                  value={formData.guestCountConfidence}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="HIGH">High - confirmed RSVPs</option>
                  <option value="MEDIUM">Medium - good estimate</option>
                  <option value="LOW">Low - rough guess</option>
                </select>
              </div>

              {/* Min/Max Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="guestCountMin"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Minimum Guests
                  </label>
                  <input
                    type="number"
                    id="guestCountMin"
                    name="guestCountMin"
                    min="1"
                    value={formData.guestCountMin}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="guestCountMax"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Maximum Guests
                  </label>
                  <input
                    type="number"
                    id="guestCountMax"
                    name="guestCountMax"
                    min="1"
                    value={formData.guestCountMax}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
              </div>

              {/* Dietary Requirements */}
              <div className="border-t pt-6">
                <h3 className="font-semibold mb-4">Dietary Requirements</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="dietaryVegetarian" className="block text-sm text-gray-700 mb-1">
                      Vegetarian guests
                    </label>
                    <input
                      type="number"
                      id="dietaryVegetarian"
                      name="dietaryVegetarian"
                      min="0"
                      value={formData.dietaryVegetarian}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="dietaryVegan" className="block text-sm text-gray-700 mb-1">
                      Vegan guests
                    </label>
                    <input
                      type="number"
                      id="dietaryVegan"
                      name="dietaryVegan"
                      min="0"
                      value={formData.dietaryVegan}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="dietaryGlutenFree" className="block text-sm text-gray-700 mb-1">
                      Gluten-free guests
                    </label>
                    <input
                      type="number"
                      id="dietaryGlutenFree"
                      name="dietaryGlutenFree"
                      min="0"
                      value={formData.dietaryGlutenFree}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="dietaryDairyFree" className="block text-sm text-gray-700 mb-1">
                      Dairy-free guests
                    </label>
                    <input
                      type="number"
                      id="dietaryDairyFree"
                      name="dietaryDairyFree"
                      min="0"
                      value={formData.dietaryDairyFree}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="dietaryAllergies" className="block text-sm text-gray-700 mb-1">
                    Other allergies or dietary notes
                  </label>
                  <textarea
                    id="dietaryAllergies"
                    name="dietaryAllergies"
                    rows={2}
                    value={formData.dietaryAllergies}
                    onChange={handleChange}
                    placeholder="e.g., 1 guest with nut allergy, 2 with shellfish allergy"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.log('Step 2 complete, formData:', formData);
                    setStep(3);
                  }}
                  className="flex-1 px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark"
                >
                  Next: Venue Details →
                </button>
              </div>
            </>
          )}

          {/* STEP 3: Venue */}
          {step === 3 && (
            <>
              <h2 className="text-2xl font-bold mb-4">
                <MapPin className="inline w-6 h-6 mr-2" />
                Venue & Kitchen
              </h2>

              {/* Venue Name */}
              <div>
                <label htmlFor="venueName" className="block text-sm font-medium text-gray-700 mb-2">
                  Venue Name
                </label>
                <input
                  type="text"
                  id="venueName"
                  name="venueName"
                  value={formData.venueName}
                  onChange={handleChange}
                  placeholder="e.g., Beach House at Whangapoua"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* Venue Type */}
              <div>
                <label htmlFor="venueType" className="block text-sm font-medium text-gray-700 mb-2">
                  Venue Type
                </label>
                <select
                  id="venueType"
                  name="venueType"
                  value={formData.venueType}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="">Select type</option>
                  <option value="HOME">Home</option>
                  <option value="HIRED_VENUE">Hired Venue</option>
                  <option value="OUTDOOR">Outdoor</option>
                  <option value="MIXED">Mixed</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Kitchen Access */}
              <div>
                <label
                  htmlFor="venueKitchenAccess"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  <ChefHat className="inline w-4 h-4 mr-1" />
                  Kitchen Access
                </label>
                <select
                  id="venueKitchenAccess"
                  name="venueKitchenAccess"
                  value={formData.venueKitchenAccess}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="">Select access level</option>
                  <option value="FULL">Full kitchen access</option>
                  <option value="LIMITED">Limited access</option>
                  <option value="NONE">No kitchen access</option>
                  <option value="CATERING_ONLY">Catering only</option>
                </select>
              </div>

              {/* Kitchen Equipment */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="venueOvenCount" className="block text-sm text-gray-700 mb-1">
                    Number of Ovens
                  </label>
                  <input
                    type="number"
                    id="venueOvenCount"
                    name="venueOvenCount"
                    min="0"
                    value={formData.venueOvenCount}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="venueStoretopBurners"
                    className="block text-sm text-gray-700 mb-1"
                  >
                    Stovetop Burners
                  </label>
                  <input
                    type="number"
                    id="venueStoretopBurners"
                    name="venueStoretopBurners"
                    min="0"
                    value={formData.venueStoretopBurners}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="venueBbqAvailable" className="block text-sm text-gray-700 mb-1">
                    BBQ Available?
                  </label>
                  <select
                    id="venueBbqAvailable"
                    name="venueBbqAvailable"
                    value={formData.venueBbqAvailable}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Unknown</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>

              {/* Timing */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="venueTimingStart" className="block text-sm text-gray-700 mb-1">
                    Venue Start Time
                  </label>
                  <input
                    type="time"
                    id="venueTimingStart"
                    name="venueTimingStart"
                    value={formData.venueTimingStart}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="venueTimingEnd" className="block text-sm text-gray-700 mb-1">
                    Venue End Time
                  </label>
                  <input
                    type="time"
                    id="venueTimingEnd"
                    name="venueTimingEnd"
                    value={formData.venueTimingEnd}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Venue Notes */}
              <div>
                <label htmlFor="venueNotes" className="block text-sm text-gray-700 mb-1">
                  Additional Venue Notes
                </label>
                <textarea
                  id="venueNotes"
                  name="venueNotes"
                  rows={3}
                  value={formData.venueNotes}
                  onChange={handleChange}
                  placeholder="Any other important details about the venue..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-sage-600 text-white rounded-lg font-semibold hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating Event...' : 'Create Event ✓'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
