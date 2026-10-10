'use client';

/**
 * [[GTC-355]] — Moment 3, "Who's on what?", Phase 1: assigning items directly to people.
 *
 * The design is the founder's Moment 3 Flow Document (docs/moment-3-flow-document.md),
 * Phase 1, with the rulings in docs/tickets/GTC-355.md. Kate is DECIDING: she taps an item
 * then a person, or a person then an item, and the name appears. The visual change is the
 * confirmation — no toast on success, no dialog. Each change is saved at once, through the
 * routes that already exist:
 *
 *   - `POST` / `DELETE /api/events/[id]/items/[itemId]/assign` — one Assignment per item
 *     (Ruling 2), the same row the pre-flight and the press read;
 *   - `PATCH /api/events/[id]/people/[personId]` — the "Just attending" mark, alone;
 *   - `POST /api/events/[id]/check` — the old dashboard's conflict recheck, under its guard.
 *
 * Every change goes through `askForReason`. Before the send it resolves at once and shows
 * nothing (`whyTrigger` answers null); after it, the route's T1 asks the why (GTC-196).
 *
 * NOT HERE, ON PURPOSE: the team builder and its link (Phase 2), several people on one item
 * (Ruling 2), and any dietary flag on a person — Gather records no person's diet.
 *
 * [[GTC-365]] (the walkthrough's batch 3, PLAN RULINGS 2026-10-06): one tap accepts the suggestions
 * on screen, asking why at most once (`askForBatchReason`); marking someone "Just attending" takes
 * their suggestions away; a given item is the soft blue; a picked person stays picked until Done,
 * a second tap or Escape, with the foot of the screen saying who; with a person picked a tap gives,
 * moves or takes back; and every tap counts — each item saves on its own, shown at once, dimmed
 * until it is saved (the rules in src/lib/moment3/assigning.ts).
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import MomentArc, { type ArcDoor } from './MomentArc';
import MomentWords from './MomentWords';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';
import type { PendingChange } from '@/lib/ledger';
import type { SerialisedEvent } from '@/lib/lifecycle';
import type { ReasonAnswer } from './ReasonPrompt';
import { useToast } from '@/contexts/ToastContext';
import {
  M3_WORDS,
  acceptAllFailed,
  acceptAllLabel,
  giveLabel,
  giveToLine,
  removeLabel,
} from '@/lib/moment3/words';
import {
  assignedCounterLine,
  buildPeoplePanel,
  unplacedCount,
  unplacedLine,
  type PanelHouseholdInput,
  type PanelItemInput,
} from '@/lib/moment3/people';
import { suggestAssignments, type Suggestion } from '@/lib/moment3/suggest';
import { completionPanel } from '@/lib/moment3/completion';
import {
  GIVEN_ROW,
  dropSuggestionsFor,
  itemTap,
  selectionAfterGive,
  suggestionsOnScreen,
  type Selection,
} from '@/lib/moment3/assigning';
import type { HoldNotice } from '@/lib/moment3/hold';

export interface Moment3Item {
  id: string;
  name: string;
  /** 'ITEM' (something to bring) or 'TASK' (a job). */
  kind: string;
  /** Quantity and unit, or '' for a job. */
  detail: string;
}

export interface Moment3Category {
  id: string;
  name: string;
  emoji: string;
  items: Moment3Item[];
}

export interface Moment3Holder {
  personId: string;
  name: string;
}

interface Moment3AssignViewProps {
  eventId: string;
  event: SerialisedEvent & { lastCheckPlanAt?: string | null };
  hostPersonId: string;
  /** The Moment 1 headcount, kids without jobs included (ruling Q10). */
  headcount: number;
  categories: Moment3Category[];
  initialHolders: Record<string, Moment3Holder | null>;
  households: PanelHouseholdInput[];
  askForReason: (change: PendingChange, event: SerialisedEvent) => Promise<ReasonAnswer>;
  /** [[GTC-365]] — asks once for a batch (Accept all): one why, riding every save. */
  askForBatchReason: (changes: PendingChange[], event: SerialisedEvent) => Promise<ReasonAnswer>;
  onBack: () => void;
  onMoveOn: () => void;
  /** [[GTC-360]] — the plan is being held ("Move on →" reads W1 and waits). */
  holding?: boolean;
  /** [[GTC-360]] — what keeps her in Moment 3, said in the completion panel. */
  holdNotice?: HoldNotice | null;
  /** [[GTC-367]] (item 2): the Moments strip's doors (`stripDoors`, src/lib/moments/strip.ts). */
  stripDoors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
  /** [[GTC-368]] (item 17): the event's name and its details (W10, a row of its own, Q1). */
  details?: EventDetailsFacts;
}

