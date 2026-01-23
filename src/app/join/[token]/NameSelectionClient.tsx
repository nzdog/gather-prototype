'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

interface Person {
  id: string;
  name: string;
  isClaimed: boolean;
  hasDuplicate: boolean;
  firstItem: string | null;
}

interface Props {
  eventId: string;
  eventName: string;
  eventToken: string;
  hostName: string;
  people: Person[];
}

type Screen = 'search' | 'confirm';

export function NameSelectionClient({ eventName, eventToken, hostName, people }: Props) {
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter people based on search query (fuzzy match)
  const filteredPeople = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (query.length < 2) return [];

    return people
      .filter((p) => p.name.toLowerCase().includes(query))
      .sort((a, b) => {
        // Prioritize names that START with the query
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10); // Limit results
  }, [people, searchQuery]);

  const handleSelectPerson = (person: Person) => {
    if (person.isClaimed) {
      setError(`"${person.name}" has already been claimed. If this is you, contact ${hostName}.`);
      return;
    }
    setSelectedPerson(person);
    setError(null);
    setScreen('confirm');
  };

  const handleConfirm = async () => {
    if (!selectedPerson) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/join/${eventToken}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: selectedPerson.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Already claimed - go back to search
          setError(data.error || 'This name was just claimed by someone else.');
          setScreen('search');
          setSelectedPerson(null);
        } else {
          setError(data.error || 'Something went wrong. Please try again.');
        }
        return;
      }

      // Success - redirect to participant view
      router.push(`/p/${data.participantToken}`);
    } catch (e) {
      setError('Connection error. Please check your internet and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setScreen('search');
    setSelectedPerson(null);
    setError(null);
  };

  // ============ CONFIRM SCREEN ============
  if (screen === 'confirm' && selectedPerson) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          {/* Back button */}
          <button
            onClick={handleBack}
            disabled={isSubmitting}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </button>

          {/* Confirmation content */}
          <div className="text-center">
            <div className="w-20 h-20 bg-sage-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-sage-600" />
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-2">Is this you?</h2>

            <p className="text-3xl font-bold text-gray-900 mb-2">{selectedPerson.name}</p>

            {selectedPerson.firstItem && (
              <p className="text-gray-500 mb-6">Assigned to bring: {selectedPerson.firstItem}</p>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 text-left">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                No, go back
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-sage-600 text-white rounded-lg font-medium hover:bg-sage-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Confirming...' : "Yes, that's me"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ SEARCH SCREEN ============
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{eventName}</h1>
          <p className="text-gray-600">Find your name to see what you're bringing</p>
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setError(null);
            }}
            placeholder="Start typing your name..."
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-sage-500 focus:border-sage-500 outline-none transition-shadow"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Results */}
        {searchQuery.length >= 2 && (
          <div className="space-y-2">
            {filteredPeople.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No matching names found.</p>
                <p className="text-sm mt-1">Check spelling or contact {hostName}.</p>
              </div>
            ) : (
              filteredPeople.map((person) => (
                <button
                  key={person.id}
                  onClick={() => handleSelectPerson(person)}
                  disabled={person.isClaimed}
                  className={`w-full p-4 text-left rounded-lg border transition-all ${
                    person.isClaimed
                      ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                      : 'border-gray-200 hover:border-sage-400 hover:bg-sage-50 active:bg-sage-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span
                        className={`font-medium ${person.isClaimed ? 'text-gray-400' : 'text-gray-900'}`}
                      >
                        {person.name}
                      </span>
                      {/* Show disambiguator for duplicate names */}
                      {person.hasDuplicate && person.firstItem && (
                        <span className="text-sm text-gray-500 ml-2">({person.firstItem})</span>
                      )}
                    </div>
                    {person.isClaimed && (
                      <span className="flex items-center gap-1 text-sm text-gray-400">
                        <CheckCircle className="w-4 h-4" />
                        Claimed
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Helper text */}
        {searchQuery.length < 2 && (
          <p className="text-center text-sm text-gray-500 mt-4">
            Type at least 2 letters to search
          </p>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-8">
          Can't find your name? Contact {hostName}.
        </p>
      </div>
    </div>
  );
}
