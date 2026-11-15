'use client';

/**
 * [[GTC-460]] Stage 3, step 3a — THE CONTACTS SCREEN: what /plan/contacts shows.
 *
 * The title, one line saying where her contacts live (A5), a count that is always on screen, a Clear
 * button that is always drawn and asks first, the list with a Remove button on each person, and plain
 * lines for the empty list, for nobody signed in, and for a browser that will not keep them. Nothing
 * can be loaded yet (step 3b). Every sentence is a ruled W-line, in `@/lib/contacts/words`.
 *
 * WHERE THE LIST COMES FROM. Only this browser's storage, through `@/lib/contacts/store`, under the
 * signed-in person's id (read from `ViewerIdContext`, as the household form's drafts are). This file
 * makes no request and holds nothing on a server. It reads storage only AFTER it has mounted, so the
 * page the server draws and the page the browser draws first are the same: a loading state with no
 * words in it.
 *
 * KB-001. A page opened straight after sign-in can still be drawn with nobody signed in. As
 * `plan/events/page.tsx` does, this asks the router to refresh when the id is missing, once it has
 * mounted, so the layout is drawn again with the session.
 */
import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ViewerIdContext } from '@/components/shared/Providers';
import {
  browserContactsStore,
  browserTabStore,
  clearContacts,
  contactsKey,
  readContacts,
  removeContact,
  type Contact,
} from '@/lib/contacts/store';
import { CONTACTS_WORDS as W, clearAsk, countWords, removeLabel } from '@/lib/contacts/words';
import { backHref, readAddress, type ContactsAddress } from '@/lib/contacts/address';

const NO_ADDRESS: ContactsAddress = { eventId: null, form: null, editId: null };

export default function ContactsScreen() {
  const viewerId = useContext(ViewerIdContext);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [address, setAddress] = useState<ContactsAddress>(NO_ADDRESS);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [refused, setRefused] = useState(false);
  const [asking, setAsking] = useState(false);
  // W42 (ruling 172): the last Remove or Clear did not save. W16 (`refused`) is for loading only.
  const [saveFailed, setSaveFailed] = useState(false);

  // Mounted: only now is the browser's address and storage looked at.
  useEffect(() => {
    setAddress(readAddress(window.location.search));
    setMounted(true);
  }, []);

  // KB-001: nobody signed in as far as the layout knows - ask for it to be drawn again, once.
  useEffect(() => {
    if (mounted && !viewerId) router.refresh();
    // The router is stable; this runs when the page mounts or who is signed in changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, viewerId]);

  // Her list, whenever she is known (and again if who is signed in changes).
  useEffect(() => {
    if (!mounted) return;
    const read = readContacts(browserContactsStore(), viewerId);
    setContacts(read.contacts);
    setRefused(read.status === 'refused');
    setSaveFailed(false);
    setAsking(false);
  }, [mounted, viewerId]);

  // Two tabs of this page keep in step: a change to her list elsewhere is read here too.
  useEffect(() => {
    if (!mounted || !viewerId) return;
    const mine = contactsKey(viewerId);
    const onStorage = (e: StorageEvent) => {
      // A null key means the whole storage was cleared.
      if (e.key !== null && e.key !== mine) return;
      const read = readContacts(browserContactsStore(), viewerId);
      setContacts(read.contacts);
      setRefused(read.status === 'refused');
      setSaveFailed(false); // her list was read again: the old line is out of date
      setAsking(false);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mounted, viewerId]);

  const remove = (id: string) => {
    const done = removeContact(browserContactsStore(), viewerId, id);
    // W42: if it did not save, whether the browser refused or was full, nothing changed, and the
    // list on the screen stays as it is.
    const removeFailed = done.status !== 'ok';
    setSaveFailed(removeFailed);
    if (!removeFailed) setContacts(done.contacts);
  };

  const clear = () => {
    const done = clearContacts(browserContactsStore(), browserTabStore(), viewerId);
    // What is stored now is what is shown: if the browser would not remove, the list is still there.
    const read = readContacts(browserContactsStore(), viewerId);
    setContacts(read.contacts);
    setRefused(read.status === 'refused');
    const clearFailed = done.status !== 'ok';
    setSaveFailed(clearFailed);
    setAsking(false);
  };

  const back = mounted ? backHref(address) : null;
  const n = contacts.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {back && (
          <a
            href={back}
            className="inline-block mb-4 text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
          >
            {W.BACK}
          </a>
        )}
        <h1 className="text-3xl font-bold text-gray-900">{W.TITLE}</h1>
        <p data-contacts-note className="mt-2 text-gray-600">
          {W.A5}
        </p>

        {!mounted ? (
          <div data-contacts-state="loading" aria-busy="true" className="mt-6" />
        ) : !viewerId ? (
          <p data-contacts-state="signed-out" className="mt-6 text-gray-700">
            {W.SIGNED_OUT}{' '}
            <a
              href={W.SIGN_IN_HREF}
              className="text-accent underline underline-offset-2 hover:text-accent-dark"
            >
              {W.SIGN_IN_LABEL}
            </a>
          </p>
        ) : (
          <>
            {refused && (
              <p
                data-contacts-state="refused"
                className="mt-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-700"
              >
                {W.REFUSED}
              </p>
            )}

            <div aria-live="polite">
              {saveFailed && !refused && (
                <p
                  data-contacts-state="save-failed"
                  className="mt-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-700"
                >
                  {W.SAVE_FAILED}
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p
                data-contacts-count
                aria-live="polite"
                className="text-lg font-semibold text-gray-900"
              >
                {countWords(n)}
              </p>
              <button
                type="button"
                data-contacts-clear
                disabled={n === 0 || asking}
                onClick={() => setAsking(true)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white"
              >
                {W.CLEAR}
              </button>
            </div>

            {asking && (
              <div
                data-contacts-confirm
                className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <p className="text-gray-800">{clearAsk(n)}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={clear}
                    className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-dark"
                  >
                    {W.CLEAR_YES}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsking(false)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 hover:bg-gray-50"
                  >
                    {W.CLEAR_KEEP}
                  </button>
                </div>
              </div>
            )}

            {n === 0 ? (
              !refused && (
                <p data-contacts-state="empty" className="mt-6 text-gray-600">
                  {W.EMPTY}
                </p>
              )
            ) : (
              <ul
                data-contacts-list
                className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white"
              >
                {contacts.map((c) => (
                  <li
                    key={c.id}
                    data-contact-id={c.id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 break-words">{c.name}</p>
                      {c.email && <p className="text-sm text-gray-600 break-words">{c.email}</p>}
                      {c.phone && <p className="text-sm text-gray-600 break-words">{c.phone}</p>}
                    </div>
                    <button
                      type="button"
                      aria-label={removeLabel(c.name)}
                      onClick={() => remove(c.id)}
                      className="shrink-0 px-3 py-2 text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
                    >
                      {W.REMOVE}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