const RECHECK_DEBOUNCE_MS = 1000;

/** A copy of `map` without `key`. */
function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

/** Arrow keys move focus within one panel; Enter selects; Escape deselects. */
function panelKeys(e: KeyboardEvent<HTMLDivElement>, onEscape: () => void) {
  if (e.key === 'Escape') {
    onEscape();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-m3-row]'));
  const at = rows.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
  rows[next]?.focus();
  e.preventDefault();
}

function onEnter(e: KeyboardEvent<HTMLElement>, act: () => void) {
  if (e.key === 'Enter') {
    e.preventDefault();
    act();
  }
}

export default function Moment3AssignView({
  eventId,
  event,
  hostPersonId,
  headcount,
  categories,
  initialHolders,
  households,
  askForReason,
  askForBatchReason,
  onBack,
  onMoveOn,
  holding = false,
  holdNotice = null,
  stripDoors,
  details,
}: Moment3AssignViewProps) {
  const toast = useToast();
  const [holders, setHolders] = useState<Record<string, Moment3Holder | null>>(initialHolders);
  const [marks, setMarks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      households.flatMap((h) => h.members.map((m) => [m.personId, m.justAttending === true]))
    )
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [ghosts, setGhosts] = useState<Suggestion[]>([]);
  const [completionOpen, setCompletionOpen] = useState(false);
  /**
   * [[GTC-365]] Q11 — items saving now, and who each is becoming (null: being taken back). Each item
   * saves on its own, so a tap made while another saves is never lost; the row shows it at once.
   */
  const [pending, setPending] = useState<Record<string, string | null>>({});
  const [accepting, setAccepting] = useState(false);
  /** A why is being asked; nothing else asks until it is answered. */
  const asking = useRef(false);
  const planRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<HTMLDivElement>(null);
  const recheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (recheckTimer.current) clearTimeout(recheckTimer.current);
    },
    []
  );

  // [[GTC-365]] Q8 — Escape unpicks a picked person wherever the focus is.
  useEffect(() => {
    if (selection?.kind !== 'person') return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);
  const panelItems: PanelItemInput[] = useMemo(
    () =>
      allItems.map((i) => ({
        id: i.id,
        kind: i.kind,
        assignment: holders[i.id] ? { person: { id: holders[i.id]!.personId } } : null,
      })),
    [allItems, holders]
  );
  const rows = useMemo(
    () =>
      buildPeoplePanel(
        households.map((h) => ({
          ...h,
          members: h.members.map((m) => ({ ...m, justAttending: marks[m.personId] === true })),
        })),
        panelItems,
        hostPersonId
      ),
    [households, marks, panelItems, hostPersonId]
  );
  const nameOf = (personId: string) => rows.find((r) => r.personId === personId)?.name ?? '';
  const proposals = useMemo(
    () =>
      suggestAssignments(
        allItems.map((i) => ({
          id: i.id,
          kind: i.kind,
          assigneePersonId: holders[i.id]?.personId ?? null,
        })),
        rows
      ),
    [allItems, holders, rows]
  );
  const unassigned = panelItems.filter((i) => i.assignment === null).length;
  const panel = completionPanel({
    unassignedItems: unassigned,
    unplacedPeople: unplacedCount(rows),
    headcount,
    itemCount: allItems.length,
  });

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

  /** The old dashboard's auto-recheck, under its guard: only once a check has been run. */
  const scheduleRecheck = () => {
    if (!event.lastCheckPlanAt) return;
    if (recheckTimer.current) clearTimeout(recheckTimer.current);
    recheckTimer.current = setTimeout(() => {
      fetch(`/api/events/${eventId}/check`, { method: 'POST' }).catch(() => {});
    }, RECHECK_DEBOUNCE_MS);
  };

  /**
   * One save through the existing route: give or move (POST), or take back (DELETE). `quiet` leaves
   * the telling to Accept all, which says once how many did not save.
   */
  const save = async (
    itemId: string,
    personId: string | null,
    reason: string | null,
    quiet = false
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/events/${eventId}/items/${itemId}/assign`, {
        method: personId ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personId ? { personId, reason } : { reason }),
      });
      if (!res.ok) {
        if (!quiet) toast.error(M3_WORDS.SAVE_FAILED);
        return false;
      }
      setHolders((prev) => ({
        ...prev,
        [itemId]: personId ? { personId, name: nameOf(personId) } : null,
      }));
      if (personId) setGhosts((prev) => prev.filter((g) => g.itemId !== itemId));
      scheduleRecheck();
      return true;
    } catch {
      if (!quiet) toast.error(M3_WORDS.SAVE_FAILED);
      return false;
    }
  };

  /** One change, shown at once (dimmed) and saved; after the send its why is asked first. */
  const change = async (
    itemId: string,
    personId: string | null,
    action: 'CREATE_ASSIGNMENT' | 'MOVE_ASSIGNMENT' | 'DELETE_ASSIGNMENT'
  ) => {
    if (itemId in pending || asking.current) return;
    setPending((prev) => ({ ...prev, [itemId]: personId }));
    asking.current = true;
    const answer = await askForReason(
      { action, targetType: 'Assignment', targetId: itemId },
      event
    );
    asking.current = false;
    if (answer.proceed) await save(itemId, personId, answer.reason);
    setPending((prev) => without(prev, itemId));
  };

  /**
   * [[GTC-365]] item 4 — one tap accepts exactly the suggestions on screen (Q6, Q7). One why for the
   * batch after the send (`askForBatchReason`), riding every save; they save one by one in the
   * plan's order, a failure doesn't stop the rest, and what failed stays on screen with ✓ and ×.
   */
  const acceptAll = async () => {
    const batch = onScreen;
    if (batch.length === 0 || accepting || asking.current) return;
    asking.current = true;
    const answer = await askForBatchReason(
      batch.map(
        (g): PendingChange => ({
          action: 'CREATE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: g.itemId,
        })
      ),
      event
    );
    asking.current = false;
    if (!answer.proceed) return;
    setAccepting(true);
    setPending((prev) => ({
      ...prev,
      ...Object.fromEntries(batch.map((g) => [g.itemId, g.personId])),
    }));
    let notSaved = 0;
    for (const g of batch) {
      if (!(await save(g.itemId, g.personId, answer.reason, true))) notSaved++;
      setPending((prev) => without(prev, g.itemId));
    }
    setAccepting(false);
    if (notSaved > 0) toast.error(acceptAllFailed(notSaved, batch.length));
  };

  /** The mark is a planning note that touches nobody, so it asks no why. */
  const mark = async (personId: string, justAttending: boolean) => {
    // [[GTC-365]] — the founder's change to Q7: their suggestions leave the screen at once.
    if (justAttending) setGhosts((prev) => dropSuggestionsFor(prev, personId));
    try {
      const res = await fetch(`/api/events/${eventId}/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justAttending }),
      });
      if (!res.ok) {
        toast.error(M3_WORDS.SAVE_FAILED);
        return;
      }
      setMarks((prev) => ({ ...prev, [personId]: justAttending }));
    } catch {
      toast.error(M3_WORDS.SAVE_FAILED);
    }
  };

  const tapItem = (itemId: string) => {
    // Q11: an item already saving shows what it is becoming; a second tap waits for it.
    if (itemId in pending) return;
    const holderId = holders[itemId]?.personId ?? null;
    const tap = itemTap(selection, itemId, holderId);
    if (tap.act === 'give') return void change(itemId, tap.personId, 'CREATE_ASSIGNMENT');
    if (tap.act === 'move') return void change(itemId, tap.personId, 'MOVE_ASSIGNMENT');
    if (tap.act === 'take-back') return void change(itemId, null, 'DELETE_ASSIGNMENT');
    if (tap.act === 'unpick') return setSelection(null);
    setSelection({ kind: 'item', id: itemId });
    if (!holderId && isMobile()) {
      peopleRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const tapPerson = (personId: string) => {
    if (selection?.kind === 'item' && !holders[selection.id] && !(selection.id in pending)) {
      const itemId = selection.id;
      setSelection(selectionAfterGive(selection));
      void change(itemId, personId, 'CREATE_ASSIGNMENT');
      return;
    }
    if (selection?.kind === 'person' && selection.id === personId) {
      setSelection(null);
      return;
    }
    setSelection({ kind: 'person', id: personId });
    if (isMobile()) planRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const selectedItemOpen = selection?.kind === 'item' && !holders[selection.id];
  const personSelected = selection?.kind === 'person';
  const onScreen = suggestionsOnScreen(ghosts, holders).filter((g) => !(g.itemId in pending));

  /** [[GTC-365]] W7 and W8 — who is picked, said at the foot while the people may be out of view. */
  const pickedRow =
    selection?.kind === 'person' ? (
      <div
        data-m3="picked"
        className="max-w-5xl mx-auto mb-3 flex items-center justify-between gap-3"
      >
        <p className="text-sm text-gray-800">{giveToLine(nameOf(selection.id))}</p>
        <button
          type="button"
          onClick={() => setSelection(null)}
          className="shrink-0 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          {M3_WORDS.DONE}
        </button>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-6 pb-40">
        {/* [[GTC-368]] (item 17, Q1): the menu bar shows here, so the name has a row of its own. */}
        {details && (
          <div className="mb-3 flex justify-end">
            <EventDetails facts={details} />
          </div>
        )}
        <div className="mb-6">
          <MomentArc
            currentMoment={3}
            completedMoments={[1, 2]}
            doors={stripDoors}
            disabled={holding}
          />
        </div>

        {/* [[GTC-368]] (item 5, Q10's A): where Moment 3 starts. [[GTC-378]] (item 45, ruling 6):
            "When it’s done" moved here from the panel after "All sorted →", directly under it, and
            always shown (GTC-368's Q9 condition lifted). */}
        <MomentWords moment={3} part="does" className="mb-3" />
        <MomentWords moment={3} part="done" className="mb-3" />
        <h1 className="text-xl font-semibold text-gray-900 mb-6">{M3_WORDS.SENTENCE}</h1>

        {allItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-700">
            <p className="mb-2">{M3_WORDS.NO_PLAN_ITEMS}</p>
            <button
              type="button"
              onClick={onBack}
              className="underline underline-offset-2 text-gray-600 hover:text-gray-900"
            >
              {M3_WORDS.BACK_TO_PLAN}
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:gap-8">
            {/* The plan */}
            <div
              ref={planRef}
              className="flex-1 min-w-0 mb-8 md:mb-0"
              onKeyDown={(e) => panelKeys(e, () => setSelection(null))}
            >
              <p className="text-sm text-gray-600">{assignedCounterLine(panelItems)}</p>
              {accepting || onScreen.length > 0 ? (
                /* [[GTC-365]] W4 and W5 — where "Want me to suggest?" was. */
                <button
                  type="button"
                  onClick={() => void acceptAll()}
                  disabled={accepting}
                  className="mt-1 px-3 py-1.5 text-sm text-gray-800 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait"
                >
                  {accepting ? M3_WORDS.ACCEPTING : acceptAllLabel(onScreen.length)}
                </button>
              ) : (
                proposals.length > 0 &&
                ghosts.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setGhosts(proposals)}
                    className="mt-1 text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
                  >
                    {M3_WORDS.WANT_ME_TO_SUGGEST}
                  </button>
                )
              )}
              <div className="mt-4 space-y-6">
                {categories.map((category) => (
                  <section key={category.id}>
                    <h2 className="text-sm font-semibold text-gray-900 mb-2">
                      <span aria-hidden="true">{category.emoji}</span> {category.name}
                    </h2>
                    <ul className="space-y-1.5">
                      {category.items.map((item) => {
                        const holder = holders[item.id];
                        // Q11: while it saves, the row shows what it is becoming, dimmed.
                        const isPending = item.id in pending;
                        const becoming = pending[item.id];
                        const shown = isPending
                          ? becoming
                            ? { personId: becoming, name: nameOf(becoming) }
                            : null
                          : holder;
                        const ghost = shown ? undefined : ghosts.find((g) => g.itemId === item.id);
                        const selected = selection?.kind === 'item' && selection.id === item.id;
                        const target = personSelected && !shown;
                        return (
                          <li
                            key={item.id}
                            aria-busy={isPending || undefined}
                            // Q12, A: a given item is the soft blue (GIVEN_ROW), never the board's green.
                            style={
                              shown
                                ? {
                                    backgroundColor: GIVEN_ROW.background,
                                    borderColor: GIVEN_ROW.border,
                                    color: GIVEN_ROW.text,
                                  }
                                : undefined
                            }
                            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                              shown
                                ? 'border'
                                : 'bg-white border border-dotted border-gray-300 text-gray-500'
                            } ${isPending ? 'opacity-60' : ''} ${selected || target ? 'ring-2 ring-accent' : ''}`}
                          >
                            <button
                              type="button"
                              data-m3-row
                              onClick={() => tapItem(item.id)}
                              onKeyDown={(e) => onEnter(e, () => tapItem(item.id))}
                              aria-pressed={selected}
                              className="flex-1 min-w-0 flex items-baseline justify-between gap-3 text-left"
                            >
                              <span className="truncate">
                                <span>{item.name}</span>
                                {item.detail && (
                                  <span className="ml-2 text-gray-400">{item.detail}</span>
                                )}
                              </span>
                              <span
                                className={
                                  shown
                                    ? 'font-medium shrink-0'
                                    : ghost
                                      ? 'text-gray-400 italic shrink-0'
                                      : 'text-gray-400 shrink-0'
                                }
                              >
                                {shown
                                  ? shown.name
                                  : ghost
                                    ? nameOf(ghost.personId)
                                    : M3_WORDS.UNASSIGNED}
                              </span>
                            </button>
                            {holder && selected && !isPending && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelection(null);
                                  void change(item.id, null, 'DELETE_ASSIGNMENT');
                                }}
                                aria-label={removeLabel(holder.name)}
                                className="shrink-0 px-1.5 text-gray-500 hover:text-gray-900"
                              >
                                ×
                              </button>
                            )}
                            {ghost && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void change(item.id, ghost.personId, 'CREATE_ASSIGNMENT')
                                  }
                                  aria-label={giveLabel(item.name, nameOf(ghost.personId))}
                                  className="shrink-0 px-1.5 text-green-700 hover:text-green-900"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGhosts((prev) => prev.filter((g) => g.itemId !== item.id))
                                  }
                                  aria-label={M3_WORDS.DISMISS_LABEL}
                                  className="shrink-0 px-1.5 text-gray-500 hover:text-gray-900"
                                >
                                  ×
                                </button>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>

            {/* The people */}
            <div
              ref={peopleRef}
              className="md:w-80 md:flex-shrink-0"
              onKeyDown={(e) => panelKeys(e, () => setSelection(null))}
            >
              <p data-m3="people-head" className="text-sm text-gray-600 mb-4">
                {unplacedLine(rows)}
              </p>
              <ul className="space-y-1.5">
                {rows.map((person) => {
                  const selected = selection?.kind === 'person' && selection.id === person.personId;
                  return (
                    <li
                      key={person.personId}
                      className={`flex items-center gap-2 rounded-md bg-white border border-gray-200 px-3 py-2 text-sm ${
                        selected || selectedItemOpen ? 'ring-2 ring-accent' : ''
                      }`}
                    >
                      <button
                        type="button"
                        data-m3-row
                        onClick={() => tapPerson(person.personId)}
                        onKeyDown={(e) => onEnter(e, () => tapPerson(person.personId))}
                        aria-pressed={selected}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left"
                      >
                        <span aria-hidden="true">{person.icon}</span>
                        <span
                          className={`truncate ${person.nothingYet ? 'text-gray-400' : 'text-gray-900'}`}
                        >
                          {person.name}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-gray-500 tabular-nums">
                          {person.count}
                        </span>
                      </button>
                      {person.count === 0 && !person.justAttending && (
                        <button
                          type="button"
                          onClick={() => void mark(person.personId, true)}
                          className="shrink-0 text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
                        >
                          {M3_WORDS.JUST_ATTENDING}
                        </button>
                      )}
                      {person.count === 0 && person.justAttending && (
                        <span className="shrink-0 flex items-center gap-1 text-xs text-gray-500">
                          {M3_WORDS.JUST_ATTENDING}
                          <button
                            type="button"
                            onClick={() => void mark(person.personId, false)}
                            aria-label={M3_WORDS.NOT_JUST_ATTENDING_LABEL}
                            className="px-1 text-gray-500 hover:text-gray-900"
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* The footer: "All sorted →" is always there, with no minimum (the document). */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        {pickedRow}
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
          >
            {M3_WORDS.BACK_TO_PLAN}
          </button>
          <button
            type="button"
            data-m3="all-sorted"
            onClick={() => setCompletionOpen(true)}
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors"
          >
            {M3_WORDS.ALL_SORTED}
          </button>
        </div>
      </div>

      {/* The completion panel: inline above the footer, not a modal. */}
      {completionOpen && (
        <div className="fixed bottom-24 left-0 right-0 px-4">
          <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-lg shadow-lg p-5">
            {panel.lines.map((line) => (
              <p key={line} className="text-sm text-gray-800 mb-2">
                {line}
              </p>
            ))}
            {/* [[GTC-360]] — what keeps her here: a block, a co-host, a failure (W2 to W6). */}
            {holdNotice && (
              <div data-m3="hold-notice" role="alert" className="mt-2 text-sm text-red-700">
                <p>{holdNotice.text}</p>
                {holdNotice.link && (
                  <a
                    href={holdNotice.link.href}
                    className="mt-1 inline-block font-medium underline underline-offset-2"
                  >
                    {holdNotice.link.label}
                  </a>
                )}
              </div>
            )}
            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCompletionOpen(false)}
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
              >
                {panel.keepGoing}
              </button>
              <button
                type="button"
                onClick={onMoveOn}
                disabled={holding}
                className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark disabled:opacity-60 disabled:cursor-wait"
              >
                {holding ? M3_WORDS.HOLDING : panel.moveOn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
