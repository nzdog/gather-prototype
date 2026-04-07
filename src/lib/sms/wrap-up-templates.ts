// Wrap-up message templates for GTC-FM2
// Personalised post-event messages sent to guests when host wraps up

export interface WrapUpTemplateParams {
  guestFirstName: string;
  eventName: string;
  hostFirstName: string;
  guestTaskItem: string;
  newEventLink: string;
}

export function buildSmsWrapUpMessage(params: WrapUpTemplateParams): string {
  const { eventName, hostFirstName, guestTaskItem, newEventLink } = params;
  return (
    `Hope ${eventName} was a great one! Thanks for bringing ${guestTaskItem}` +
    ` — it made a difference. If you've ever got an event to organise, this might help: ${newEventLink}` +
    ` — ${hostFirstName}`
  );
}

export function buildEmailWrapUpMessage(params: WrapUpTemplateParams): {
  subject: string;
  body: string;
} {
  const { guestFirstName, eventName, hostFirstName, guestTaskItem, newEventLink } = params;
  const subject = `Thanks for making ${eventName} happen`;
  const body =
    `Hey ${guestFirstName},\n\n` +
    `Hope ${eventName} was everything it should have been. ` +
    `Thanks for bringing ${guestTaskItem} — having people you can count on makes all the difference.\n\n` +
    `If you've ever got an event to pull together — birthday, Christmas, end of season — ` +
    `Gather makes it easy. Your details are already filled in:\n` +
    `${newEventLink}\n\n` +
    `— ${hostFirstName}`;
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
