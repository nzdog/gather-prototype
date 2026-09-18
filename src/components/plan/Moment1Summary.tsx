'use client';

import { useState } from 'react';
import MomentArc from '@/components/plan/MomentArc';
import { SavedHousehold } from '@/components/plan/HouseholdCardList';

interface Moment1SummaryProps {
  eventId: string;
  eventName: string;
  households: SavedHousehold[];
  onContinue: () => void;
  onBackToEditing: () => void;
}

interface MissingPerson {
  name: string;
  householdId: string;
  role: 'primaryContact' | 'partner' | 'helper' | 'guest';
  memberIndex?: number;
}

export default function Moment1Summary({
  eventId,
  eventName,
  households,
  onContinue,
  onBackToEditing,
}: Moment1SummaryProps) {
  const [skippedNames, setSkippedNames] = useState<Set<string>>(new Set());
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<{ email: string; phone: string }>({
    email: '',
    phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [localHouseholds, setLocalHouseholds] = useState<SavedHousehold[]>(households);

  // --- Stats ---
  const totalPeople = localHouseholds.reduce((sum, h) => {
    return sum + 1 + (h.partner ? 1 : 0) + h.helpers.length + h.littleCount + h.guests.length;
  }, 0);

  const householdCount = localHouseholds.length;

  const helpersCount = localHouseholds.reduce((sum, h) => sum + h.helpers.length, 0);
  const littlesCount = localHouseholds.reduce((sum, h) => sum + h.littleCount, 0);

  // Named people missing both email and phone
  const missingContacts: MissingPerson[] = [];
  for (const h of localHouseholds) {
    if (!h.primaryContact.email && !h.primaryContact.phone) {
      missingContacts.push({
        name: h.primaryContact.name,
        householdId: h.id,
        role: 'primaryContact',
      });
    }
    if (h.partner && !h.partner.email && !h.partner.phone) {
      missingContacts.push({
        name: h.partner.name,
        householdId: h.id,
        role: 'partner',
      });
    }
    for (let i = 0; i < h.helpers.length; i++) {
      const helper = h.helpers[i];
      if (!helper.email && !helper.phone) {
        missingContacts.push({
          name: helper.name,
          householdId: h.id,
          role: 'helper',
          memberIndex: i,
        });
      }
    }
    for (let i = 0; i < h.guests.length; i++) {
      const guest = h.guests[i];
      if (!guest.email && !guest.phone) {
        missingContacts.push({
          name: guest.name,
          householdId: h.id,
          role: 'guest',
          memberIndex: i,
        });
      }
    }
  }

  const missingCount = missingContacts.length;
  const visibleMissing = missingContacts.filter(
    (p) => !skippedNames.has(`${p.householdId}-${p.role}-${p.memberIndex ?? ''}`)
  );

  // --- Stats line segments ---
  const statsSegments: string[] = [`${householdCount} household${householdCount !== 1 ? 's' : ''}`];
  if (helpersCount > 0) {
    statsSegments.push(`${helpersCount} kid${helpersCount !== 1 ? 's' : ''} with jobs`);
  }
  if (littlesCount > 0) {
    statsSegments.push(`${littlesCount} kid${littlesCount !== 1 ? 's' : ''} without jobs`);
  }
  if (missingCount > 0) {
    statsSegments.push(
      `${missingCount} contact ${missingCount === 1 ? 'detail' : 'details'} still to find`
    );
  }

  const personKey = (p: MissingPerson) => `${p.householdId}-${p.role}-${p.memberIndex ?? ''}`;

  const handleAddNow = (person: MissingPerson) => {
    const key = personKey(person);
    if (expandedPerson === key) {
      setExpandedPerson(null);
    } else {
      setExpandedPerson(key);
      setContactForm({ email: '', phone: '' });
    }
  };

  const handleSkip = (person: MissingPerson) => {
    const key = personKey(person);
    setSkippedNames((prev) => new Set(prev).add(key));
    if (expandedPerson === key) {
      setExpandedPerson(null);
    }
  };

  const handleSaveContact = async (person: MissingPerson) => {
    if (!contactForm.email && !contactForm.phone) return;

    const household = localHouseholds.find((h) => h.id === person.householdId);
    if (!household) return;

    setSaving(true);
    try {
      // Build the updated household payload
      const updatedHousehold = { ...household };

      if (person.role === 'primaryContact') {
        updatedHousehold.primaryContact = {
          ...updatedHousehold.primaryContact,
          email: contactForm.email || updatedHousehold.primaryContact.email,
          phone: contactForm.phone || updatedHousehold.primaryContact.phone,
        };
      } else if (person.role === 'partner' && updatedHousehold.partner) {
        updatedHousehold.partner = {
          ...updatedHousehold.partner,
          email: contactForm.email || updatedHousehold.partner.email,
          phone: contactForm.phone || updatedHousehold.partner.phone,
        };
      } else if (person.role === 'helper' && person.memberIndex !== undefined) {
        const updatedHelpers = [...updatedHousehold.helpers];
        updatedHelpers[person.memberIndex] = {
          ...updatedHelpers[person.memberIndex],
          email: contactForm.email || updatedHelpers[person.memberIndex].email,
          phone: contactForm.phone || updatedHelpers[person.memberIndex].phone,
        };
        updatedHousehold.helpers = updatedHelpers;
      } else if (person.role === 'guest' && person.memberIndex !== undefined) {
        const updatedGuests = [...updatedHousehold.guests];
        updatedGuests[person.memberIndex] = {
          ...updatedGuests[person.memberIndex],
          email: contactForm.email || updatedGuests[person.memberIndex].email,
          phone: contactForm.phone || updatedGuests[person.memberIndex].phone,
        };
        updatedHousehold.guests = updatedGuests;
      }

      const res = await fetch(`/api/events/${eventId}/households/${person.householdId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryContact: updatedHousehold.primaryContact,
          partner: updatedHousehold.partner,
          helpers: updatedHousehold.helpers,
          littleCount: updatedHousehold.littleCount,
          guests: updatedHousehold.guests,
        }),
      });

      if (res.ok) {
        setLocalHouseholds((prev) =>
          prev.map((h) => (h.id === person.householdId ? updatedHousehold : h))
        );
        setExpandedPerson(null);
        setContactForm({ email: '', phone: '' });
      }
    } finally {
      setSaving(false);
    }
  };

  const hasPeople = totalPeople > 0;

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* MomentArc */}
        <MomentArc currentMoment={2} completedMoments={[1]} />

        {/* Headline stats */}
        <div className="mt-10">
          <h1 className="text-2xl font-semibold text-gray-900">
            {totalPeople} {totalPeople === 1 ? 'person' : 'people'} coming to {eventName}.
          </h1>
          {householdCount > 0 && (
            <p className="mt-1 text-base text-gray-500">{statsSegments.join(' \u00B7 ')}</p>
          )}
        </div>

        {/* Completion sentence */}
        {hasPeople && (
          <p className="mt-6 text-base text-gray-600 italic">
            Thanks. You&rsquo;ve done most of the hard work. I&rsquo;ll manage the invites and
            chase-ups from here.
          </p>
        )}

        {/* Missing contacts section */}
        {visibleMissing.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Still need contact details for:
            </h2>
            <div className="mt-3 space-y-2">
              {visibleMissing.map((person) => {
                const key = personKey(person);
                const isExpanded = expandedPerson === key;

                return (
                  <div key={key} className="border border-gray-200 rounded-lg bg-white">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-gray-900 font-medium">{person.name}</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleAddNow(person)}
                          className="text-sm text-accent hover:text-accent-dark font-medium transition-colors"
                        >
                          {isExpanded ? 'Cancel' : 'Add now'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSkip(person)}
                          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          Skip for now &rarr;
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Email</label>
                          <input
                            type="email"
                            value={contactForm.email}
                            onChange={(e) =>
                              setContactForm((prev) => ({ ...prev, email: e.target.value }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                            placeholder="email@example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Phone</label>
                          <input
                            type="tel"
                            value={contactForm.phone}
                            onChange={(e) =>
                              setContactForm((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                            placeholder="+64 21 123 4567"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSaveContact(person)}
                          disabled={saving || (!contactForm.email && !contactForm.phone)}
                          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add more people */}
        <div className="mt-8">
          <button
            type="button"
            onClick={onBackToEditing}
            className="text-sm text-accent hover:text-accent-dark font-medium transition-colors"
          >
            + Add more people
          </button>
        </div>

        {/* Continue button */}
        <div className="mt-8 pb-8">
          <button
            type="button"
            onClick={onContinue}
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors"
          >
            On to the plan &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
