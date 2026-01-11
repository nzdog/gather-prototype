/**
 * Formats drop-off time for display
 *
 * Priority:
 * 1. Human-readable dropOffNote (e.g., "12 noon", "after mains")
 * 2. Computed dropOffAt timestamp (formatted for NZ timezone)
 * 3. null if neither available
 */
export function formatDropOffTime(
  dropOffAt: string | null | undefined,
  dropOffNote: string | null | undefined
): string | null {
  // Prioritize human-readable note
  if (dropOffNote) return dropOffNote;

  // Fall back to formatted timestamp
  if (!dropOffAt) return null;

  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dropOffAt));
}
