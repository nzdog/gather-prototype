/**
 * GTC-171 (B2) — day-of task rows.
 *
 * Moment 4 spec §6: tasks (washing, drying, clearing) enter the plan in Moment 2 alongside
 * the items, and are owned in Moment 3 through the same Assignment machinery. They are
 * derived from the host's three free-text buckets on `EventSetup`
 * (`setUpData` / `cleanUpData` / `otherJobsOtherData`), which before B2 were fed to the
 * prompt as advisory context and had no path back into structured rows.
 */

export type TaskBucket = 'set_up' | 'clean_up' | 'other_jobs';

export interface TaskResponse {
  bucket: TaskBucket;
  name: string;
  notes?: string;
}

export interface TaskBucketSpec {
  key: TaskBucket;
  teamName: string;
  emoji: string;
  domain: 'SETUP' | 'CLEANUP' | 'CUSTOM';
}

/**
 * The three buckets in run-sheet order: before the day → during it → after it.
 * `Domain` already carried SETUP and CLEANUP, so J3's run sheet gets its phase grouping
 * without a new column.
 */
export const TASK_BUCKETS: TaskBucketSpec[] = [
  { key: 'set_up', teamName: 'Set up', emoji: '🧹', domain: 'SETUP' },
  { key: 'other_jobs', teamName: 'Other jobs', emoji: '📋', domain: 'CUSTOM' },
  { key: 'clean_up', teamName: 'Clean up', emoji: '🧽', domain: 'CLEANUP' },
];

/** The persisted shape of each other-jobs accordion (GTC-133). */
export type OtherJobsField = { freeText?: string; stillDeciding?: boolean } | null | undefined;

/**
 * A bucket may produce rows only if the host actually wrote something AND has settled on
 * it. The food categories have always honoured `stillDeciding`; before B2 these three
 * never did, because the route cast the JSON to `{ freeText }` and dropped the flag.
 */
export function isBucketEligible(source: OtherJobsField): boolean {
  return Boolean((source?.freeText ?? '').trim()) && source?.stillDeciding !== true;
}

/**
 * Groups the model's `tasks` array into buckets, dropping anything the host did not ask
 * for. Enforced HERE rather than in the prompt: a deterministic server-side filter cannot
 * be talked out of it, so the model cannot invent a bucket the host left blank or is still
 * deciding on.
 */
export function selectTaskRows(
  rawTasks: unknown,
  isEligible: (bucket: TaskBucket) => boolean
): Map<TaskBucket, TaskResponse[]> {
  const grouped = new Map<TaskBucket, TaskResponse[]>();
  if (!Array.isArray(rawTasks)) return grouped;

  for (const raw of rawTasks) {
    const task = raw as Partial<TaskResponse> | null;
    if (!task || typeof task.name !== 'string' || !task.name.trim()) continue;

    const bucket = task.bucket as TaskBucket;
    if (!TASK_BUCKETS.some((b) => b.key === bucket)) continue;
    if (!isEligible(bucket)) continue;

    const list = grouped.get(bucket) ?? [];
    list.push({
      bucket,
      name: task.name.trim(),
      notes: typeof task.notes === 'string' ? task.notes.trim() || undefined : undefined,
    });
    grouped.set(bucket, list);
  }

  return grouped;
}
