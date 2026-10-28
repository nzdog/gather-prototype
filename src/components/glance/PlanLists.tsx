'use client';

/**
 * [[GTC-388]] (item 72) — "See menu" and "See assignments", the board's two read-only lists.
 *
 * Ruled 2026-10-16 (Q16 to Q23). AN ISLAND BESIDE THE BOARD'S OWN MARKUP, as the print door and the
 * search are, so `GlanceBoard` keeps phase 2's property: no hooks, no fetch. This file holds both
 * doors and both lists.
 *
 * Q17: each opening reads `GET /api/events/[id]/items`, the route the print and the search read, cut
 * down at once to what is shown (`toPlanListItems`). Q20: read-only, no link inside; "Change who's on
 * what" is the way to change it. The board hides both on an invites-only event (Q19). Q23: this file
 * is one of the glance sources Ruling 1's fence scans (`tests/glance-read-test.ts`).
 *
 * [[GTC-421]] (tweak 10, ruled 28 Oct 2026) — THEY FOLD OUT IN PLACE NOW, NOT OVER THE PAGE. Each is
 * the browser's own fold-out (`<details>` and `<summary>`), so a tap, or Enter or Space on its line,
 * opens and closes it. What opens is the pop-up's inside, unchanged: the heading, Close, and the
 * loading, failed, empty or list lines. The list is drawn only while it is open, so the closed board
 * still gains two lines and nothing else (Q16). One at a time, as with the pop-ups. The backdrop, the
 * dialog role and the Escape listener were the pop-up's and are gone: the same state, one hook fewer.
 */

import { useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { X } from 'lucide-react';
import {
  PLAN_LISTS_WORDS as W,
  menuSections,
  toPlanListItems,
  whoIsOnWhat,
  type PlanListItem,
} from '@/lib/print/plan-lists';

type Which = 'menu' | 'assignments';

interface PlanListsProps {
  eventId: string;
  /** The board's quiet door style, the same as the print door's. */
  className: string;
}

export default function PlanLists({ eventId, className }: PlanListsProps) {
  const [open, setOpen] = useState<Which | null>(null);
  const [items, setItems] = useState<PlanListItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Each opening has its own number, so a list that arrives after she opened the other is not drawn.
  const opening = useRef(0);

  const show = (which: Which) => {
    const mine = ++opening.current;
    setOpen(which);
    setItems(null);
    setFailed(false);
    fetch(`/api/events/${eventId}/items`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (opening.current !== mine) return;
        setItems(toPlanListItems(Array.isArray(data?.items) ? data.items : []));
      })
      .catch(() => {
        if (opening.current === mine) setFailed(true);
      });
  };

  // [[GTC-421]] The browser opened or folded one (a tap, or Enter or Space on its line).
  const toggled = (which: Which) => (e: SyntheticEvent<HTMLDetailsElement>) => {
    const fold = e.currentTarget;
    if (!fold.open) {
      setOpen((now) => (now === which ? null : now));
      return;
    }
    // One at a time: `name` does this in today's browsers, and this in older ones.
    fold.parentElement
      ?.querySelectorAll<HTMLDetailsElement>('details[data-plan-list-fold][open]')
      .forEach((other) => {
        if (other !== fold) other.open = false;
      });
    show(which);
  };

  // Close folds it away and puts the focus back on its line.
  const close = (e: MouseEvent<HTMLButtonElement>) => {
    const fold = e.currentTarget.closest('details');
    if (!fold) return;
    fold.open = false;
    fold.querySelector('summary')?.focus();
  };

  const heading = open === 'menu' ? W.MENU_HEADING : W.ASSIGNMENTS_HEADING;

  const fold = (which: Which, words: string) => (
    <details
      data-plan-list-fold={which}
      name="plan-lists"
      onToggle={toggled(which)}
      className="open:basis-full"
    >
      <summary
        data-plan-list-door={which}
        className={`${className} list-none [&::-webkit-details-marker]:hidden`}
      >
        {words}
      </summary>
      {open === which ? (
        <div
          data-plan-list={which}
          className="mt-2 w-full max-w-[420px] rounded-xl border-[0.5px] border-[#dcdad2] bg-[#ffffff] p-5 text-left text-[#2c2c2a]"
        >
          <div className="flex items-start justify-between gap-3">
            <p data-plan-list-heading="" className="m-0 text-[17px] font-medium">
              {heading}
            </p>
            <button
              type="button"
              aria-label={W.CLOSE}
              onClick={close}
              className="-mr-1 -mt-1 rounded p-1 text-[#888780]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3">
            {failed ? (
              <p data-plan-failed="" className="m-0 text-[13px] text-[#A32D2D]">
                {W.FAILED}
              </p>
            ) : items === null ? (
              <p data-plan-loading="" className="m-0 text-[13px] text-[#888780]">
                {W.LOADING}
              </p>
            ) : open === 'menu' ? (
              <MenuList items={items} />
            ) : (
              <WhoList items={items} />
            )}
          </div>
        </div>
      ) : null}
    </details>
  );

  return (
    <>
      {fold('menu', W.MENU_DOOR)}
      {fold('assignments', W.ASSIGNMENTS_DOOR)}
    </>
  );
}

