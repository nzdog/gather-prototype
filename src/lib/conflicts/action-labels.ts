/**
 * Human-readable labels for conflict suggestion action type codes.
 *
 * Enumerated from src/lib/ai/check.ts (GTC-007).
 * Add new entries here whenever a new action code is introduced in check.ts.
 */
export const ACTION_LABELS: Record<string, string> = {
  specify_quantities: 'Specify quantities for critical items',
  adjust_timing: 'Adjust timing to resolve equipment conflict',
  add_items: 'Add items to your plan',
  add_teams: 'Add teams to your plan',
  assign_coordinator: 'Assign a coordinator to this team',
};

/**
 * Returns the human-readable label for a suggestion action code.
 * Falls back to a formatted version of the raw code if unmapped.
 */
export function getActionLabel(action: string | undefined): string {
  if (!action) return 'No action specified';
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}
