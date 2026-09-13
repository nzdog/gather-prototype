/**
 * Dietary three-state model (GTC-150).
 *
 * The dietary surface distinguishes three states so that "host skipped the
 * section" is never conflated with "host confirmed there are no dietary
 * requirements" — a safety-adjacent distinction for a food coordination app.
 */

export type DietaryStatus = 'unanswered' | 'confirmed_none' | 'confirmed_needs';

export interface DietaryData {
  status: DietaryStatus;
  /** Populated only when status === 'confirmed_needs' */
  requirements: string[];
  /** Populated only when status === 'confirmed_needs' */
  other?: string;
}

/**
 * The dietary needs Kate can tick. Moved here from Moment2Step1Modal's local const by
 * GTC-188 (I1) so the pre-flight's re-verify offers the SAME vocabulary the capture
 * screen wrote — two copies of a list that must match is the GTC-151 shape.
 */
export const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-free',
  'Dairy-free',
  'Nut allergy',
] as const;

export const DIETARY_STATUSES: DietaryStatus[] = [
  'unanswered',
  'confirmed_none',
  'confirmed_needs',
];

/**
 * Normalize a persisted dietaryData Json value (legacy or current shape) into
 * the three-state shape.
 *
 * Legacy rows ({ requirements, other } with no status) predate the model:
 * empty data reads as 'unanswered' (safest — the host never confirmed),
 * populated data reads as 'confirmed_needs'.
 *
 * Incoherent stored combinations are coerced safety-first: a 'confirmed_needs'
 * with nothing listed downgrades to 'unanswered'; a 'confirmed_none' that
 * nevertheless lists needs upgrades to 'confirmed_needs' (stated needs win).
 */
export function readDietaryData(raw: unknown): DietaryData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'unanswered', requirements: [] };
  }
  const r = raw as { status?: unknown; requirements?: unknown; other?: unknown };
  const requirements = Array.isArray(r.requirements)
    ? r.requirements.filter((x): x is string => typeof x === 'string')
    : [];
  const other = typeof r.other === 'string' && r.other.trim() ? r.other.trim() : undefined;
  const hasNeeds = requirements.length > 0 || other !== undefined;

  const status =
    typeof r.status === 'string' && (DIETARY_STATUSES as string[]).includes(r.status)
      ? (r.status as DietaryStatus)
      : undefined;

  if (status === 'confirmed_none') {
    return hasNeeds
      ? { status: 'confirmed_needs', requirements, other }
      : { status: 'confirmed_none', requirements: [] };
  }
  if (status === 'confirmed_needs') {
    return hasNeeds
      ? { status: 'confirmed_needs', requirements, other }
      : { status: 'unanswered', requirements: [] };
  }
  if (status === 'unanswered') {
    // Data present under 'unanswered' shouldn't happen; honor the data.
    return hasNeeds
      ? { status: 'confirmed_needs', requirements, other }
      : { status: 'unanswered', requirements: [] };
  }

  // Legacy shape (no status key): infer from content.
  return hasNeeds
    ? { status: 'confirmed_needs', requirements, other }
    : { status: 'unanswered', requirements: [] };
}

/**
 * Validate a client-submitted dietaryData value. Returns an error string for
 * invalid combinations, or null when acceptable. Missing status is allowed
 * (legacy writers); readDietaryData infers on read.
 */
export function validateDietaryData(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    return 'dietaryData must be an object';
  }
  const v = value as { status?: unknown; requirements?: unknown; other?: unknown };
  if (
    v.requirements !== undefined &&
    (!Array.isArray(v.requirements) || v.requirements.some((x) => typeof x !== 'string'))
  ) {
    return 'dietaryData.requirements must be an array of strings';
  }
  if (v.other !== undefined && typeof v.other !== 'string') {
    return 'dietaryData.other must be a string';
  }
  if (v.status === undefined) return null;
  if (typeof v.status !== 'string' || !(DIETARY_STATUSES as string[]).includes(v.status)) {
    return `dietaryData.status must be one of: ${DIETARY_STATUSES.join(', ')}`;
  }
  const requirements = Array.isArray(v.requirements) ? v.requirements : [];
  const hasNeeds =
    requirements.length > 0 || (typeof v.other === 'string' && v.other.trim() !== '');
  if (v.status === 'confirmed_none' && hasNeeds) {
    return "dietaryData.status 'confirmed_none' cannot carry requirements or other text";
  }
  if (v.status === 'confirmed_needs' && !hasNeeds) {
    return "dietaryData.status 'confirmed_needs' requires at least one requirement or other text";
  }
  if (v.status === 'unanswered' && hasNeeds) {
    return "dietaryData.status 'unanswered' cannot carry requirements or other text";
  }
  return null;
}
