/**
 * [[GTC-399]] item 6 — THE STRIP'S DOORS AS ADDRESSES, for the Moment 4 screens outside the setup
 * page: the board and "Who I nudge" after the press (the founder's ruling of 24 Oct 2026, "All
 * three"). The setup page turns a door into a stage (`doorsFor`); a page elsewhere can only send
 * her there by address, as the pre-flight's strip does. Same rule (`stripDoors`), so the strip on
 * every screen sends her to the same place for the same facts.
 *
 * The facts are the ones every Moment 4 screen has already passed: her own household is saved, a
 * plan exists and was approved, and the event is held (an invites-only event has no plan, and the
 * rule reads `invitesOnly` before any of those). `sent` is the event's own. A Moment that turns out
 * to have nothing there opens what the setup page's entry rule finds, as `?at=plan` already does.
 *
 * CLIENT-SAFE: no database, no hook, no request. It returns plain data (strings and flags), so a
 * server page can hand it to MomentArc.
 */
import type { ArcDoor } from '@/components/plan/MomentArc';
import { boardHref } from '@/lib/events/home-href';
import {
  AT_OPENING,
  AT_PEOPLE,
  AT_PLAN,
  setupHref,
  stripDoors,
  type MomentNumber,
  type StripTarget,
} from './strip';

function hrefOf(eventId: string, target: StripTarget): string {
  switch (target) {
    case 'moment1':
      return setupHref(eventId, AT_PEOPLE);
    case 'moment2-opening':
      return setupHref(eventId, AT_OPENING);
    case 'plan':
      return setupHref(eventId, AT_PLAN);
    case 'moment3':
      return setupHref(eventId);
    case 'preflight':
      return `/plan/${eventId}/pre-flight`;
    case 'board':
      return boardHref(eventId);
  }
}

/** The doors of a Moment 4 screen's strip, as addresses: every Moment but the current one. */
export function moment4Doors(
  eventId: string,
  facts: { sent: boolean; invitesOnly: boolean }
): Partial<Record<MomentNumber, ArcDoor>> {
  const all = stripDoors({
    hostSaved: true,
    hasPlan: true,
    planApproved: true,
    held: true,
    sent: facts.sent,
    invitesOnly: facts.invitesOnly,
  });
  const doors: Partial<Record<MomentNumber, ArcDoor>> = {};
  for (const n of [1, 2, 3] as const) {
    const door = all[n];
    const notNeeded = door.kind === 'not-needed' ? { notNeeded: true as const } : {};
    doors[n] =
      'line' in door
        ? { locked: door.line, ...notNeeded }
        : { href: hrefOf(eventId, door.target), ...notNeeded };
  }
  return doors;
}
