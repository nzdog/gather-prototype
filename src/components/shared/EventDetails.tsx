'use client';

/**
 * [[GTC-368]] (item 17) — THE EVENT'S NAME, AND ITS DETAILS A TAP AWAY.
 *
 * The founder, at the walkthrough sort (GTC-189's Fourth ruling): *"A clickable event name that
 * brings up a pop up with the rest of the details"*. The words are W10 to W14 of GTC-367's plan
 * rulings and W16 to W19 of GTC-368's, verbatim: the name with a small "▾" (W10); the rows "When",
 * "Where", "Occasion", "About", each shown only when set (W11); the dates in NZ time (W12, W16 to
 * W18), with en-NZ's month names from a fixed list, so September is "Sept" as on Gather's other
 * screens (W19); "Close" (W13); "Change these details", to the old dashboard's Edit Event (W14).
 * The details only show (Q13); the occasion is Moment 2's answer (Q14, C3).
 *
 * A NATIVE POPOVER, AND NEVER A DEAD TAP (Q2). The name button opens the panel by `popovertarget`;
 * the browser closes it on Escape or a tap outside, and "Close" hides it. A browser with no popover
 * (Safari before 17, Firefox before 125, Chrome before 114: C1) ignores those attributes, so the
 * button's own tap opens the same card itself and adds the same ways to close it, removing them
 * again when it closes. No hook and no fetch: the board renders this as an island beside it, like
 * `PrintListDoor`, and its id comes from the event's id (C6).
 *
 * ⚠ THE PANEL IS `hidden`, AND SHOWN ONLY BY `:popover-open` OR `[data-open]`, as two separate
 * rules: a display class on a popover beats the browser's "hidden when closed", and a browser that
 * does not know `:popover-open` drops only that one rule. No `%` in the markup (the board bans it).
 */

import { Fragment, type ReactNode } from 'react';
import { backRoomHref } from '@/lib/events/home-href';

/** W11, W13 and W14, verbatim. */
export const DETAILS_WORDS = {
  WHEN: 'When',
  WHERE: 'Where',
  OCCASION: 'Occasion',
  ABOUT: 'About',
  CLOSE: 'Close',
  CHANGE: 'Change these details',
} as const;

/** W19 — en-NZ's names, as Gather's other screens print them ("Sept", not "Sep"). */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * The questions' own reading of an old answer (`LEGACY_EVENT_TYPE_MAP` in
 * src/lib/ai/config-loader.ts), copied rather than imported: that module carries the whole option
 * tree, which the board would otherwise ship to the browser. The suite holds the two equal.
 */
export const LEGACY_EVENT_TYPE_LABELS: Record<string, string> = {
  BBQ: 'Casual BBQ',
  'Kids party': 'Birthday (Kids)',
};
/** What the questions save for "Other" when nothing is typed: their placeholder, not her words. */
const OTHER_PLACEHOLDER = 'Custom event';

export interface EventDetailsFacts {
  id: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date;
  venueName?: string | null;
  venueTimingStart?: string | null;
  venueTimingEnd?: string | null;
  occasionDescription?: string | null;
  /** Moment 2's answer (`EventSetup.eventType`), and what she typed for "Other". */
  eventType?: string | null;
  eventTypeOther?: string | null;
}

type NzDay = { y: number; m: number; day: number; wd: number };

/** The NZ calendar day of an instant, read as numbers (the names come from the lists above). */
function nzDay(at: string | Date): NzDay | null {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = num('year');
  const m = num('month');
  const day = num('day');
  return { y, m, day, wd: new Date(Date.UTC(y, m - 1, day)).getUTCDay() };
}

const dayWords = (d: NzDay, withYear: boolean) =>
  `${WEEKDAYS[d.wd]} ${d.day} ${MONTHS[d.m - 1]}${withYear ? ` ${d.y}` : ''}`;
const order = (d: NzDay) => d.y * 10000 + d.m * 100 + d.day;
const set = (s: string | null | undefined) => (s ?? '').trim();

/**
 * W12 and W16 to W18 — the event's dates, in NZ time: "Sat 19 Dec 2026"; "Fri 18 Dec to Sun 20 Dec
 * 2026"; across two years each date carries its own year; times as she typed them, "…, 12:00 to
 * 16:00", "…, from 5:30pm", "…, until 11:00pm". An end before the start shows the start alone.
 */
export function whenLine(
  start: string | Date,
  end: string | Date,
  timeStart?: string | null,
  timeEnd?: string | null
): string {
  const a = nzDay(start);
  if (!a) return '';
  const b = nzDay(end);
  const dates =
    !b || order(b) <= order(a)
      ? dayWords(a, true)
      : a.y === b.y
        ? `${dayWords(a, false)} to ${dayWords(b, true)}`
        : `${dayWords(a, true)} to ${dayWords(b, true)}`;
  const t1 = set(timeStart);
  const t2 = set(timeEnd);
  const times = t1 && t2 ? `${t1} to ${t2}` : t1 ? `from ${t1}` : t2 ? `until ${t2}` : '';
  return times ? `${dates}, ${times}` : dates;
}

