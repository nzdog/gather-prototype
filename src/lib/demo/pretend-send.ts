import type { AskPreview } from '@/lib/preflight/ask-preview';
import { composePreview, messageRows, notMessagedRows } from '@/lib/preflight/ask-preview-compose';

/**
 * [[GTC-392]] part B — THE PRETEND SEND: what Send would have done on a sample, and nothing more.
 * Founder plan rulings, 18 Oct 2026 (QB1, QB2; W29 to W36, W35 as changed at QB11).
 *
 * The press is not touched (QB1): on a sample it still refuses and writes nothing, and the
 * pre-flight shows its refusal line (W2). Only then does the screen read step 4's own message read
 * and hand it here. This module composes it exactly as the drain does before it sends,
 * `composePreview(preview, preview.storedAuthorLine)` (`src/lib/press/dispatch.ts`), and splits the
 * rows with the press's own rule (`messageRows`). It records nothing (QB2), reaches no sender, and
 * keeps names only: no address and no number ever reaches the panel.
 *
 * CLIENT-SAFE AND PURE.
 */

/** W29, W34, W35 (as changed at QB11) and its link, W36. */
export const PRETEND_WORDS = {
  /** W29 — the panel's first line, under W2. */
  LEAD: 'Here’s what Send would have done:',
  /** W34 — in place of the count and the lists when nobody can be reached. */
  NOBODY: 'Nobody would get a message yet. Add an email or mobile for at least one guest.',
  /** W35 — the panel's last line. */
  SAME: 'Each would be the message in step 4, word for word.',
  /** W35's link. */
  OPEN_STEP_4: 'Open step 4 →',
  /** W36 — in place of the panel when the list cannot be read. */
  FAILED: 'I couldn’t put the list together just now. Step 4 shows each message.',
} as const;

export interface PretendMessage {
  name: string;
  channel: 'EMAIL' | 'TEXT';
  /** First names of the children whose asks ride in this message. */
  withChildren: string[];
  /** What they are asked to bring or do, in step 4's own words. */
  brief: string;
}

export interface PretendList {
  messages: PretendMessage[];
  emailed: number;
  texted: number;
  /** W32 — who Gather would leave to her, by name. */
  leftToHer: string[];
  /** W33 — children whose asks would come to her, when another household picked her. */
  carrierFor: string[];
}

/** Step 4's own words for what someone is asked for ("bring … · do …", or "nothing"). */
function brief(x: { itemNames: readonly string[]; jobNames: readonly string[] }): string {
  const parts = [
    x.itemNames.length > 0 ? `bring ${x.itemNames.join(', ')}` : null,
    x.jobNames.length > 0 ? `do ${x.jobNames.join(', ')}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : 'nothing';
}

type WirePreview = Omit<AskPreview, 'event'> & {
  event: Omit<AskPreview['event'], 'startDate'> & { startDate: Date | string };
};

export function pretendList(preview: AskPreview | WirePreview): PretendList {
  const composed = composePreview(preview, preview.storedAuthorLine);
  const messages = messageRows(composed.rows).map(
    (r): PretendMessage => ({
      name: r.recipient.name,
      channel: r.recipient.channel === 'TEXT' ? 'TEXT' : 'EMAIL',
      withChildren: r.recipient.carried.map((c) => c.firstName),
      brief: brief(r.recipient),
    })
  );
  const notMessaged = notMessagedRows(composed.rows);
  const carrierFor = notMessaged
    .filter((r) => r.recipient.hostAsCarrier)
    .flatMap((r) => r.recipient.carried.map((c) => c.firstName));
  const leftToHer = [
    ...preview.hostList.map((line) => line.name),
    ...notMessaged.filter((r) => !r.recipient.hostAsCarrier).map((r) => r.recipient.name),
  ];
  const texted = messages.filter((x) => x.channel === 'TEXT').length;
  return { messages, emailed: messages.length - texted, texted, leftToHer, carrierFor };
}

/** W30. */
export function countLine(n: number, emailed: number, texted: number): string {
  if (n === 1) return `1 person would get a message, by ${emailed === 1 ? 'email' : 'text'}.`;
  return `${n} people would get a message: ${emailed} by email, ${texted} by text.`;
}

/** W31 — one line per person. */
export function personLine(x: PretendMessage): string {
  const how = x.channel === 'TEXT' ? 'by text' : 'by email';
  const kids = x.withChildren.length > 0 ? ` · with ${x.withChildren.join(', ')}` : '';
  return `${x.name} · ${how}${kids} — ${x.brief}`;
}

/** W32. */
export function leaveLine(names: string[]): string {
  return `I’d leave ${names.length} to you: ${names.join(', ')}. Step 4 says why.`;
}

/** W33. */
export function carrierLine(childNames: string[]): string {
  return `You’d get one too, for ${childNames.join(', ')}.`;
}
