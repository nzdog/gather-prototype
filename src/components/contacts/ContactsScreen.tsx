'use client';

/**
 * [[GTC-460]] Stage 3, steps 3a and 3b — THE CONTACTS SCREEN: what /plan/contacts shows.
 *
 * The title, one line saying where her contacts live (A5), the loading area (3b: a paste box, a file
 * choice, the phone's picker where there is one, and a laptop help note), a count that is always on
 * screen, a Clear button that is always drawn and asks first, and the list with a Remove button on
 * each person, and the three ways forward on a person the reader flagged. Plain lines for the empty
 * list, for nobody signed in, and for a browser that will not keep them. Every sentence is a ruled
 * W-line, in `@/lib/contacts/words`.
 *
 * WHERE THE LIST COMES FROM. Only this browser's storage, through `@/lib/contacts/store`, under the
 * signed-in person's id (read from `ViewerIdContext`, as the household form's drafts are). Loading
 * calls GTC-448's readers (through `@/lib/contacts/load`) in this browser. This file makes no request
 * and holds nothing on a server. It reads storage only AFTER it has mounted, so the page the server
 * draws and the page the browser draws first are the same: a loading state with no words in it. The
 * phone's picker is looked for only after it has mounted, for the same reason.
 *
 * KB-001. A page opened straight after sign-in can still be drawn with nobody signed in. As
 * `plan/events/page.tsx` does, this asks the router to refresh when the id is missing, once it has
 * mounted, so the layout is drawn again with the session.
 */
import { useContext, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ViewerIdContext } from '@/components/shared/Providers';
import {
  browserContactsStore,
  browserTabStore,
  clearContacts,
  contactsKey,
  readContacts,
  removeContact,
  updateContact,
  type Contact,
} from '@/lib/contacts/store';
import { CONTACTS_WORDS as W, clearAsk, countWords } from '@/lib/contacts/words';
import { backHref, readAddress, type ContactsAddress } from '@/lib/contacts/address';
import {
  MAX_PASTE_CHARS,
  checkPaste,
  differentWay,
  doubleCheck,
  loadPeople,
  readText,
  refusalWords,
  routeFile,
  skipIt,
  summaryLines,
} from '@/lib/contacts/load';
import type { ReadResult } from '@/lib/contact-import/types';
import { pickPeople, pickerAvailable, type PickerEnv } from '@/lib/contacts/picker';
import { writeHandoff, type HandoffForm } from '@/lib/contacts/handoff';
import { renderLoadBox } from '@/components/contacts/LoadBox';
import { renderRow, type PanelField, type RowPanel } from '@/components/contacts/ContactRow';

const NO_ADDRESS: ContactsAddress = { eventId: null, form: null, editId: null };

