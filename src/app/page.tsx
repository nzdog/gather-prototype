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
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      // Add cache busting to ensure fresh tokens
      const response = await fetch(`/api/demo/tokens?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (response.ok) {
        const data = await response.json();
        console.log(`[Demo] Fetched ${data.tokens.length} tokens from API`);
        if (data.tokens.length > 0) {
          console.log(`[Demo] First HOST token: /h/${data.tokens.find((t: any) => t.scope === 'HOST')?.token.substring(0, 16)}...`);
          console.log(`[Demo] First COORD token: /c/${data.tokens.find((t: any) => t.scope === 'COORDINATOR')?.token.substring(0, 16)}...`);
        }
        setTokens(data.tokens);
      }
    } catch (err) {
      console.error('Failed to load tokens:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all data? This will delete everything and reseed the database.')) {
      return;
    }

    setResetting(true);
    try {
      const response = await fetch('/api/demo/reset', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        // Wait for DB to commit
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Force complete page reload with aggressive cache busting
        // Use location.replace to prevent back button issues
        window.location.replace(`/?reset=${Date.now()}`);
      } else {
        const error = await response.json();
        alert(`Failed to reset: ${error.error}`);
        setResetting(false);
      }
    } catch (err) {
      console.error('Reset failed:', err);
      alert('Failed to reset database');
      setResetting(false);
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
        <div className="text-center mb-12 relative">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="absolute top-0 right-0 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetting ? 'Resetting...' : '🔄 Reset Demo Data'}
          </button>
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
