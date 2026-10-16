'use client';

/**
 * [[GTC-388]] (item 72) — "See menu" and "See assignments", the board's two read-only pop-ups.
 *
 * Ruled 2026-10-16 (Q16 to Q23). AN ISLAND BESIDE THE BOARD'S OWN MARKUP, as the print door and the
 * search are, so `GlanceBoard` keeps phase 2's property: no hooks, no fetch. This file holds both
 * buttons and both pop-ups.
 *
 * Q16: in-page overlays like the person pop-ups, closing on Close, a tap outside and Escape; drawn
 * only while open, so the closed board gains two buttons and nothing else. Q17: each opening reads
 * `GET /api/events/[id]/items`, the route the print and the search read, cut down at once to what
 * is shown (`toPlanListItems`). Q20: read-only, no link inside; "Change who's on what" is the way to
 * change it. The board hides both on an invites-only event (Q19). Q23: this file is one of the
 * glance sources Ruling 1's fence scans (`tests/glance-read-test.ts`).
 */

import { useEffect, useRef, useState } from 'react';
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
  // Each opening has its own number, so a list that arrives after she closed it, or opened the
  // other, is not drawn.
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
  const close = () => {
    opening.current++;
    setOpen(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      opening.current++;
      setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const heading = open === 'menu' ? W.MENU_HEADING : W.ASSIGNMENTS_HEADING;

  return (
    <>
      <button
        type="button"
        data-plan-list-door="menu"
        aria-haspopup="dialog"
        aria-expanded={open === 'menu'}
        onClick={() => show('menu')}
        className={className}
      >
        {W.MENU_DOOR}
      </button>
      <button
        type="button"
        data-plan-list-door="assignments"
        aria-haspopup="dialog"
        aria-expanded={open === 'assignments'}
        onClick={() => show('assignments')}
        className={className}
      >
        {W.ASSIGNMENTS_DOOR}
      </button>

      {open ? (
        <div
          data-plan-list-backdrop=""
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={heading}
            data-plan-list={open}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-xl bg-[#ffffff] p-5 text-left text-[#2c2c2a]"
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
        </div>
      ) : null}
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
