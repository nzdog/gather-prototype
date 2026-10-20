'use client';

import { useState } from 'react';
import { Calendar } from 'lucide-react';
import EventDateFields from '@/components/plan/EventDateFields';
import { DEMO_COPY_NAME, DEMO_HOST_NAME, demoCopyDay } from '@/lib/demo/copy';
import { DEMO_START_WORDS } from '@/lib/demo/start-limit';
import {
  CREATE_EVENT_WORDS,
  SAMPLE_DETAILS,
  SAMPLE_EVENT_WORDS,
  VENUE_WORDS,
  startSampleWithDetails,
  type SampleStartOutcome,
} from '@/lib/demo/new-event';
import { dayOf, datePairProblem, type DatePairValue } from '@/lib/events/date-pair';

/**
 * /demo/new — [[GTC-395]] item 3 (founder, 20 Oct 2026): a sample starts on its own "Create Your
 * Event" page, pre-filled. A sibling of the real paying page (`src/app/plan/new/page.tsx`, not
 * edited), looking like it, with no price, no payment and nothing of Stripe. Development-only, as
 * the "Try it yourself" button is (this folder's layout gives a plain not-found anywhere else).
 *
 * The event's name, dates and venue are hers to change; the host's name, email and phone are shown
 * filled but locked, because the sample uses a throwaway host and ignores them. The button starts
 * the sample and saves her details onto it (`startSampleWithDetails`, src/lib/demo/new-event.ts).
 * If the save fails, the sample still opens, and this page says so in one line first.
 */

/** How long the save-failed line shows before the sample opens anyway. */
const SAVE_ERROR_PAUSE_MS = 3000;

const LABEL = 'block text-sm font-medium text-gray-700 mb-2';
const INPUT =
  'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent text-lg';
const LOCKED = `${INPUT} bg-gray-100 text-gray-500 cursor-not-allowed`;

export default function DemoNewEventPage() {
  const [name, setName] = useState<string>(DEMO_COPY_NAME);
  const [dates, setDates] = useState<DatePairValue>(() => {
    const day = dayOf(demoCopyDay(new Date()));
    return { first: day, last: day, moreDays: false };
  });
  const [venueName, setVenueName] = useState<string>(SAMPLE_DETAILS.venueName);
  const [venueTimingStart, setVenueTimingStart] = useState<string>(SAMPLE_DETAILS.venueTimingStart);
  const [venueTimingEnd, setVenueTimingEnd] = useState<string>(SAMPLE_DETAILS.venueTimingEnd);
  const [starting, setStarting] = useState(false);
  const [outcome, setOutcome] = useState<SampleStartOutcome | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (datePairProblem(dates)) return;
    setStarting(true);
    setOutcome(null);
    const result = await startSampleWithDetails({
      name,
      dates,
      venueName,
      venueTimingStart,
      venueTimingEnd,
    });
    if (result.kind === 'opened') {
      window.location.href = result.href;
      return;
    }
    setOutcome(result);
    if (result.kind === 'saveError') {
      // The sample is started and works as it would have; only her details were not saved.
      setTimeout(() => {
        window.location.href = result.href;
      }, SAVE_ERROR_PAUSE_MS);
      return;
    }
    setStarting(false);
  };

  const line =
    outcome?.kind === 'saveError'
      ? { words: SAMPLE_EVENT_WORDS.SAVE_FAILED, href: outcome.href }
      : outcome?.kind === 'refused'
        ? { words: outcome.words, href: outcome.href }
        : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{CREATE_EVENT_WORDS.HEADING}</h1>
          <p className="text-gray-600">{SAMPLE_EVENT_WORDS.LINE}</p>
        </div>

        <form onSubmit={handleCreate} className="bg-white rounded-lg shadow-md p-8 space-y-6">
          <div>
            <label htmlFor="name" className={LABEL}>
              {CREATE_EVENT_WORDS.EVENT_NAME}
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="hostName" className={LABEL}>
              {CREATE_EVENT_WORDS.YOUR_NAME}
            </label>
            <input
              type="text"
              id="hostName"
              name="hostName"
              value={DEMO_HOST_NAME}
              readOnly
              disabled
              className={LOCKED}
            />
          </div>

          <div>
            <label htmlFor="email" className={LABEL}>
              {CREATE_EVENT_WORDS.EMAIL}
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={SAMPLE_DETAILS.email}
              readOnly
              disabled
              className={LOCKED}
            />
          </div>

          <div>
            <label htmlFor="phone" className={LABEL}>
              {CREATE_EVENT_WORDS.PHONE}
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={SAMPLE_DETAILS.phone}
              readOnly
              disabled
              className={LOCKED}
            />
          </div>

          <EventDateFields
            value={dates}
            onChange={setDates}
            icon={<Calendar className="inline w-4 h-4 mr-1" />}
            labelClassName={LABEL}
            inputClassName={INPUT}
          />

          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">{VENUE_WORDS.HEADING}</h3>
            <div>
              <label htmlFor="venueName" className={LABEL}>
                {VENUE_WORDS.NAME}
              </label>
              <input
                type="text"
                id="venueName"
                name="venueName"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className={INPUT}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="venueTimingStart" className={LABEL}>
                  {VENUE_WORDS.START}
                </label>
                <input
                  type="text"
                  id="venueTimingStart"
                  name="venueTimingStart"
                  value={venueTimingStart}
                  onChange={(e) => setVenueTimingStart(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="venueTimingEnd" className={LABEL}>
                  {VENUE_WORDS.END}
                </label>
                <input
                  type="text"
                  id="venueTimingEnd"
                  name="venueTimingEnd"
                  value={venueTimingEnd}
                  onChange={(e) => setVenueTimingEnd(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={starting}
            className="w-full px-6 py-4 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {starting ? SAMPLE_EVENT_WORDS.STARTING : SAMPLE_EVENT_WORDS.BUTTON}
          </button>

          {line && (
            <p className="text-sm text-gray-700 text-center">
              {line.words}{' '}
              {line.href && (
                <a href={line.href} className="underline underline-offset-2">
                  {DEMO_START_WORDS.GO_TO_IT}
                </a>
              )}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