/** Moment 2's answer, as the details say it; null when there is none to say (Q6). */
export function occasionLabel(
  eventType: string | null | undefined,
  eventTypeOther: string | null | undefined
): string | null {
  const answer = set(eventType);
  if (!answer) return null;
  const label = LEGACY_EVENT_TYPE_LABELS[answer] ?? answer;
  if (label !== 'Other') return label;
  const typed = set(eventTypeOther);
  return typed && typed !== OTHER_PLACEHOLDER ? typed : null;
}

/** W11 — the rows, in order, each only when it is set. */
export function detailRows(f: EventDetailsFacts): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const when = whenLine(f.startDate, f.endDate, f.venueTimingStart, f.venueTimingEnd);
  if (when) rows.push({ label: DETAILS_WORDS.WHEN, value: when });
  if (set(f.venueName)) rows.push({ label: DETAILS_WORDS.WHERE, value: set(f.venueName) });
  const occasion = occasionLabel(f.eventType, f.eventTypeOther);
  if (occasion) rows.push({ label: DETAILS_WORDS.OCCASION, value: occasion });
  if (set(f.occasionDescription)) {
    rows.push({ label: DETAILS_WORDS.ABOUT, value: set(f.occasionDescription) });
  }
  return rows;
}

/** The panel's id: one per event, the same on the server and in the browser. */
export function detailsPanelId(eventId: string): string {
  return `event-details-${eventId}`;
}

// ── The fallback, for a browser with no popover ────────────────────────────────

const nativePopover = (el: HTMLElement) =>
  typeof (el as HTMLElement & { showPopover?: unknown }).showPopover === 'function';
/** The ways to close an open fallback card, so closing can take them away again. */
const closers = new Map<string, () => void>();

function closeFallback(id: string) {
  const panel = document.getElementById(id);
  if (!panel || nativePopover(panel)) return;
  panel.removeAttribute('data-open');
  closers.get(id)?.();
  closers.delete(id);
}

function toggleFallback(id: string) {
  const panel = document.getElementById(id);
  if (!panel || nativePopover(panel)) return;
  if (panel.hasAttribute('data-open')) {
    closeFallback(id);
    return;
  }
  panel.setAttribute('data-open', '');
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeFallback(id);
  };
  const onPointer = (e: PointerEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t && (panel.contains(t) || t.closest(`[data-details-for="${id}"]`))) return;
    closeFallback(id);
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer, true);
  closers.set(id, () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPointer, true);
  });
}

// ── The two pieces ─────────────────────────────────────────────────────────────

/**
 * W10 — the name, with "▾" after it. `children` replaces the name where the whole line is the
 * button (the board's top line, Q15).
 */
export function EventDetailsButton({
  facts,
  className = 'text-sm text-gray-500 hover:text-gray-900 text-right',
  children,
}: {
  facts: EventDetailsFacts;
  className?: string;
  children?: ReactNode;
}) {
  const id = detailsPanelId(facts.id);
  return (
    <button
      type="button"
      popoverTarget={id}
      aria-haspopup="dialog"
      data-event-details-button=""
      data-details-for={id}
      onClick={() => toggleFallback(id)}
      className={className}
    >
      {children ?? facts.name}{' '}
      <span aria-hidden="true" className="text-[0.75em]">
        ▾
      </span>
    </button>
  );
}

/**
 * The details. `onChangeDetails` is for a screen that must save before it goes (Moment 2's
 * questions, Q8); everywhere else W14 is a plain link, so Moment 1's "leave site?" still asks.
 */
export function EventDetailsPanel({
  facts,
  onChangeDetails,
}: {
  facts: EventDetailsFacts;
  onChangeDetails?: (href: string) => void;
}) {
  const id = detailsPanelId(facts.id);
  const href = backRoomHref(facts.id);
  return (
    <div
      id={id}
      popover="auto"
      role="dialog"
      aria-label={facts.name}
      data-event-details=""
      className="hidden [&:popover-open]:block data-[open]:block fixed inset-x-4 top-20 bottom-auto z-[60] mx-auto my-0 w-auto max-w-[400px] rounded-xl border border-gray-200 bg-white p-5 text-left text-gray-900 shadow-lg backdrop:bg-gray-900/25"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 text-lg font-semibold">{facts.name}</p>
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          data-details-for={id}
          onClick={() => closeFallback(id)}
          className="shrink-0 text-sm text-gray-500 underline underline-offset-2 hover:text-gray-900"
        >
          {DETAILS_WORDS.CLOSE}
        </button>
      </div>
      <dl className="mt-3.5 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[15px]">
        {detailRows(facts).map((row) => (
          <Fragment key={row.label}>
            <dt className="text-gray-500">{row.label}</dt>
            <dd className="m-0">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
      <a
        href={href}
        onClick={
          onChangeDetails
            ? (e) => {
                e.preventDefault();
                onChangeDetails(href);
              }
            : undefined
        }
        className="mt-4 inline-block text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900"
      >
        {DETAILS_WORDS.CHANGE}
      </a>
    </div>
  );
}

/** The name and its details together: every screen but the board, which places them apart. */
export default function EventDetails({
  facts,
  className,
  onChangeDetails,
}: {
  facts: EventDetailsFacts;
  className?: string;
  onChangeDetails?: (href: string) => void;
}) {
  return (
    <>
      <EventDetailsButton facts={facts} className={className} />
      <EventDetailsPanel facts={facts} onChangeDetails={onChangeDetails} />
    </>
  );
}
