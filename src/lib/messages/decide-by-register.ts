import { askSubject } from '@/lib/messages/ask-register';

/**
 * [[GTC-251]] slice 251b — THE DECIDE-BY FOLLOW-UP AS AN EMAIL. W5, ruled 2026-09-30.
 *
 * Q4: *"Gather sends the same 'please decide' follow-up by email to maybe-guests it can't text."*
 * So the middle sentence IS the text's (`getDecideByFollowupMessage` in `nudge-templates.ts`), word
 * for word, and the email opens the way the ask and the reminders open (`Hi {first}`), because it
 * is her follow-up to her own invitation.
 *
 * ⚠ ONE PARAGRAPH, AS THE REMINDER EMAIL IS (`composeChase` in `chase-register.ts`). The ruled
 * sentences are joined the way that ruled email joins its own; the footer and the way out are the
 * sender's (`guestEmailParts` in `src/lib/email.ts`), never this module's.
 */

export interface ComposeDecideByInput {
  recipientFirstName: string;
  hostFirstName: string;
  eventName: string;
  itemName: string;
  /** `formatDecideByDay`'s answer, the same day the text would name. */
  decideByDay: string;
  link: string;
}

export interface ComposedDecideBy {
  subject: string;
  text: string;
}

export function composeDecideByEmail(input: ComposeDecideByInput): ComposedDecideBy {
  return {
    subject: askSubject(input.eventName, input.hostFirstName),
    text: [
      `Hi ${input.recipientFirstName} - Gather here, helping ${input.hostFirstName} with this one.`,
      `Still good for the ${input.itemName}? ${input.hostFirstName} needs to know by ${input.decideByDay}.`,
      `One tap to let ${input.hostFirstName} know: ${input.link}`,
    ].join(' '),
  };
}