export default function ContactsScreen() {
  const viewerId = useContext(ViewerIdContext);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [address, setAddress] = useState<ContactsAddress>(NO_ADDRESS);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [refused, setRefused] = useState(false);
  const [asking, setAsking] = useState(false);
  // W42 (ruling 172): the last Remove, Clear or fix did not save. W16 (`refused`) is for loading only.
  const [saveFailed, setSaveFailed] = useState(false);
  // 3b: the loading area.
  const [pasteText, setPasteText] = useState('');
  const [summary, setSummary] = useState<string[]>([]);
  const [canPick, setCanPick] = useState(false);
  const [picking, setPicking] = useState(false);
  const [panel, setPanel] = useState<RowPanel | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pickingRef = useRef(false);
  const latestViewer = useRef<string | null>(viewerId);
  latestViewer.current = viewerId;

  // Mounted: only now is the browser's address and storage looked at.
  useEffect(() => {
    setAddress(readAddress(window.location.search));
    setMounted(true);
  }, []);

  // The phone's picker: looked for only now, and only drawn if it is there.
  useEffect(() => {
    if (mounted) setCanPick(pickerAvailable(window));
  }, [mounted]);

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
    setSummary([]);
    setPanel(null);
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
      setPanel(null);
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
    setPanel(null);
    setAsking(false);
  };

  // ── 3b: loading ──────────────────────────────────────────────────────────────────────────────
  /** The people a reader found, added to her list. True when the write went through. */
  const finish = (read: ReadResult): boolean => {
    const { written, summary: counted } = loadPeople(browserContactsStore(), viewerId, read);
    if (written.status === 'ok') {
      setContacts(written.contacts);
      setSummary(summaryLines(counted));
      setSaveFailed(false);
      return true;
    }
    if (written.status === 'full') {
      setSummary([W.FULL]); // W17: nothing was added
    } else {
      setSummary([]);
      setRefused(true); // W16: the browser will not keep a list
    }
    return false;
  };

  const addPaste = () => {
    setSummary([]);
    const refusal = checkPaste(pasteText);
    if (refusal) {
      setSummary([refusalWords(refusal)]);
      return;
    }
    const read = readText('paste', pasteText);
    if (finish(read) && read.people.length > 0) setPasteText('');
  };

  const onPasteText = (value: string) => {
    // Keep one character past the limit, so a list that is too long is still seen to be too long.
    setPasteText(value.length > MAX_PASTE_CHARS + 1 ? value.slice(0, MAX_PASTE_CHARS + 1) : value);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so the same file can be chosen again
    if (!file) return;
    setSummary([]);
    const routed = routeFile(file);
    if ('refusal' in routed) {
      setSummary([refusalWords(routed.refusal)]);
      return;
    }
    if (typeof file.text !== 'function') {
      setSummary([refusalWords('unreadable')]);
      return;
    }
    const who = viewerId;
    file.text().then(
      (text) => {
        if (latestViewer.current === who) finish(readText(routed.kind, text));
      },
      () => setSummary([refusalWords('unreadable')])
    );
  };

  const pick = () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    setSummary([]);
    const who = viewerId;
    // The ask is made here, in the tap's own turn, before anything is waited for.
    pickPeople(window as unknown as PickerEnv).then((end) => {
      pickingRef.current = false;
      setPicking(false);
      if (latestViewer.current !== who) return;
      if (end.kind === 'picked') finish(end.read);
      else if (end.kind === 'failed') setSummary([W.PICKER_FAILED]); // W24; a cancel says nothing
    });
  };

  // ── 3b: the ways forward on a flagged row ─────────────────────────────────────────────────────
  /** Saves a fixed person. True when it was saved; if not, W42 and the row stays as it was. */
  const save = (next: Contact): boolean => {
    const done = updateContact(browserContactsStore(), viewerId, next);
    const failed = done.status !== 'ok';
    setSaveFailed(failed);
    if (!failed) setContacts(done.contacts);
    return !failed;
  };

  const open = (c: Contact, kind: 'check' | 'other') => {
    if (panel && panel.id === c.id && panel.kind === kind) {
      setPanel(null);
      return;
    }
    setPanel({
      id: c.id,
      kind,
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      other: '',
    });
  };

  const typeInPanel = (field: PanelField, value: string) => {
    if (panel) setPanel({ ...panel, [field]: value });
  };

  const donePanel = () => {
    if (!panel) return;
    const c = contacts.find((x) => x.id === panel.id);
    if (!c) {
      setPanel(null);
      return;
    }
    const next = panel.kind === 'check' ? doubleCheck(c, panel) : differentWay(c, panel.other);
    if (next && save(next)) setPanel(null);
  };

  const back = mounted ? backHref(address) : null;

  /**
   * W19: "Add to this household". Leaves ONE note in this tab (no name, email or number), then goes back
   * to the form she left, in the same tab. If the tab will not keep the note she still goes back, with
   * her draft kept; the form simply has nothing to add.
   */
  const addToHousehold = (c: Contact) => {
    if (!viewerId || !address.eventId || !back) return;
    const form: HandoffForm = address.editId
      ? `edit:${address.editId}`
      : address.form === 'host'
        ? 'host'
        : 'new';
    writeHandoff(browserTabStore(), {
      userId: viewerId,
      eventId: address.eventId,
      form,
      contactId: c.id,
      now: Date.now(),
    });
    window.location.assign(back);
  };
  const n = contacts.length;
  const openPanel = panel && contacts.some((c) => c.id === panel.id) ? panel : null;
  const liveFor = (c: Contact): string[] =>
    openPanel && openPanel.id === c.id && openPanel.kind === 'check'
      ? (doubleCheck(c, openPanel)?.problems ?? [])
      : [];

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

            {renderLoadBox({
              disabled: refused,
              pasteText,
              onPasteText,
              onAddPaste: addPaste,
              fileRef,
              onFile,
              canPick,
              picking,
              onPick: pick,
              summary,
            })}

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
                {contacts.map((c) =>
                  renderRow({
                    contact: c,
                    panel: openPanel && openPanel.id === c.id ? openPanel : null,
                    live: liveFor(c),
                    doneOff: openPanel?.kind === 'check' && openPanel.name.trim() === '',
                    onRemove: () => remove(c.id),
                    onAdd: back ? () => addToHousehold(c) : undefined,
                    onOpen: (kind) => open(c, kind),
                    onSkip: () => save(skipIt(c)),
                    onType: typeInPanel,
                    onDone: donePanel,
                  })
                )}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
