/**
 * SMS templates for auto-nudges
 *
 * Guidelines:
 * - Keep under 160 chars (single SMS)
 * - Include event name for context
 * - Include link to respond
 * - Include opt-out instruction (required by regulations)
 */

export interface NudgeTemplateParams {
  hostName: string;
  eventName: string;
  link: string;
  personName?: string;
}

export interface ProxyNudgeTemplateParams {
  eventName: string;
  unclaimedCount: number;
  dashboardLink: string;
}

/**
 * 24h "Open Rescue" nudge
 * Sent when someone hasn't opened their link yet
 */
export function get24hNudgeMessage(params: NudgeTemplateParams): string {
  const { hostName, eventName, link } = params;

  // Target: ~140 chars to leave room for carrier additions
  return `${hostName} is waiting for your response for ${eventName}. Tap to view: ${link} — Reply STOP to opt out`;
}

/**
 * 48h "Action Rescue" nudge
 * Sent when someone opened but hasn't responded
 */
export function get48hNudgeMessage(params: NudgeTemplateParams): string {
  const { hostName, eventName, link } = params;

  return `Reminder: ${hostName} needs your response for ${eventName}. Please confirm: ${link} — Reply STOP to opt out`;
}

/**
 * Validate message length
 * SMS segments: 1 segment = 160 chars (GSM-7) or 70 chars (Unicode)
 */
export function getMessageSegments(message: string): number {
  // Check for non-GSM characters (simplified check)
  const hasUnicode = /[^\x00-\x7F]/.test(message);

  const charsPerSegment = hasUnicode ? 70 : 160;
  return Math.ceil(message.length / charsPerSegment);
}

/**
 * Get message length info for logging
 */
export function getMessageInfo(message: string): {
  length: number;
  segments: number;
  hasUnicode: boolean;
} {
  const hasUnicode = /[^\x00-\x7F]/.test(message);
  return {
    length: message.length,
    segments: getMessageSegments(message),
    hasUnicode,
  };
}

/**
 * Proxy household reminder nudge
 * Sent to proxy when household members haven't claimed their slots
 */
export function getProxyHouseholdReminderMessage(params: ProxyNudgeTemplateParams): string {
  const { eventName, unclaimedCount, dashboardLink } = params;

  const peopleText = unclaimedCount === 1 ? 'person' : 'people';

  return `${eventName}: ${unclaimedCount} ${peopleText} in your group haven't confirmed yet. Can you check in with them? ${dashboardLink} — Reply STOP to opt out`;
}

/**
 * Host-initiated nudge templates
 * Four tone variants, personalised with guest name, task item, event name, event date.
 * These are longer than auto-nudge SMS (multi-segment) — that's intentional per ticket spec.
 */
export type HostNudgeVariant = 'warm' | 'casual' | 'gentle' | 'direct';

export interface HostNudgeTemplateParams {
  guestFirstName: string;
  taskItem: string;
  eventName: string;
  eventDate: string;
}

const HOST_NUDGE_TEMPLATES: Record<HostNudgeVariant, (p: HostNudgeTemplateParams) => string> = {
  warm: (p) =>
    `Hey ${p.guestFirstName} — just checking in! Still all good to bring ${p.taskItem} to ${p.eventName} on ${p.eventDate}? Let me know if anything's changed 😊`,
  casual: (p) =>
    `Oi ${p.guestFirstName} 👋 Quick one — are you still sorted for ${p.taskItem} at ${p.eventName}? Just want to make sure we're covered!`,
  gentle: (p) =>
    `Hi ${p.guestFirstName}, hope you're well! Just a gentle reminder that you've been assigned ${p.taskItem} for ${p.eventName} on ${p.eventDate}. Let me know if that still works for you.`,
  direct: (p) =>
    `Hi ${p.guestFirstName} — confirming you're still bringing ${p.taskItem} to ${p.eventName} on ${p.eventDate}. Reply to let me know either way. Thanks!`,
};

export function getHostNudgeMessage(
  variant: HostNudgeVariant,
  params: HostNudgeTemplateParams
): string {
  return HOST_NUDGE_TEMPLATES[variant](params);
}

export const HOST_NUDGE_VARIANT_LABELS: Record<HostNudgeVariant, string> = {
  warm: 'Warm',
  casual: 'Casual',
  gentle: 'Gentle reminder',
  direct: 'Direct',
};

/**
 * RSVP Followup nudge
 * Sent 48h after "Not sure" response to force conversion to Yes/No
 */
export function getRsvpFollowupMessage(params: NudgeTemplateParams): string {
  const { eventName, link } = params;

  return `${eventName}: We need a final answer — are you coming? ${link} — Reply STOP to opt out`;
}

export interface DecideByFollowupTemplateParams {
  hostFirstName: string;
  itemName: string;
  /** The decide-by rendered as an NZ weekday — see formatDecideByDay. */
  decideByDay: string;
  link: string;
}

/**
 * GTC-175 (D2) — the maybe's single decide-by follow-up.
 *
 * The copy is Hinge §8's own, near-verbatim: "still good for the pavlova? Kate needs to
 * know by Thursday." Note what it is NOT. It does not ask "did you see this?" — he saw
 * it, he tapped maybe; that is the silence cadence's question and §8 rules it the wrong
 * one here. It does not chase, and it never repeats: one follow-up, then the clock runs
 * out and the maybe becomes Kate's problem rather than the guest's.
 *
 * The host's FIRST name, matching the warm register of the host-composed variants above
 * rather than the terse auto-nudge ones — this message speaks for Kate, not for the
 * system. The ` — Reply STOP to opt out` suffix is mandatory on every system-sent
 * template and is not a stylistic choice.
 */
export function getDecideByFollowupMessage(params: DecideByFollowupTemplateParams): string {
  const { hostFirstName, itemName, decideByDay, link } = params;

  return `Still good for the ${itemName}? ${hostFirstName} needs to know by ${decideByDay}. ${link} — Reply STOP to opt out`;
}

/**
 * The decide-by as a guest would say it: a weekday name in NZ local time.
 *
 * NZ-local rather than UTC because the guest reads it on an NZ phone, and a deadline
 * that lands Thursday evening UTC is Friday morning to them. Timezone-correct on any
 * server — the same reasoning as isQuietHours (quiet-hours.ts:29-31).
 *
 * Falls back to a day + month once the deadline is more than a week out, where a bare
 * weekday is ambiguous.
 */
export function formatDecideByDay(decideByAt: Date, now: Date = new Date()): string {
  const withinAWeek = decideByAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;

  return decideByAt.toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'long',
    ...(withinAWeek ? {} : { day: 'numeric', month: 'long' }),
  });
}
