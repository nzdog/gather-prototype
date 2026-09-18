/**
 * Auto-assign people-to-team distribution.
 *
 * Extracted from the auto-assign route (GTC-171/B2) so the placement rule can be asserted
 * directly — `requireEventRole` reads a session cookie, so the host route cannot be driven
 * in-process (see tests/security-validation.ts:454).
 */

export interface TeamDistribution {
  teamId: string;
  teamName: string;
  memberCount: number;
  /** Count of `kind: 'ITEM'` rows only — task rows do not make a team assignable. */
  itemCount: number;
}

export interface AutoAssignParticipant {
  personId: string;
  personName: string;
}

export interface AutoAssignPlacement {
  personId: string;
  personName: string;
  teamId: string;
  teamName: string;
  reason: string;
}

/**
 * Places each unassigned participant on the team with the fewest members.
 *
 * Returns [] when there is no eligible team, which the caller must treat as "assign nobody"
 * rather than as an error.
 */
export function computeAutoAssignments(
  teams: TeamDistribution[],
  participants: AutoAssignParticipant[]
): AutoAssignPlacement[] {
  // GTC-171 (B2): task teams hold only TASK rows and have no members by construction, so
  // they are always the lowest-member target and would capture the first participants
  // through the door. `PersonEvent.teamId` is singular, so anyone parked on a task team
  // can never be assigned a food item again — strand them here and nothing reports it.
  const distributions = teams.filter((t) => t.itemCount > 0).map((t) => ({ ...t }));

  if (distributions.length === 0) return [];

  const placements: AutoAssignPlacement[] = [];

  for (const participant of participants) {
    // Find team with fewest members (even distribution)
    const targetTeam = distributions.reduce((lowest, current) =>
      current.memberCount < lowest.memberCount ? current : lowest
    );

    placements.push({
      personId: participant.personId,
      personName: participant.personName,
      teamId: targetTeam.teamId,
      teamName: targetTeam.teamName,
      reason: `Even distribution (${targetTeam.memberCount} members before assignment)`,
    });

    // Update member count for next iteration
    targetTeam.memberCount += 1;
  }

  return placements;
}
