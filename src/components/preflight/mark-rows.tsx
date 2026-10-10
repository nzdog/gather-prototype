'use client';

/**
 * [[GTC-329]] — the per-person mark row and its small helpers, MOVED here unchanged from
 * `src/app/plan/[eventId]/pre-flight/page.tsx` so the post-press surface (`AfterThePress.tsx`)
 * shows the same row, with the same words, as step 3 of the pre-flight. Nothing below was edited
 * in the move except the `export` keywords: a second copy is how two screens start to disagree
 * about what the mark means.
 */

import { resolveNudgeOffsetDays, type NudgeMark, type NudgePace } from '@/lib/nudge-cadence';

export interface Member {
  personEventId: string;
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  householdRole: string | null;
  isYoungPerson: boolean;
  messageable: boolean;
  /**
   * GTC-256 (phase 3), Ruling 5. False for the host: she is on this screen because she is
   * in the guest list and counted (Rulings 1 and 3), and she is never messaged, so a
   * "hosting judgement about that person" has nothing to suppress. The cadence PATCH
   * refuses the write independently — this only decides what the screen offers.
   */
  markable: boolean;
  nudgeMark: NudgeMark | null;
}

// ─── The cadence, in words ───────────────────────────────────────────────────

/**
 * Render a resolved cadence. The days come from `resolveNudgeOffsetDays`, never from a
 * second table here — that module is import-free precisely so this screen shows the same
 * clock the sweep enforces, and a second definition is how the two start to disagree.
 */
export function cadenceSentence(days: readonly number[]): string {
  if (days.length === 0) return 'No nudges at all.';
  if (days.length === 1) return `One nudge, ${days[0]} days after the send.`;
  return `${days.length} nudges, on days ${days.join(' and ')} after the send.`;
}

export const MARK_LABELS: Record<NudgeMark, string> = {
  GENTLE: 'Go gentle',
  DONT_CHASE: "Don't nudge",
};

export function Pill({
  active,
  onClick,
  children,
  tone = 'default',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'default' | 'quiet';
}) {
  const base = 'px-3 py-1.5 text-sm rounded-full border transition-colors';
  const on =
    tone === 'quiet'
      ? 'bg-gray-700 text-white border-gray-700'
      : 'bg-accent text-white border-accent';
  const off = 'bg-white text-gray-600 border-gray-300 hover:border-gray-400';
  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? on : off}`}>
      {children}
    </button>
  );
}

// ─── The per-person mark ─────────────────────────────────────────────────────

/**
 * One row per person: the mark, and the cadence that mark actually resolves to against
 * the event's pace.
 *
 * The resolved sentence is the honest bit. Quieter-wins (Ruling 4) is not an override
 * ladder — a GENTLE person on an OFF event gets NOTHING, not one nudge — and showing the
 * mark alone would let Kate read it backwards. So every row runs the real resolver.
 */
export function MarkRows({
  members,
  channelPersonEventId,
  pace,
  onMark,
}: {
  members: Member[];
  channelPersonEventId: string | null;
  pace: NudgePace | null;
  onMark: (personEventId: string, mark: NudgeMark | null) => void;
}) {
  return (
    <ul className="space-y-2">
      {members.map((m) => {
        const days = resolveNudgeOffsetDays({
          person: { nudgeMark: m.nudgeMark },
          event: { nudgePace: pace },
        });
        return (
          <li
            key={m.personEventId}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-b border-gray-50 last:border-0 ${
              m.messageable ? '' : 'opacity-60'
            }`}
          >
            {/*
              FIXED-WIDTH NAME COLUMN so every row's controls start at the same x. It was
              `min-w-[8rem]`, a floor rather than a column, so a long name pushed the pills
              right and the rows read as ragged — "Aarav Patel-Henderson" sat further out than
              "Amy Henderson". The channel badge lives INSIDE the column for the same reason:
              outside it, the one row that has a badge would be the one row out of line.
              The name truncates rather than growing; `min-w-0` is what lets `truncate` work
              inside a flex child, and `title` keeps the full name reachable.
            */}
            <span className="flex items-center gap-1.5 w-full sm:w-60 sm:shrink-0 min-w-0">
              <span className="text-sm text-gray-900 truncate" title={m.name}>
                {m.name}
              </span>
              {m.personEventId === channelPersonEventId && (
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-accent border border-accent/40 rounded px-1.5 py-0.5">
                  channel
                </span>
              )}
            </span>
            {!m.messageable && (
              <span className="text-xs text-gray-500">
                child — never messaged, whatever contact details are on the record
              </span>
            )}
            {/*
              GTC-256 (phase 3), RULING 5 — THE HOST IS SHOWN, NOT OFFERED A MARK.
              She stays in the list on purpose: removing her would contradict Rulings 1
              and 3 and hide the person the plan is sized around. What she does not get is
              the pill row, because the pre-flight offering her "go gentle on" about
              HERSELF is the absurdity the ticket lists among its consequences. Worded as
              a statement rather than greyed like a child row, because nothing is being
              withheld from her — she is the one doing the asking.
            */}
            {m.messageable && !m.markable && (
              <span className="text-xs text-gray-500">
                you — never messaged about your own event
              </span>
            )}
            {m.messageable && m.markable && (
              <>
                <span className="flex gap-1.5">
                  {/*
                    LABEL ONLY — the stored value for this state is still NULL, which
                    `resolveNudgeOffsetDays` reads as "no opinion, defer to the event pace"
                    (GTC-179 Ruling 4, quieter-wins). "Normal nudge" names what the host gets,
                    not what the column holds; do not turn it into a stored STANDARD.
                  */}
                  <Pill active={m.nudgeMark === null} onClick={() => onMark(m.personEventId, null)}>
                    Normal nudge
                  </Pill>
                  {(Object.keys(MARK_LABELS) as NudgeMark[]).map((k) => (
                    <Pill
                      key={k}
                      tone="quiet"
                      active={m.nudgeMark === k}
                      onClick={() => onMark(m.personEventId, k)}
                    >
                      {MARK_LABELS[k]}
                    </Pill>
                  ))}
                </span>
                <span className="text-xs text-gray-500 basis-full sm:basis-auto">
                  {cadenceSentence(days)}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
