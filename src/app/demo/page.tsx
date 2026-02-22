'use client';

import { useEffect, useState } from 'react';

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
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [openStep, setOpenStep] = useState<number | null>(null);

  const toggleStep = (n: number) => setOpenStep((prev) => (prev === n ? null : n));

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const response = await fetch(`/api/demo/tokens?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
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

  const handleOpenDashboard = async () => {
    setOpeningDashboard(true);
    try {
      const response = await fetch('/api/demo/session', { method: 'POST' });
      if (response.ok) {
        const { eventId } = await response.json();
        window.location.href = `/plan/${eventId}`;
      } else {
        alert('Failed to create demo session');
        setOpeningDashboard(false);
      }
    } catch (err) {
      console.error('Failed to open dashboard:', err);
      alert('Failed to open planning dashboard');
      setOpeningDashboard(false);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        'Are you sure you want to reset all data? This will delete everything and reseed the database.'
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const response = await fetch('/api/demo/reset', { method: 'POST' });
      if (response.ok) {
        await response.json();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        window.location.href = `/demo?reset=${Date.now()}`;
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
        <div className="text-gray-500">Loading demo…</div>
      </div>
    );
  }

  const hostToken = tokens.find((t) => t.scope === 'HOST' && t.personName === 'Sarah Henderson');
  const robToken = tokens.find(
    (t) => t.scope === 'COORDINATOR' && t.personName === 'Rob Henderson'
  );
  const emmaToken = tokens.find(
    (t) => t.scope === 'PARTICIPANT' && t.personName === 'Emma Henderson'
  );

  const hostLink = hostToken ? `/h/${hostToken.token}` : '#';
  const coordinatorLink = robToken ? `/c/${robToken.token}` : '#';
  const participantLink = emmaToken ? `/p/${emmaToken.token}` : '#';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-5 py-14">
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest text-sage-600 uppercase mb-3">Demo</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Gather</h1>
          <p className="text-gray-600 text-lg leading-relaxed">
            See how Sarah coordinated Christmas dinner for 43 people.
          </p>
        </div>

        <hr className="border-gray-200 mb-10" />

        {/* ── How Sarah Got Here ───────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-6">
            How Sarah Got Here
          </h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Sarah is hosting Henderson Family Christmas at Uncle Rob&rsquo;s place in Mangawhai.
            Here&rsquo;s what she did:
          </p>

          <div className="space-y-1">
            <StepBlock
              number={1}
              title="Created the event"
              isOpen={openStep === 1}
              onToggle={() => toggleStep(1)}
            >
              <p className="text-gray-600 mb-2">Sarah paid $12 and entered the basics:</p>
              <ul className="text-gray-600 space-y-1 pl-4">
                <li className="before:content-['•'] before:mr-2">
                  &ldquo;Henderson Family Christmas 2025&rdquo;
                </li>
                <li className="before:content-['•'] before:mr-2">
                  24–26 December at Uncle Rob&rsquo;s place, Mangawhai
                </li>
                <li className="before:content-['•'] before:mr-2">43 guests coming</li>
                <li className="before:content-['•'] before:mr-2">
                  Dietary needs: 6 vegetarian, 3 gluten-free, 2 dairy-free, 1 vegan
                </li>
              </ul>
            </StepBlock>

            <StepBlock
              number={2}
              title="Generated a plan"
              isOpen={openStep === 2}
              onToggle={() => toggleStep(2)}
            >
              <p className="text-gray-600 mb-2">
                She clicked &ldquo;Generate Plan&rdquo; and Gather&rsquo;s AI created:
              </p>
              <ul className="text-gray-600 space-y-1 pl-4 mb-3">
                <li className="before:content-['•'] before:mr-2">
                  8 teams (Starters, Mains, Salads, Desserts, Drinks, Kids Zone, Setup, Cleanup)
                </li>
                <li className="before:content-['•'] before:mr-2">56 items with quantities</li>
                <li className="before:content-['•'] before:mr-2">
                  Critical items flagged (ham, lamb, pavlova, ice, tables)
                </li>
              </ul>
              <p className="text-gray-500 text-sm">
                Sarah reviewed the suggestions, tweaked a few items, and removed the ones that
                didn&rsquo;t fit her family.
              </p>
            </StepBlock>

            <StepBlock
              number={3}
              title="Added her people"
              isOpen={openStep === 3}
              onToggle={() => toggleStep(3)}
            >
              <p className="text-gray-600 mb-2">She added 43 family members with their:</p>
              <ul className="text-gray-600 space-y-1 pl-4 mb-3">
                <li className="before:content-['•'] before:mr-2">Names and contact details</li>
                <li className="before:content-['•'] before:mr-2">Dietary requirements</li>
                <li className="before:content-['•'] before:mr-2">
                  Which team they&rsquo;re helping with
                </li>
              </ul>
              <p className="text-gray-500 text-sm">
                She assigned a coordinator to each team — people she trusts to manage their section.
              </p>
            </StepBlock>

            <StepBlock
              number={4}
              title="Moved to Confirming"
              isOpen={openStep === 4}
              onToggle={() => toggleStep(4)}
            >
              <p className="text-gray-600">
                When the plan looked right, Sarah transitioned to CONFIRMING. Gather generated a
                unique link for every person.
              </p>
            </StepBlock>

            <StepBlock
              number={5}
              title="Sent the invites"
              isOpen={openStep === 5}
              onToggle={() => toggleStep(5)}
            >
              <p className="text-gray-600">
                Sarah copied the links and sent them out — family WhatsApp group, email, and a few
                texts to the older relatives.
              </p>
            </StepBlock>
          </div>
        </section>

        <hr className="border-gray-200 mb-10" />

        {/* ── Where We Are Now ─────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-6">
            Where We Are Now
          </h2>
          <p className="text-gray-600 mb-4 leading-relaxed">
            It&rsquo;s a few days later. Responses are coming in:
          </p>
          <ul className="text-gray-700 space-y-2 mb-5 pl-1">
            <li className="flex items-start gap-2">
              <span className="text-sage-500 mt-0.5">•</span>
              <span>31 of 43 have responded (72%)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage-500 mt-0.5">•</span>
              <span>28 confirmed, 3 declined</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage-500 mt-0.5">•</span>
              <span>A few critical items still need confirmation</span>
            </li>
          </ul>
          <p className="text-gray-600">Explore from three perspectives:</p>
        </section>

        <hr className="border-gray-200 mb-10" />

        {/* ── Planning Dashboard ───────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            The Planning Dashboard
          </h2>
          <p className="text-gray-600 mb-6 leading-relaxed">
            This is where Sarah built her event — the full host dashboard. See the AI-generated
            plan, teams, items, and all the controls.
          </p>
          <button
            onClick={handleOpenDashboard}
            disabled={openingDashboard}
            className="inline-flex items-center gap-2 px-5 py-3 bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {openingDashboard ? 'Opening…' : 'Open Planning Dashboard →'}
          </button>
        </section>

        <hr className="border-gray-200 mb-10" />

        {/* ── Host View ────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            The Host View
          </h2>
          <p className="text-gray-600 mb-2 leading-relaxed">
            Sarah&rsquo;s &ldquo;check on things&rdquo; view via her magic link. See who&rsquo;s
            responded, what&rsquo;s confirmed, and what needs attention.
          </p>
          <p className="text-sm text-gray-500 mb-5">Sarah Henderson &middot; Host</p>
          <a
            href={hostLink}
            className="inline-flex items-center gap-2 px-5 py-3 bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition-colors text-sm"
          >
            Open Host View →
          </a>
          <HintBox
            label="Things to notice"
            items={[
              'The invite status shows sent / opened / responded',
              'The outcomes bar shows confirmed / declined / pending',
              'Click any person to see their status or record a manual response',
              'Critical gaps are flagged in red',
            ]}
          />
        </section>

        <hr className="border-gray-200 mb-10" />

        {/* ── Coordinator View ─────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            The Coordinator View
          </h2>
          <p className="text-gray-600 mb-2 leading-relaxed">
            Uncle Rob is coordinating Setup &amp; Equipment — tables, chairs, chilly bins, the BBQ.
            See what a team leader sees and can do.
          </p>
          <p className="text-sm text-gray-500 mb-5">Rob Henderson &middot; Setup &amp; Equipment</p>
          <a
            href={coordinatorLink}
            className="inline-flex items-center gap-2 px-5 py-3 bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition-colors text-sm"
          >
            Open Coordinator View →
          </a>
          <HintBox
            label="Things to try"
            items={[
              'See the items assigned to his team',
              'Notice which items are confirmed vs pending',
              'He can only see his team — not the whole event',
            ]}
          />
        </section>

        <hr className="border-gray-200 mb-10" />

        {/* ── Participant View ─────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            The Participant View
          </h2>
          <p className="text-gray-600 mb-2 leading-relaxed">
            Cousin Emma was asked to bring trifle. See what guests see when they open their invite
            link.
          </p>
          <p className="text-sm text-gray-500 mb-5">Emma Henderson &middot; Desserts</p>
          <a
            href={participantLink}
            className="inline-flex items-center gap-2 px-5 py-3 bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition-colors text-sm"
          >
            Open Participant View →
          </a>
          <HintBox
            label="Things to try"
            items={[
              "See the event details and what she's been asked to bring",
              'Accept or decline the assignment',
              'Go back to Host View — notice the status updates',
            ]}
          />
        </section>

        <hr className="border-gray-200 mb-10" />

        {/* ── What Happens Next ────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-4">
            What Happens Next
          </h2>
          <p className="text-gray-600 mb-4 leading-relaxed">
            When enough responses are in, Sarah will:
          </p>
          <ul className="text-gray-700 space-y-2 mb-5 pl-1">
            <li className="flex items-start gap-2">
              <span className="text-sage-500 mt-0.5">•</span>
              <span>Review the compliance rate (aiming for 80%+)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage-500 mt-0.5">•</span>
              <span>Check that critical items are all confirmed</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage-500 mt-0.5">•</span>
              <span>Freeze the plan — locking all assignments</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage-500 mt-0.5">•</span>
              <span>Copy the plan as text for the fridge</span>
            </li>
          </ul>
          <p className="text-gray-500 text-sm">
            Anyone who hasn&rsquo;t responded by then? She&rsquo;ll call them.
          </p>
        </section>

        <hr className="border-gray-200 mb-10" />

        {/* ── Behind the Scenes ────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-6">
            Behind the Scenes
          </h2>
          <p className="text-gray-600 mb-6">Things that happen automatically:</p>
          <div className="space-y-6">
            <AutoFeature emoji="📱" title="SMS Nudges">
              If someone hasn&rsquo;t opened their link after 24 hours, they get a gentle text
              reminder. Another at 48 hours if still no response.
            </AutoFeature>
            <AutoFeature emoji="📋" title="Audit Trail">
              Every action is logged. Sarah can see exactly when someone opened their link and
              responded.
            </AutoFeature>
            <AutoFeature emoji="🌙" title="Quiet Hours">
              No SMS messages between 9pm and 8am.
            </AutoFeature>
            <AutoFeature emoji="🛑" title="Opt-Out">
              Anyone can reply STOP to opt out of SMS reminders.
            </AutoFeature>
          </div>
        </section>

        <hr className="border-gray-200 mb-10" />

        {/* ── Reset ────────────────────────────────────────────── */}
        <section className="text-center">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-5 py-2.5 bg-white border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetting ? 'Resetting…' : 'Reset Demo Data'}
          </button>
          <p className="text-gray-400 text-xs mt-3">Start fresh with a clean 43-person event.</p>
        </section>
      </div>
    </div>
  );
}

/* ── Local sub-components ─────────────────────────────────────── */

function StepBlock({
  number,
  title,
  isOpen,
  onToggle,
  children,
}: {
  number: number;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 py-3 px-1 text-left hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
      >
        <span
          className={`flex-shrink-0 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M7 5l6 5-6 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-sage-100 text-sage-700 text-xs font-bold flex items-center justify-center">
          {number}
        </div>
        <span className="flex-1 text-sm font-medium text-gray-700 uppercase tracking-wide">
          {title}
        </span>
      </button>
      <div
        className={`grid transition-all duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="pl-[3.25rem] pr-1 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function HintBox({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-5 bg-gray-100 rounded-lg px-4 py-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{label}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-500">
            <span className="mt-0.5 flex-shrink-0">›</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AutoFeature({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="text-xl flex-shrink-0 leading-snug">{emoji}</span>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
        <p className="text-sm text-gray-500 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
