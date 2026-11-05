/**
 * [[GTC-453]] — LISTENING REPORT, LEVEL 1: THE COUNTING.
 *
 * Pure functions only: rows in, numbered lines out. No database, no clock of its own (the caller
 * passes `now`), no names. The loader (`scripts/listening-report.ts`) reads the rows inside a
 * read-only transaction and hands them here, so everything below can be tested on invented data.
 *
 * Founder decisions this follows (run sheet, 5 Nov 2026):
 *   L1-D1  Two finish lines, reported apart. A: planning finished, when the invitations are sent.
 *          A draft with no host save for 14 days and nothing sent is "stopped". B: gathering
 *          finished, once its NZ day has ended (`isComplete` in src/lib/lifecycle.ts).
 *   L1-D2  Two hours with no host save means the host left; the next save means they came back.
 *   L1-D3  Demos left out by `Event.isDemo`. Test gatherings left out by a list of their ids kept
 *          outside the repo (Way 1), plus an optional launch-date cut-off.
 *   L1-D4  Read daily. Exact numbers: the report is private. The fewer-than-5 rule applies only
 *          to numbers shared outside, so it is not applied here.
 *
 * Nothing here may print an id, a name, or a date that points at one gathering. Every line is a
 * count, a median or a highest value across gatherings.
 */

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** L1-D2. */
export const LEFT_AFTER_MS = 2 * HOUR_MS;
/** L1-D1. */
export const STOPPED_AFTER_MS = 14 * DAY_MS;

/** A guest's own tap, as the board reads it (src/lib/glance/rewind.ts). */
export const GUEST_REPLY_ACTIONS = [
  'ACCEPT_ASSIGNMENT',
  'DECLINE_ASSIGNMENT',
  'MAYBE_ASSIGNMENT',
  'ANSWER_ATTENDANCE',
] as const;

/** Who counts as the host when a save is made. */
export const HOST_ACTORS = ['HOST', 'COHOST'] as const;

/** Before the plan is approved, a host save is Moment 1 or 2 by what it changed. */
export const MOMENT_BY_TARGET_BEFORE_APPROVAL: Record<string, 1 | 2> = {
  Event: 1,
  PersonEvent: 1,
  Household: 1,
  Item: 2,
  Team: 2,
  PlanRevision: 2,
  Conflict: 2,
};

export type Moment = 1 | 2 | 3 | 4;
export type Phase = Moment | 'after-send' | 'unplaced';

export interface EventRow {
  id: string;
  createdAt: Date;
  status: string;
  /** The press. Stored in the column `inviteSendConfirmedAt`. */
  sentAt: Date | null;
  /** Legacy: an event frozen before GTC-199 counts as sent (`isSent` in src/lib/lifecycle.ts). */
  frozenAt: Date | null;
  /** The hold: Moment 3 ends here. */
  transitionedToConfirmingAt: Date | null;
  endDate: Date;
  paidAt: Date | null;
  planApprovedAt: Date | null;
}

export interface SaveRow {
  eventId: string;
  timestamp: Date;
  actionType: string;
  targetType: string;
  actorKind: string;
}

export interface PersonEventRow {
  eventId: string;
  sentAt: Date | null;
  rsvpRespondedAt: Date | null;
  attendanceAnsweredAt: Date | null;
}

export interface AssignmentRow {
  eventId: string;
  response: string;
}

export interface FailureCounts {
  smsSendFailed: number;
  wrapupMessageFailed: number;
  outboundRejected: number;
}

export interface ReportInput {
  now: Date;
  /** The NZ midnight the report reads from. */
  since: Date;
  events: EventRow[];
  saves: SaveRow[];
  personEvents: PersonEventRow[];
  assignments: AssignmentRow[];
  /** Failures per event id, already counted by the loader. */
  failures: Map<string, FailureCounts>;
  /** NZ week starts (Monday 00:00 NZ), oldest first, for the paid trend. */
  weekStarts: Date[];
  excluded: { demo: number; testList: number; beforeCutoff: number };
  /** For the end-of-gathering rule: the NZ midnight after a given instant. */
  nextNzMidnight: (d: Date) => Date;
}

// ── small helpers ─────────────────────────────────────────────────────────────────────────

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function sentAtOf(e: EventRow): Date | null {
  if (e.sentAt) return e.sentAt;
  if (e.status === 'FROZEN' && e.frozenAt) return e.frozenAt;
  return null;
}

function inWindow(d: Date | null, since: Date, now: Date): boolean {
  return d !== null && d.getTime() >= since.getTime() && d.getTime() < now.getTime();
}

export function formatSpan(ms: number | null): string {
  if (ms === null) return 'none';
  if (ms < HOUR_MS) return `${Math.round(ms / 60000)} min`;
  if (ms < 2 * DAY_MS) return `${(ms / HOUR_MS).toFixed(1)} hours`;
  return `${(ms / DAY_MS).toFixed(1)} days`;
}

