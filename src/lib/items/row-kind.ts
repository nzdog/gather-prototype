/**
 * GTC-302 — whether a row is brought or done, as a host or coordinator submits it.
 *
 * `Item.kind` (GTC-171) is ITEM or TASK. Before GTC-302 only plan generation wrote TASK, so a job
 * typed by hand was stored as a dish and the ask said "bring" of it. The two add routes and the item
 * PATCH now read a submitted kind through `readSubmittedKind`, and the add forms offer it with
 * `RowKindToggle` in `src/components/plan/RowKindToggle.tsx`.
 *
 * CLIENT-SAFE: the forms import the words from here so they are worded once. No Prisma.
 */

export type RowKindValue = 'ITEM' | 'TASK';

/** The refusal, so the routes cannot word it three ways. */
export const KIND_ERROR = 'kind must be ITEM or TASK';

/**
 * The two words on the toggle. RULED by the founder (GTC-302): "BRING | DO — ruled. They are the
 * guest's own verbs and the form says what the guest will read."
 */
export const ROW_KIND_WORDS: Readonly<Record<RowKindValue, string>> = { ITEM: 'Bring', TASK: 'Do' };

/** The toggle's accessible name. The executor's, not ruled. */
export const ROW_KIND_QUESTION = 'Brought or done?';

/**
 * The job name field's lead. RULED — Unknown 8: "'Do the ___' as the label, so the sentence they are
 * completing is visible while they type." It is what stops a host typing "Wash up".
 */
export const JOB_NAME_LEAD = 'Do the';

/** The placeholder in that field — the founder's own example job. Proposed, not ruled. */
export const JOB_NAME_PLACEHOLDER = 'dishes';

export type KindRead = { ok: true; kind: RowKindValue | undefined } | { ok: false };

/**
 * A submitted kind. Absent is no kind (`undefined`): a create defaults it to ITEM, and a PATCH leaves
 * the row's kind alone. Anything that is not exactly ITEM or TASK is REFUSED, not defaulted — a job
 * silently stored as a dish is the defect this exists to end.
 */
export function readSubmittedKind(raw: unknown): KindRead {
  if (raw === undefined) return { ok: true, kind: undefined };
  if (raw === 'ITEM' || raw === 'TASK') return { ok: true, kind: raw };
  return { ok: false };
}

/**
 * The fields a row of this kind is written with. A job carries no quantity: `quantityState` NA, the
 * shape `finalize-plan` gives a generated job, which is what keeps task rows clear of the quantity
 * gates (GTC-171). A dish gets its kind and nothing else, and keeps whatever quantity it was given.
 */
export function kindFields(kind: RowKindValue): { kind: RowKindValue; quantityState?: 'NA' } {
  return kind === 'TASK' ? { kind, quantityState: 'NA' } : { kind };
}
