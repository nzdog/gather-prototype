'use client';

import { useMemo } from 'react';

interface Event {
  id: string;
  guestCount: number | null;
  lastCheckPlanAt: string | null;
  hostId: string;
}

interface Person {
  id: string;
  personId: string;
}

interface Team {
  id: string;
}

export interface SetupStep {
  number: number;
  label: string;
  complete: boolean;
  action: () => void;
}

export interface SetupProgress {
  steps: SetupStep[];
  completedCount: number;
  totalSteps: number;
  allComplete: boolean;
  nextStep: SetupStep | null;
}

interface UseEventSetupProgressParams {
  event: Event | null;
  people: Person[];
  teams: Team[];
  onOpenEditDetails: () => void;
  onOpenAddPerson: () => void;
  onOpenCreatePlan: () => void;
  onRunPlanCheck: () => void;
}

export function useEventSetupProgress({
  event,
  people,
  teams,
  onOpenEditDetails,
  onOpenAddPerson,
  onOpenCreatePlan,
  onRunPlanCheck,
}: UseEventSetupProgressParams): SetupProgress {
  const progress = useMemo(() => {
    if (!event) {
      // Return empty progress if no event
      const emptySteps: SetupStep[] = [
        { number: 1, label: 'Create event', complete: false, action: () => {} },
        { number: 2, label: 'Add event details', complete: false, action: () => {} },
        { number: 3, label: 'Add people', complete: false, action: () => {} },
        { number: 4, label: 'Create your plan', complete: false, action: () => {} },
        { number: 5, label: 'Run plan check', complete: false, action: () => {} },
      ];
      return {
        steps: emptySteps,
        completedCount: 0,
        totalSteps: 5,
        allComplete: false,
        nextStep: emptySteps[0],
      };
    }

    const steps: SetupStep[] = [
      {
        number: 1,
        label: 'Create event',
        complete: true, // Always true - they're on this page
        action: () => {}, // No action for completed step
      },
      {
        number: 2,
        label: 'Add event details',
        complete: event.guestCount != null && event.guestCount > 0,
        action: onOpenEditDetails,
      },
      {
        number: 3,
        label: 'Add people',
        complete: people.filter((p) => p.personId !== event.hostId).length > 0,
        action: onOpenAddPerson,
      },
      {
        number: 4,
        label: 'Create your plan',
        complete: teams.length > 0,
        action: onOpenCreatePlan,
      },
      {
        number: 5,
        label: 'Run plan check',
        complete: event.lastCheckPlanAt != null,
        action: onRunPlanCheck,
      },
    ];

    const completedCount = steps.filter((s) => s.complete).length;
    const allComplete = completedCount === steps.length;
    const nextStep = steps.find((s) => !s.complete) || null;

    return {
      steps,
      completedCount,
      totalSteps: steps.length,
      allComplete,
      nextStep,
    };
  }, [event, people, teams, onOpenEditDetails, onOpenAddPerson, onOpenCreatePlan, onRunPlanCheck]);

  return progress;
}
