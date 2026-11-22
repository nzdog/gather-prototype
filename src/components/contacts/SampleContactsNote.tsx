import { CONTACTS_WORDS } from '@/lib/contacts/words';
import { CONTACTS_SAMPLE } from '@/lib/demo/contacts-sample-words';
import { goBack, renderTopBar } from '@/components/contacts/TopBar';

/**
 * [[GTC-468]] (ruling A, Q3) — WHAT A SAMPLE VISITOR SEES AT /plan/contacts: the page's title and the
 * founder's one sentence (R2). No loading box, no list, no storage and no request, so nothing can be
 * loaded in a sample and nothing is left in her browser for Gather to delete.
 *
 * [[GTC-470]] (R3 changes ruling A, Q3): above them, the same top bar the real screen draws, so the page has
 * a way back: "← Your events" and "Go back". No Moments row (a sample visitor never arrives from an event
 * here), and this note still reads no address: Go back is the browser's back or Your events.
 */
export default function SampleContactsNote() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {renderTopBar({ showMoments: false, doors: null, onGoBack: () => goBack(null) })}
        <h1 className="text-3xl font-bold text-gray-900">{CONTACTS_WORDS.TITLE}</h1>
        <p data-contacts-sample className="mt-2 text-gray-600">
          {CONTACTS_SAMPLE.TOAST}
        </p>
      </div>
    </div>
  );
}
