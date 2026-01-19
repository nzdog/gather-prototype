'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Calendar, Loader2 } from 'lucide-react';

interface Person {
  id: string;
  name: string;
  token: string | null;
}

interface DirectoryData {
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    occasionType: string | null;
  };
  people: Person[];
}

export default function DirectoryPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const [data, setData] = useState<DirectoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [eventId]);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/gather/${eventId}/directory`);
      if (!response.ok) {
        throw new Error('Failed to load directory');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePersonClick = (person: Person) => {
    if (person.token) {
      router.push(`/p/${person.token}`);
    } else {
      alert('This person does not have access yet. Please contact the host.');
    }
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const formatter = new Intl.DateTimeFormat('en-NZ', {
      month: 'short',
      day: 'numeric',
      timeZone: 'Pacific/Auckland',
    });
    const startFormatted = formatter.format(start);
    const endDay = formatter.format(end).split(' ')[1];
    return `${startFormatted}-${endDay}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 text-sage-600 animate-spin" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-4">
            <Users className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Event Not Found</h1>
          <p className="text-gray-600">{error || 'Unable to load this event'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sage-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-sage-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-sage-600 rounded-full mb-4">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              {data.event.name}
            </h1>
            <div className="flex items-center justify-center gap-4 text-gray-600">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm sm:text-base">
                  {formatDateRange(data.event.startDate, data.event.endDate)}
                </span>
              </div>
              {data.event.occasionType && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm sm:text-base capitalize">
                    {data.event.occasionType.toLowerCase()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
            Who are you?
          </h2>
          <p className="text-gray-600">Select your name to view your assignments</p>
        </div>

        {data.people.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-600">No people have been added to this event yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.people.map((person) => (
              <button
                key={person.id}
                onClick={() => handlePersonClick(person)}
                disabled={!person.token}
                className={`
                  bg-white rounded-lg shadow-sm border-2 p-6 text-center
                  transition-all duration-200
                  ${
                    person.token
                      ? 'border-sage-200 hover:border-sage-400 hover:shadow-md cursor-pointer active:scale-95'
                      : 'border-gray-200 opacity-50 cursor-not-allowed'
                  }
                `}
              >
                <div
                  className={`
                  inline-flex items-center justify-center w-12 h-12 rounded-full mb-3
                  ${person.token ? 'bg-sage-100' : 'bg-gray-100'}
                `}
                >
                  <span
                    className={`text-xl font-bold ${person.token ? 'text-sage-700' : 'text-gray-500'}`}
                  >
                    {person.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 text-lg">{person.name}</h3>
                {!person.token && (
                  <p className="text-xs text-gray-500 mt-2">No access yet</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-sage-50 rounded-lg border border-sage-200 p-6 text-center">
          <p className="text-sm text-sage-800">
            Don't see your name? Contact the event host to be added.
          </p>
        </div>
      </div>
    </div>
  );
}
