// Dismissal reset logic for conflicts
// When inputs referenced by a dismissed conflict change, reopen the conflict

import { prisma } from '@/lib/prisma';
import { Conflict } from '@prisma/client';

interface InputReference {
  type: 'event' | 'item' | 'team' | 'rule';
  id?: string | null;
  field: string;
  valueAtDetection: any;
}

/**
 * Check dismissed conflicts and reopen if their referenced inputs have changed
 * @param eventId - The event to check
 * @returns Array of conflicts that were reopened
 */
export async function checkAndResetDismissedConflicts(eventId: string): Promise<Conflict[]> {
  // Get all dismissed conflicts for this event
  const dismissedConflicts = await prisma.conflict.findMany({
    where: {
      eventId,
      status: 'DISMISSED',
    },
  });

  const reopenedConflicts: Conflict[] = [];

  for (const conflict of dismissedConflicts) {
    const shouldReopen = await shouldResetDismissal(conflict);

    if (shouldReopen.reset) {
      // Reopen the conflict
      const reopened = await prisma.conflict.update({
        where: { id: conflict.id },
        data: {
          status: 'OPEN',
          dismissedAt: null,
        },
      });

      reopenedConflicts.push(reopened);

      console.log(`Reopened conflict ${conflict.id}: ${shouldReopen.reason}`);
    }
  }

  return reopenedConflicts;
}

/**
 * Check if a dismissed conflict should be reopened based on input changes
 */
async function shouldResetDismissal(
  conflict: Conflict
): Promise<{ reset: boolean; reason?: string }> {
  if (!conflict.inputsReferenced) {
    return { reset: false };
  }

  // Safe casting with type guard
  const inputs = Array.isArray(conflict.inputsReferenced)
    ? (conflict.inputsReferenced as unknown as InputReference[])
    : [];

  for (const input of inputs) {
    const currentValue = await getCurrentValue(conflict.eventId, input);

    if (currentValue !== input.valueAtDetection) {
      // Input has changed - reopen the conflict
      const reason = formatChangeReason(input, input.valueAtDetection, currentValue);
      return { reset: true, reason };
    }
  }

  return { reset: false };
}

/**
 * Get the current value of an input reference
 */
async function getCurrentValue(eventId: string, input: InputReference): Promise<any> {
  switch (input.type) {
    case 'event': {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event) return null;
      return getNestedValue(event, input.field);
    }

    case 'item': {
      if (!input.id) return null;
      const item = await prisma.item.findUnique({
        where: { id: input.id },
      });
      if (!item) return null;
      return getNestedValue(item, input.field);
    }

    case 'team': {
      if (!input.id) return null;
      const team = await prisma.team.findUnique({
        where: { id: input.id },
      });
      if (!team) return null;
      return getNestedValue(team, input.field);
    }

    default:
      return null;
  }
}

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue(event, 'venue.ovenCount')
 */
function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return null;
    }
    current = current[part];
  }

  return current;
}

/**
 * Format a human-readable reason for why a conflict was reopened
 */
function formatChangeReason(input: InputReference, oldValue: any, newValue: any): string {
  const fieldName = input.field.split('.').pop() || input.field;

  // Format based on field type
  if (fieldName === 'guestCount') {
    return `Guest count changed (${oldValue} → ${newValue})`;
  }

  if (fieldName.startsWith('dietary')) {
    const dietaryType = fieldName.replace('dietary', '');
    return `${dietaryType} count changed (${oldValue} → ${newValue})`;
  }

  if (fieldName === 'ovenCount') {
    return `Oven count changed (${oldValue} → ${newValue})`;
  }

  if (fieldName === 'serveTime') {
    return `Serve time changed (${oldValue} → ${newValue})`;
  }

  // Generic format
  return `${fieldName} changed (${oldValue} → ${newValue})`;
}
