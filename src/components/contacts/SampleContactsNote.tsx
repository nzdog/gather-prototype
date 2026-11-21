import { CONTACTS_WORDS } from '@/lib/contacts/words';
import { CONTACTS_SAMPLE } from '@/lib/demo/contacts-sample-words';

/**
 * [[GTC-468]] (ruling A, Q3) — WHAT A SAMPLE VISITOR SEES AT /plan/contacts: the page's title and the
 * founder's one sentence (R2), and nothing else. No loading box, no list, no storage and no request,
 * so nothing can be loaded in a sample and nothing is left in her browser for Gather to delete.
 */
export default function SampleContactsNote() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">{CONTACTS_WORDS.TITLE}</h1>
        <p data-contacts-sample className="mt-2 text-gray-600">
          {CONTACTS_SAMPLE.TOAST}
        </p>
      </div>
    </div>
  );
}