/** Which Moment (or after the send) a host save belongs to, by the milestones Gather stamps. */
export function phaseOf(save: SaveRow, e: EventRow): Phase {
  const t = save.timestamp.getTime();
  const sent = sentAtOf(e);
  if (sent && t >= sent.getTime()) return 'after-send';
  if (e.transitionedToConfirmingAt && t >= e.transitionedToConfirmingAt.getTime()) return 4;
  if (e.planApprovedAt && t >= e.planApprovedAt.getTime()) return 3;
  return MOMENT_BY_TARGET_BEFORE_APPROVAL[save.targetType] ?? 'unplaced';
}

/** Runs of saves with no gap over two hours. Input must be sorted by time. */
export function visits(times: number[]): number {
  if (times.length === 0) return 0;
  let n = 1;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > LEFT_AFTER_MS) n++;
  return n;
}

/** The Moment a draft stopped in: by its milestones, then by its last save. */
export function stoppedMoment(e: EventRow, hostSaves: SaveRow[]): Moment {
  if (e.transitionedToConfirmingAt) return 4;
  if (e.planApprovedAt) return 3;
  const last = hostSaves[hostSaves.length - 1];
  if (!last) return 1;
  const m = MOMENT_BY_TARGET_BEFORE_APPROVAL[last.targetType];
  return m ?? 2;
}

// ── the report ────────────────────────────────────────────────────────────────────────────

