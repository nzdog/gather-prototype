/**
 * [[GTC-460]] Stage 3, step 3b — THE LOADING AREA of the contacts page.
 *
 * The paste box and its button, the file choice, the phone's picker button (only where the picker
 * exists; where it does not, nothing at all is drawn for it), the laptop help note, and the
 * summary of the last load. Every sentence is a ruled W-line in `@/lib/contacts/words`.
 *
 * A plain function that returns markup, not a component with state of its own: the screen
 * (`ContactsScreen`) keeps every piece of state and hands it in, so one render shows the whole page
 * and the page's tests can see all of it.
 */
import type { ChangeEvent, RefObject } from 'react';
import { CONTACTS_WORDS as W } from '@/lib/contacts/words';

const BUTTON =
  'px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white';

export type LoadBoxProps = {
  /** The browser will not keep a list: every loading button is off. */
  disabled: boolean;
  pasteText: string;
  onPasteText: (value: string) => void;
  onAddPaste: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  /** The phone's picker is there (decided after the page has started, never on the first paint). */
  canPick: boolean;
  /** A pick is open. */
  picking: boolean;
  onPick: () => void;
  /** What the last load or refusal said: the ruled sentences, one per line. */
  summary: string[];
};

export function renderLoadBox(p: LoadBoxProps) {
  return (
    <section data-contacts-load className="mt-6 space-y-5">
      <div>
        <label htmlFor="contacts-paste" className="block text-sm font-medium text-gray-700 mb-1">
          {W.PASTE_LABEL}
        </label>
        <p id="contacts-paste-help" className="text-sm text-gray-500 mb-2">
          {W.PASTE_HELP}
        </p>
        <textarea
          id="contacts-paste"
          aria-describedby="contacts-paste-help"
          rows={5}
          value={p.pasteText}
          placeholder={W.PASTE_EXAMPLE}
          onChange={(e) => p.onPasteText(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="button"
          onClick={p.onAddPaste}
          disabled={p.disabled}
          className={`mt-2 ${BUTTON}`}
        >
          {W.PASTE_BUTTON}
        </button>
      </div>

      <div>
        <button
          type="button"
          onClick={() => p.fileRef.current?.click()}
          disabled={p.disabled}
          className={BUTTON}
        >
          {W.FILE_BUTTON}
        </button>
        <p className="mt-1 text-sm text-gray-500">{W.FILE_HELP}</p>
        <p data-contacts-odd className="mt-1 text-sm text-gray-500">
          {W.FILE_ODD_LETTERS}
        </p>
        <input
          ref={p.fileRef}
          type="file"
          accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard"
          onChange={p.onFile}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
        />
      </div>

      {p.canPick && (
        <div>
          <button
            type="button"
            onClick={p.onPick}
            disabled={p.disabled || p.picking}
            className={BUTTON}
          >
            {W.PICKER_BUTTON}
          </button>
        </div>
      )}

      <p data-contacts-laptop className="text-sm text-gray-600">
        {W.LAPTOP_NOTE}
      </p>

      <div data-contacts-summary aria-live="polite" className="space-y-1">
        {p.summary.map((line, k) => (
          <p key={k} className="text-sm text-gray-800">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}
