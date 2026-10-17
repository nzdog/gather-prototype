'use client';

/**
 * [[GTC-373]] (item 13) — "Find someone or something", the board's search of the event.
 *
 * Ruled 2026-10-08 (W13 to W24, Q11 to Q21 as proposed). An ISLAND BESIDE THE BOARD'S OWN MARKUP,
 * as the print door is, so `GlanceBoard` keeps phase 2's property: no hooks, no fetch. Closed on every
 * visit, with the other closed buttons (Ruling 1: nothing here makes her lean in unless she asks).
 *
 * IT ONLY FINDS. Its one request is the print door's read, `GET /api/events/[id]/items`, made on each
 * opening and narrowed at once (`narrowItems`, Q13). One of the glance sources Ruling 1's fence scans
 * (`tests/glance-read-test.ts`, Q22).
 *
 * [[GTC-380]] (item 50, PLAN RULINGS 2026-10-11) — FROM A RESULT, GO TO THE PERSON OR THE ITEM.
 * A person's name, and a holder's name in an item row, opens that person's panel when their strip
 * has one, exactly as a tap on the row opens it (Q7, replacing GTC-373 Q19): the strip is brought to
 * the middle, focused and pressed. The element on the page decides, never `panelFor`: the live poll
 * never turns a sealed strip into a door, so a strip it turned red after loading still rings, as a
 * tap on its row opens nothing. Every item name is a real link to Moment 3 at that item, in the same
 * tab (Q9, ruling 2), in item rows and inside a person's row; the line reads as it did. Following
 * it writes nothing.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { itemDoorHref } from '@/lib/events/home-href';
import {
  EVENT_SHOWN,
  EVENT_WORDS,
  findInEvent,
  narrowItems,
  type AnswerPart,
  type EventHit,
  type SearchItem,
  type SearchPerson,
} from '@/lib/search/event-search';

interface EventSearchProps {
  eventId: string;
  /** Everyone on the board, in its order, from the board's own payload. */
  people: SearchPerson[];
  /** [[GTC-374]] — an invites-only event: W15, W16, W17 and W18 in place of W13, W14, W19 and W24. */
  invitesOnly?: boolean;
}

/**
 * [[GTC-380]] (Q7) — the person's strip, brought to the middle of the screen. A strip that is a
 * door (a `<button>`) is focused and pressed, so its panel opens as a tap on the row opens it and
 * the keyboard lands where a row tap leaves it; any other strip is ringed for two seconds (Q19).
 */
function goToStrip(personEventId: string) {
  const strip = document.querySelector<HTMLElement>(
    `[data-person-event-id="${CSS.escape(personEventId)}"]`
  );
  if (!strip) return;
  strip.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (strip instanceof HTMLButtonElement) {
    strip.focus({ preventScroll: true });
    strip.click();
    return;
  }
  strip.style.outline = '2px solid #2c2c2a';
  strip.style.outlineOffset = '2px';
  window.setTimeout(() => {
    strip.style.outline = '';
    strip.style.outlineOffset = '';
  }, 2000);
}

const NAME_BUTTON =
  'cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] text-[#2c2c2a] underline underline-offset-2';
const ITEM_LINK = 'text-[#2c2c2a] underline underline-offset-2';

export default function EventSearch({ eventId, people, invitesOnly = false }: EventSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[] | 'loading' | 'failed'>('loading');
  const box = useRef<HTMLInputElement>(null);
  const id = useId();

  // Q12 — the box takes the focus when it opens.
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const toggle = () => {
    if (open) return close();
    setOpen(true);
    setItems('loading');
    fetch(`/api/events/${eventId}/items`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => setItems(narrowItems(Array.isArray(data?.items) ? data.items : [])))
      .catch(() => setItems('failed'));
  };

  const found: EventHit[] = Array.isArray(items)
    ? findInEvent(people, items, query, { invitesOnly })
    : [];
  const shown = found.slice(0, EVENT_SHOWN);
  const more = found.length - shown.length;
  const nothing = Array.isArray(items) && query.trim().length >= 2 && found.length === 0;

  /** [[GTC-380]] (Q9, ruling 2) — an item's name, a door to Moment 3 at that item. */
  const itemDoor = (itemId: string, words: string, key?: string) => (
    <a key={key} href={itemDoorHref(eventId, itemId)} className={ITEM_LINK}>
      {words}
    </a>
  );
  /** A person's answer: the held items' names as doors, the words between them as they read. */
  const answerOf = (hit: EventHit) =>
    hit.parts
      ? hit.parts.map((part: AnswerPart, i) =>
          part.itemId ? itemDoor(part.itemId, part.text, String(i)) : part.text
        )
      : hit.answer;

  const name = (hit: EventHit, words: string) =>
    hit.target ? (
      <button
        type="button"
        data-search-target={hit.target}
        onClick={() => goToStrip(hit.target!)}
        className={NAME_BUTTON}
      >
        {words}
      </button>
    ) : (
      words
    );

  return (
    <div data-event-search="" className="mt-4">
      <button
        type="button"
        data-event-search-button=""
        aria-expanded={open}
        onClick={toggle}
        className="inline-block cursor-pointer border-0 bg-transparent p-0 text-left text-[12px] text-[#888780] underline underline-offset-2"
      >
        {invitesOnly ? EVENT_WORDS.BUTTON_INVITES_ONLY : EVENT_WORDS.BUTTON}
      </button>
      {open ? (
        <div className="mt-2 max-w-[520px]">
          <label htmlFor={id} className="mb-1 block text-[12px] text-[#888780]">
            {invitesOnly ? EVENT_WORDS.LABEL_INVITES_ONLY : EVENT_WORDS.LABEL}
          </label>
          <input
            ref={box}
            id={id}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
            className="w-full rounded-lg border-[0.5px] border-[#dcdad2] bg-[#ffffff] px-2.5 py-1.5 text-[14px] text-[#2c2c2a] focus:outline-none focus:ring-2 focus:ring-[#dcdad2]"
          />
          {items === 'loading' ? (
            <p className="m-0 mt-2 text-[13px] text-[#888780]">{EVENT_WORDS.LOADING}</p>
          ) : null}
          {items === 'failed' ? (
            <p role="alert" className="m-0 mt-2 text-[13px] text-[#A32D2D]">
              {EVENT_WORDS.FAILED}
            </p>
          ) : null}
          {shown.length > 0 ? (
            <ul
              data-event-search-results=""
              className="m-0 mt-1.5 list-none rounded-lg bg-[#f5f4ef] p-0"
            >
              {shown.map((hit) => (
                <li
                  key={hit.key}
                  data-event-hit=""
                  className="border-t-[0.5px] border-[#e4e2da] px-2.5 py-2 text-[13px] leading-snug text-[#2c2c2a] first:border-t-0"
                >
                  {hit.kind === 'person' ? (
                    <>
                      {name(hit, hit.words)}
                      <span className="text-[#5f5e5a]">: {answerOf(hit)}</span>
                    </>
                  ) : (
                    <>
                      <span>{hit.itemId ? itemDoor(hit.itemId, hit.words) : hit.words}</span>
                      <span className="text-[#5f5e5a]">: {name(hit, hit.answer)}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {more > 0 ? (
            <p className="m-0 mt-1.5 text-[12px] text-[#888780]">{EVENT_WORDS.more(more)}</p>
          ) : null}
          {nothing ? (
            <p className="m-0 mt-2 text-[13px] text-[#5f5e5a]">
              {invitesOnly
                ? EVENT_WORDS.nothingInvitesOnly(query.trim())
                : EVENT_WORDS.nothing(query.trim())}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