export function buildReport(input: ReportInput): string[] {
  const { now, since, events } = input;
  const out: string[] = [];

  const hostSavesByEvent = new Map<string, SaveRow[]>();
  const guestRepliesByEvent = new Map<string, SaveRow[]>();
  const replyActions = new Set<string>(GUEST_REPLY_ACTIONS);
  const hostActors = new Set<string>(HOST_ACTORS);
  for (const s of [...input.saves].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())) {
    if (hostActors.has(s.actorKind)) {
      const list = hostSavesByEvent.get(s.eventId) ?? [];
      list.push(s);
      hostSavesByEvent.set(s.eventId, list);
    } else if (replyActions.has(s.actionType)) {
      const list = guestRepliesByEvent.get(s.eventId) ?? [];
      list.push(s);
      guestRepliesByEvent.set(s.eventId, list);
    }
  }

  out.push('GATHER LISTENING REPORT, LEVEL 1');
  out.push('Private. Exact numbers. Apply the fewer-than-5 rule');
  out.push('before sharing any of this outside.');
  out.push('');
  out.push(`Gatherings read: ${events.length}`);
  out.push(
    `Left out: demo ${input.excluded.demo}, test list ${input.excluded.testList}, ` +
      `before cut-off ${input.excluded.beforeCutoff}`
  );

  // ── Section A: planning finished ──
  const sent = events.filter((e) => inWindow(sentAtOf(e), since, now));
  const stopped: EventRow[] = [];
  let cameBack = 0;
  for (const e of events) {
    const saves = hostSavesByEvent.get(e.id) ?? [];
    const times = saves.map((s) => s.timestamp.getTime());
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      if (gap > STOPPED_AFTER_MS && inWindow(new Date(times[i]), since, now)) {
        cameBack++;
        break;
      }
    }
    if (sentAtOf(e)) continue;
    const lastActivity = times.length ? times[times.length - 1] : e.createdAt.getTime();
    const stoppedAt = new Date(lastActivity + STOPPED_AFTER_MS);
    if (inWindow(stoppedAt, since, now)) stopped.push(e);
  }

  out.push('');
  out.push('A. PLANNING FINISHED');
  out.push(`Sent: ${sent.length}`);
  const stoppedBy = [0, 0, 0, 0];
  for (const e of stopped) stoppedBy[stoppedMoment(e, hostSavesByEvent.get(e.id) ?? []) - 1]++;
  out.push(
    `Stopped: ${stopped.length} (M1 ${stoppedBy[0]}, M2 ${stoppedBy[1]}, ` +
      `M3 ${stoppedBy[2]}, M4 ${stoppedBy[3]})`
  );
  out.push(`Came back after 14+ quiet days: ${cameBack}`);

  if (sent.length) {
    out.push('For the sent gatherings, per Moment:');
    out.push('(returns = visits minus 1; a visit ends after 2 quiet hours)');
    let unplaced = 0;
    for (const m of [1, 2, 3, 4] as Moment[]) {
      const returns: number[] = [];
      const spans: number[] = [];
      for (const e of sent) {
        const inMoment = (hostSavesByEvent.get(e.id) ?? []).filter((s) => phaseOf(s, e) === m);
        if (!inMoment.length) continue;
        const times = inMoment.map((s) => s.timestamp.getTime());
        returns.push(visits(times) - 1);
        spans.push(times[times.length - 1] - times[0]);
      }
      const highest = returns.length ? Math.max(...returns) : null;
      out.push(
        `  M${m}: ${returns.length} with saves; returns median ` +
          `${median(returns) ?? 'none'}, highest ${highest ?? 'none'}; ` +
          `span median ${formatSpan(median(spans))}`
      );
    }
    for (const e of sent)
      for (const s of hostSavesByEvent.get(e.id) ?? [])
        if (phaseOf(s, e) === 'unplaced') unplaced++;
    out.push(`  Saves that fit no Moment: ${unplaced}`);
  }

  // ── Section B: gathering finished ──
  const finished = events.filter((e) => inWindow(input.nextNzMidnight(e.endDate), since, now));
  out.push('');
  out.push('B. GATHERINGS FINISHED');
  out.push(
    `Finished: ${finished.length} (${finished.filter((e) => sentAtOf(e)).length} were sent)`
  );

  if (finished.length) {
    const finishedIds = new Set(finished.map((e) => e.id));

    // OPEN: reply time, per gathering then across gatherings.
    const perGathering: number[] = [];
    for (const e of finished) {
      const waits = input.personEvents
        .filter((p) => p.eventId === e.id && p.sentAt)
        .map((p) => {
          const answers = [p.rsvpRespondedAt, p.attendanceAnsweredAt]
            .filter((d): d is Date => d !== null)
            .map((d) => d.getTime());
          return answers.length ? Math.min(...answers) - p.sentAt!.getTime() : null;
        })
        .filter((w): w is number => w !== null && w >= 0);
      const m = median(waits);
      if (m !== null) perGathering.push(m);
    }
    out.push(
      `OPEN, reply time: median ${formatSpan(median(perGathering))} ` +
        `(${perGathering.length} gatherings with replies)`
    );

    // OPEN: time to everyone sorted (estimate).
    const toSorted: number[] = [];
    let notSorted = 0;
    for (const e of finished) {
      const sentAt = sentAtOf(e);
      if (!sentAt) continue;
      const pending = input.assignments.some((a) => a.eventId === e.id && a.response === 'PENDING');
      const invited = input.personEvents.filter((p) => p.eventId === e.id && p.sentAt);
      const unanswered = invited.some((p) => !p.rsvpRespondedAt && !p.attendanceAnsweredAt);
      if (pending || unanswered) {
        notSorted++;
        continue;
      }
      const lastReplies = [
        ...(guestRepliesByEvent.get(e.id) ?? []).map((s) => s.timestamp.getTime()),
        ...invited.flatMap((p) =>
          [p.rsvpRespondedAt, p.attendanceAnsweredAt]
            .filter((d): d is Date => d !== null)
            .map((d) => d.getTime())
        ),
      ];
      if (!lastReplies.length) continue;
      const span = Math.max(...lastReplies) - sentAt.getTime();
      if (span >= 0) toSorted.push(span);
    }
    out.push(
      `OPEN, time to everyone sorted (estimate): median ` +
        `${formatSpan(median(toSorted))} (${toSorted.length} sorted, ${notSorted} not)`
    );

    // OPEN: what hosts changed after the send.
    const afterSend = new Map<string, number>();
    for (const e of finished)
      for (const s of hostSavesByEvent.get(e.id) ?? [])
        if (phaseOf(s, e) === 'after-send')
          afterSend.set(s.actionType, (afterSend.get(s.actionType) ?? 0) + 1);
    const total = [...afterSend.values()].reduce((a, b) => a + b, 0);
    out.push(`OPEN, host changes after the send: ${total}`);
    for (const [type, n] of [...afterSend.entries()].sort((a, b) => b[1] - a[1]))
      out.push(`  ${type}: ${n}`);

    // Failures.
    const f = { smsSendFailed: 0, wrapupMessageFailed: 0, outboundRejected: 0 };
    for (const id of finishedIds) {
      const c = input.failures.get(id);
      if (!c) continue;
      f.smsSendFailed += c.smsSendFailed;
      f.wrapupMessageFailed += c.wrapupMessageFailed;
      f.outboundRejected += c.outboundRejected;
    }
    out.push(
      `Failures: texts ${f.smsSendFailed}, thank-yous ${f.wrapupMessageFailed}, ` +
        `messages refused ${f.outboundRejected}`
    );
  }

  // ── Trend: new paid gatherings per NZ week ──
  out.push('');
  out.push('NEW PAID GATHERINGS, LAST 4 NZ WEEKS (oldest first)');
  const counts = input.weekStarts.map((start, i) => {
    const end = input.weekStarts[i + 1] ?? now;
    return events.filter((e) => inWindow(e.paidAt, start, end)).length;
  });
  out.push(counts.join(', '));
  out.push('Compare with the demo starts in the [demo-tally] log lines.');

  return out;
}
