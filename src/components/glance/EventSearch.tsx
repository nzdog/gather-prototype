'use client';

/**
 * [[GTC-373]] (item 13) — "Find someone or something", the board's search of the event.
 *
 * Ruled 2026-10-08 (W13 to W24, Q11 to Q21 as proposed). An ISLAND BESIDE THE BOARD'S OWN MARKUP,
 * as the print door is, so `GlanceBoard` keeps phase 2's property: no hooks, no fetch. Closed on every
 * visit, with the other closed buttons (Ruling 1: nothing here makes her lean in unless she asks).
 *
 * IT ONLY FINDS. Its one request is the print door's read, `GET /api/events/[id]/items`, made on each
 * opening and narrowed at once (`narrowItems`, Q13). A tap on a name scrolls that person's strip to
 * the middle of the screen and rings it for two seconds (Q19): an outline set here, never a class, so
 * the live poll's repaint never meets it; no focus moves, so no door opens. One of the glance sources
 * Ruling 1's fence scans (`tests/glance-read-test.ts`, Q22).
 */

import { useEffect, useId, useRef, useState } from 'react';
import {
  EVENT_SHOWN,
  EVENT_WORDS,
  findInEvent,
  narrowItems,
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

/** Q19 — the person's strip, brought to the middle of the screen and ringed for two seconds. */
function goToStrip(personEventId: string) {
  const strip = document.querySelector<HTMLElement>(
    `[data-person-event-id="${CSS.escape(personEventId)}"]`
  );
  if (!strip) return;
  strip.scrollIntoView({ behavior: 'smooth', block: 'center' });
  strip.style.outline = '2px solid #2c2c2a';
  strip.style.outlineOffset = '2px';
  window.setTimeout(() => {
    strip.style.outline = '';
    strip.style.outlineOffset = '';
  }, 2000);
}

const NAME_BUTTON =
  'cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] text-[#2c2c2a] underline underline-offset-2';

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
                      <span className="text-[#5f5e5a]">: {hit.answer}</span>
                    </>
                  ) : (
                    <>
                      <span>{hit.words}</span>
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
