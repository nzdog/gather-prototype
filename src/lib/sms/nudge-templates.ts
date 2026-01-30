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
 * RSVP Followup nudge
 * Sent 48h after "Not sure" response to force conversion to Yes/No
 */
export function getRsvpFollowupMessage(params: NudgeTemplateParams): string {
  const { eventName, link } = params;

  return `${eventName}: We need a final answer — are you coming? ${link} — Reply STOP to opt out`;
}