function Row({ name, amount, who }: { name: string; amount: string | null; who: string }) {
  return (
    <div data-plan-row="" className="mt-1.5 rounded-lg bg-[#f5f4ef] px-2.5 py-1.5">
      <p className="m-0 text-[13px]">
        <span data-plan-row-name="">{name}</span>
        {amount ? (
          <>
            {' · '}
            <span data-plan-row-amount="">{amount}</span>
          </>
        ) : null}
      </p>
      <p data-plan-row-who="" className="m-0 mt-0.5 text-[12px] text-[#5c5b57]">
        {who}
      </p>
    </div>
  );
}

function GroupName({ children }: { children: string }) {
  return (
    <p
      data-plan-group-name=""
      className="m-0 mt-3 text-[11px] uppercase tracking-wide text-[#888780] first:mt-0"
    >
      {children}
    </p>
  );
}

function MenuList({ items }: { items: PlanListItem[] }) {
  const sections = menuSections(items);
  if (sections.length === 0) {
    return (
      <p data-plan-empty="" className="m-0 text-[13px] text-[#888780]">
        {W.MENU_EMPTY}
      </p>
    );
  }
  return (
    <>
      {sections.map((s) => (
        <div key={s.section} data-plan-section="" className="mt-3 first:mt-0">
          <GroupName>{s.section}</GroupName>
          {s.rows.map((r, i) => (
            <Row
              key={`${r.name}-${i}`}
              name={r.name}
              amount={r.amount}
              who={r.holder ? `${r.holder} · ${r.answer}` : W.NOBODY}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function WhoList({ items }: { items: PlanListItem[] }) {
  const { people, unheld } = whoIsOnWhat(items);
  return (
    <>
      {people.length === 0 ? (
        <p data-plan-empty="" className="m-0 text-[13px] text-[#888780]">
          {W.ASSIGNMENTS_EMPTY}
        </p>
      ) : (
        people.map((p, i) => (
          <div key={`${p.name}-${i}`} data-plan-person="" className="mt-3 first:mt-0">
            <GroupName>{p.name}</GroupName>
            {p.rows.map((r, j) => (
              <Row
                key={`${r.name}-${j}`}
                name={r.name}
                amount={r.amount}
                who={`${r.section} · ${r.answer}`}
              />
            ))}
          </div>
        ))
      )}
      {unheld.length > 0 ? (
        <div data-plan-unheld="" className="mt-3">
          <GroupName>{W.UNHELD}</GroupName>
          {unheld.map((r, i) => (
            <Row key={`${r.name}-${i}`} name={r.name} amount={r.amount} who={r.section} />
          ))}
        </div>
      ) : null}
    </>
  );
}
