import { withOptOutLine } from './opt-out-line';

// Wrap-up message templates for GTC-FM2
// Personalised post-event messages sent to guests when host completes event

export interface WrapUpTemplateParams {
  guestFirstName: string;
  eventName: string;
  hostFirstName: string;
  guestTaskItem: string;
}

/**
 * [[GTC-337]] ruling 2 — the thank-you ends with the opt-out line, and its dash is ` - `, the
 * register's standing form: the em dash was the one non-GSM-7 character in it ([[GTC-257]]).
 * The email below keeps its dash; an email has no segments.
 */
export function buildSmsWrapUpMessage(params: WrapUpTemplateParams): string {
  const { guestFirstName, eventName, hostFirstName, guestTaskItem } = params;
  const isFallback = guestTaskItem === 'what you brought';
  if (isFallback) {
    return withOptOutLine(
      `Hi ${guestFirstName}, ${hostFirstName} asked me (Gather - the app they used to organise ${eventName}) to pass on a thanks for being part of it. Much appreciated.`
    );
  }
  return withOptOutLine(
    `Hi ${guestFirstName}, ${hostFirstName} asked me (Gather - the app they used to organise ${eventName}) to pass on a thanks for bringing ${guestTaskItem}. Much appreciated.`
  );
}

export function buildEmailWrapUpMessage(params: WrapUpTemplateParams): {
  subject: string;
  body: string;
} {
  const { guestFirstName, eventName, hostFirstName, guestTaskItem } = params;
  const subject = `Thanks from ${hostFirstName}`;
  const isFallback = guestTaskItem === 'what you brought';
  let body: string;
  if (isFallback) {
    body = `Hi ${guestFirstName}, ${hostFirstName} asked me (Gather \u2014 the app they used to organise ${eventName}) to pass on a thanks for being part of it. Much appreciated.`;
  } else {
    body = `Hi ${guestFirstName}, ${hostFirstName} asked me (Gather \u2014 the app they used to organise ${eventName}) to pass on a thanks for bringing ${guestTaskItem}. Much appreciated.`;
  }
  return { subject, body };
}

/**
 * Resolve the guest's primary task/item name for the template.
 * Falls back to "what you brought" if no assignment found.
 */
export function resolveGuestTaskItem(
  assignments: Array<{ item: { name: string }; response: string }>
): string {
  const accepted = assignments.find((a) => a.response === 'ACCEPTED');
  if (accepted) return accepted.item.name;
  if (assignments.length > 0) return assignments[0].item.name;
  return 'what you brought';
}
