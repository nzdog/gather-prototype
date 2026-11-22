/**
 * [[GTC-460]] Stage 3, step 3a — THE CONTACTS PAGE'S ADDRESS, AND THE WAY BACK.
 *
 * One page for the host, `/plan/contacts` (ruling 157). When she arrives from an event's household
 * form the address names the event and, if she was on her own household's step or changing a saved
 * household, which: `/plan/contacts?event=<id>[&form=host | &edit=<household id>]`. Only ids are ever
 * put in an address (ruling 12, A13) - never a name, an email or a number - and an id read back from
 * an address is accepted only if it looks like one, so a made-up address cannot steer a link.
 *
 * The way back is the setup page's own address for Moment 1, `/plan/<event>/setup?at=people`, plus
 * `&edit=<household id>` when she was changing a saved household; the setup page reads that word once.
 *
 * [[GTC-470]]: the "Go back" button is on every visit, so there is a rule for where it goes (`goBackAction`):
 * the form she left, if the address names an event; else the browser's back, if the page she came from is a
 * page of this site and the tab has seen more than one page; else Your events. Pure: the browser's facts are
 * handed in, so the rule is pinned without a browser.
 */
import { AT_PEOPLE, setupHref } from '@/lib/moments/strip';

/** Ids are cuids, or the like: letters, digits, underscore and hyphen, at most 64. */
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

export interface ContactsAddress {
  eventId: string | null;
  /** 'host' when she left from her own household's step. */
  form: 'host' | null;
  /** The saved household she was changing. */
  editId: string | null;
}

const none: ContactsAddress = { eventId: null, form: null, editId: null };

/** Reads `?event=...&form=...&edit=...`. Anything that is not an id, and any word without an event, is ignored. */
export function readAddress(search: string): ContactsAddress {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return none;
  }
  const event = params.get('event');
  if (!event || !ID_SHAPE.test(event)) return none;
  const edit = params.get('edit');
  const editId = edit && ID_SHAPE.test(edit) ? edit : null;
  return {
    eventId: event,
    form: !editId && params.get('form') === 'host' ? 'host' : null,
    editId,
  };
}

/** The address of the contacts page, from an event's household form. */
export function contactsHref(a: { eventId: string; form?: 'host'; editId?: string }): string {
  const head = `/plan/contacts?event=${encodeURIComponent(a.eventId)}`;
  if (a.editId) return `${head}&edit=${encodeURIComponent(a.editId)}`;
  return a.form === 'host' ? `${head}&form=host` : head;
}

/** The way back to the household list she left, or null when she did not arrive from an event. */
export function backHref(a: ContactsAddress): string | null {
  if (!a.eventId) return null;
  const to = setupHref(a.eventId, AT_PEOPLE);
  return a.editId ? `${to}&edit=${encodeURIComponent(a.editId)}` : to;
}

/** Where Go back goes when there is no earlier screen of Gather's: the list of her events. */
export const HOME_HREF = '/plan/events';

/** What the browser knows at the moment Go back is pressed. */
export interface GoBackEnv {
  /** The address of the page she came from, as the browser tells this page; '' when it does not. */
  referrer: string;
  /** This site's own origin (scheme, host and port). */
  origin: string;
  /** How many pages this tab has seen. */
  historyLength: number;
}

export type GoBackAction = { kind: 'go'; href: string } | { kind: 'history' };

/** True only for an address on exactly this site: the same scheme, host and port, not a lookalike. */
function onThisSite(referrer: string, origin: string): boolean {
  if (!referrer || !origin || origin === 'null') return false;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}

/** The one rule for Go back. The sample page has no address (`null`), so it never takes the first step. */
export function goBackAction(a: ContactsAddress | null, env: GoBackEnv): GoBackAction {
  const form = a ? backHref(a) : null;
  if (form) return { kind: 'go', href: form };
  if (env.historyLength > 1 && onThisSite(env.referrer, env.origin)) return { kind: 'history' };
  return { kind: 'go', href: HOME_HREF };
}
