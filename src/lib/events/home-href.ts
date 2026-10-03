/**
 * [[GTC-357]] — WHERE AN EVENT OPENS, AND THE BOARD'S WAYS OUT. One rule, so Your Events, the press
 * and Moment 3 cannot send a host to two different homes for the same event.
 *
 * The founder's R1, verbatim: *"Right after you press send, and whenever you open the event again
 * from Your Events, you land on the board. The plan, Moment 3 and "Who I chase" are reached from
 * there. The same for a co-host."* So a sent Moment-flow event's home is the board; before the press
 * it opens in the setup flow, as it always has; a V1 event (no `EventSetup` row — the V1/V2
 * discriminator, GTC-235 ruling 4) opens on the old dashboard. A coordinator's door is unchanged
 * (plan Q7): the board admits only the host and co-hosts (`requireEventRole(['HOST', 'COHOST'])`).
 *
 * CLIENT-SAFE: no database, no server import. The board, the pre-flight and Your Events read it.
 */

export interface EventHomeFacts {
  id: string;
  /** The `EventSetup` row, or null for a V1 event. */
  setup: { id: string } | null;
  /** `Event.sentAt`: set by the press, and only by the press. Null before it. */
  sentAt: Date | string | null;
  /** The viewer's role on this event, as Your Events receives it. */
  role: string | null | undefined;
}

/** The board. Its address is kept (plan note 4). */
export function boardHref(eventId: string): string {
  return `/plan/${eventId}/glance`;
}

export function eventHomeHref(event: EventHomeFacts): string {
  if (!event.setup) return `/plan/${event.id}`;
  if (event.sentAt && (event.role === 'HOST' || event.role === 'COHOST'))
    return boardHref(event.id);
  return `/plan/${event.id}/setup`;
}

/*
 * The board's two new ways out, beside GTC-329's "Change who I chase" — founder, PLAN RULINGS
 * 2026-10-03, Q3: *""Change who's on what" (Recommended)"*, matching Moment 3's own name, "Who's on
 * what?"; and "Invites & people", the words Your Events already uses for the same door (GTC-235).
 */

/** To Moment 3: the setup flow opens there once the plan is approved. */
export const PLAN_DOOR_LINK = "Change who's on what";
export function planDoorHref(eventId: string): string {
  return `/plan/${eventId}/setup`;
}

/** To the old dashboard, the back room for what only it has (R2). */
export const BACK_ROOM_LINK = 'Invites & people';
export function backRoomHref(eventId: string): string {
  return `/plan/${eventId}`;
}
