'use client';

import { useEffect, useState } from 'react';
import { Users, ClipboardList, User } from 'lucide-react';

interface Token {
  scope: string;
  token: string;
  personName: string;
  teamName?: string;
}

export default function DemoLandingPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const response = await fetch('/api/demo/tokens');
      if (response.ok) {
        const data = await response.json();
        setTokens(data.tokens);
      }
    } catch (err) {
      console.error('Failed to load tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading demo...</div>
      </div>
    );
  }

  const hostTokens = tokens.filter(t => t.scope === 'HOST');
  const coordinatorTokens = tokens.filter(t => t.scope === 'COORDINATOR');
  const participantTokens = tokens.filter(t => t.scope === 'PARTICIPANT');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Gather Demo</h1>
          <p className="text-lg text-gray-600 mb-2">Event Coordination System</p>
          <p className="text-sm text-gray-500">Choose a role to explore the interface</p>
        </div>

        {/* Host Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Users className="size-6 text-purple-600" />
            <h2 className="text-xl font-bold text-gray-900">Host View</h2>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {hostTokens.map((token) => (
              <a
                key={token.token}
                href={`/h/${token.token}`}
                className="block px-6 py-4 hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{token.personName}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      Full event oversight • Manage teams • Freeze event
                    </div>
                  </div>
                  <div className="text-purple-600">→</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Coordinator Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="size-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Coordinator Views</h2>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {coordinatorTokens.map((token) => (
              <a
                key={token.token}
                href={`/c/${token.token}`}
                className="block px-6 py-4 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900">{token.teamName || 'Team Coordinator'}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{token.personName}</div>
                  </div>
                  <div className="text-blue-600">→</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Participant Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <User className="size-6 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900">Participant Views</h2>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {participantTokens.map((token) => (
                <a
                  key={token.token}
                  href={`/p/${token.token}`}
                  className="block px-6 py-4 hover:bg-green-50 transition-colors border-b md:border-r border-gray-100 last:border-b-0 md:odd:last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      {token.teamName ? (
                        <>
                          <div className="font-bold text-gray-900">{token.teamName}</div>
                          <div className="text-sm text-gray-500 mt-0.5">{token.personName}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-gray-900">{token.personName}</div>
                          <div className="text-sm text-gray-500 mt-1">View assignments</div>
                        </>
                      )}
                    </div>
                    <div className="text-green-600">→</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 mt-8">
          <h3 className="font-semibold text-blue-900 mb-2">About This Demo</h3>
          <div className="text-sm text-blue-800 space-y-2">
            <p>
              <strong>Host:</strong> Manages the entire event, oversees all teams, and controls event status (Draft → Confirming → Frozen → Complete)
            </p>
            <p>
              <strong>Coordinator:</strong> Leads a specific team, assigns items to team members, and tracks progress
            </p>
            <p>
              <strong>Participant:</strong> Receives assignments, views item details, and acknowledges commitments
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>Wickham Family Christmas • Dec 24-26, 2025</p>
        </div>
      </div>
    </div>
  );
}
