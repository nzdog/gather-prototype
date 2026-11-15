/**
 * [[GTC-460]] Stage 3, step 3b — ONE ROW OF THE CONTACTS LIST, and the ways forward on a row with a
 * problem (ruling 160).
 *
 * A person is drawn with their name, email and number, and a Remove button. A person the reader
 * flagged (GTC-448 keeps one of seven sentences for each fault) also shows those sentences, then
 * "Gather will take care of this.", then three ways forward: Double-check it (the name, email and
 * number as boxes, the checks run again as she types, Done saves), Skip it (the flagged detail is
 * left out and the person kept), and Use a different way (one box for another number or email,
 * Done saves). A person with no number or email is not flagged and shows none of this (C2).
 *
 * A plain function that returns markup, not a component with state of its own: the screen keeps the
 * one open panel and every handler, and hands them in.
 */
import type { Contact } from '@/lib/contacts/store';
import { CONTACTS_WORDS as W, removeLabel } from '@/lib/contacts/words';

const WAY =
  'px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 hover:bg-gray-50';
const BOX =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent';

/** What is typed in the open panel of one row. */
export type RowPanel = {
  id: string;
  kind: 'check' | 'other';
  name: string;
  email: string;
  phone: string;
  other: string;
};
export type PanelField = 'name' | 'email' | 'phone' | 'other';

export type RowProps = {
  contact: Contact;
  /** The open panel, if it is this row's. */
  panel: RowPanel | null;
  /** The checks run again on what is typed in the panel (GTC-448's sentences). */
  live: string[];
  doneOff: boolean;
  onRemove: () => void;
  onOpen: (kind: 'check' | 'other') => void;
  onSkip: () => void;
  onType: (field: PanelField, value: string) => void;
  onDone: () => void;
};

function field(
  id: string,
  label: string,
  value: string,
  max: number,
  type: string,
  onChange: (value: string) => void
) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        className={BOX}
      />
    </div>
  );
}

export function renderRow(p: RowProps) {
  const c = p.contact;
  const flagged = (c.problems?.length ?? 0) > 0;
  const panel = p.panel;
  return (
    <li key={c.id} data-contact-id={c.id} className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 break-words">{c.name}</p>
          {c.email && <p className="text-sm text-gray-600 break-words">{c.email}</p>}
          {c.phone && <p className="text-sm text-gray-600 break-words">{c.phone}</p>}
        </div>
        <button
          type="button"
          aria-label={removeLabel(c.name)}
          onClick={p.onRemove}
          className="shrink-0 px-3 py-2 text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
        >
          {W.REMOVE}
        </button>
      </div>

      {flagged && (
        <div className="mt-2 text-sm">
          <div data-contact-problems className="space-y-1 text-gray-700">
            {(c.problems ?? []).map((line, k) => (
              <p key={k}>{line}</p>
            ))}
          </div>
          <p data-contact-care className="mt-1 text-gray-700">
            {W.FLAG_CARE}
          </p>
          <div data-contact-ways className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => p.onOpen('check')} className={WAY}>
              {W.DOUBLE_CHECK}
            </button>
            <button type="button" onClick={p.onSkip} className={WAY}>
              {W.SKIP_IT}
            </button>
            <button type="button" onClick={() => p.onOpen('other')} className={WAY}>
              {W.DIFFERENT_WAY}
            </button>
          </div>

          {panel && (
            <div
              data-contact-panel={panel.kind}
              className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              {panel.kind === 'check' ? (
                <>
                  {field(`contact-name-${c.id}`, W.FIELD_NAME, panel.name, 200, 'text', (v) =>
                    p.onType('name', v)
                  )}
                  {field(`contact-email-${c.id}`, W.FIELD_EMAIL, panel.email, 254, 'email', (v) =>
                    p.onType('email', v)
                  )}
                  {field(`contact-phone-${c.id}`, W.FIELD_PHONE, panel.phone, 40, 'tel', (v) =>
                    p.onType('phone', v)
                  )}
                  {p.live.map((line, k) => (
                    <p key={k} data-contact-live className="text-sm text-gray-700">
                      {line}
                    </p>
                  ))}
                </>
              ) : (
                field(`contact-other-${c.id}`, W.FIELD_OTHER, panel.other, 254, 'text', (v) =>
                  p.onType('other', v)
                )
              )}
              <button
                type="button"
                onClick={p.onDone}
                disabled={p.doneOff}
                className={`${WAY} disabled:cursor-not-allowed disabled:text-gray-400`}
              >
                {W.DONE}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
