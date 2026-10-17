import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import {
  reconcileHouseholdMembers,
  ChannelValidationError,
} from '@/lib/households/reconcileMembers';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';

interface HouseholdMemberInput {
  /** Stable identity of an existing member's PersonEvent (GTC-159); absent = new member. */
  personEventId?: string;
  name?: string;
  email?: string;
  phone?: string;
  /** GTC-172 (C1): explicit adult-roling of a kid with a job (§10.6). Helpers only. */
  adultRoled?: boolean;
}

interface HouseholdRequestBody {
  primaryContact: {
    name: string;
    email?: string;
    phone?: string;
  };
  partner?: HouseholdMemberInput;
  helpers?: Array<HouseholdMemberInput & { name: string }>;
  littleCount?: number;
  guests?: HouseholdMemberInput[];
  /** GTC-172 (C1): the household contact picker (§10.7). null clears it. */
  contactPersonEventId?: string | null;
  /**
   * GTC-256 (Ruling 6): does this household's channel receive messages? `undefined`
   * leaves the current value alone; `null` returns it to "not chosen". Read through
   * resolveHouseholdMuted, never off the column.
   */
  messagesMuted?: boolean | null;
}

// DELETE /api/events/[id]/households/[householdId] - Delete a household
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; householdId: string }> }
) {
  try {
    const { id, householdId } = await context.params;
    const eventId = id;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const household = await prisma.household.findUnique({
      where: { id: householdId },
    });

    if (!household || household.eventId !== eventId) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }

    /*
     * GTC-256 (phase 2) — THE HOST'S HOUSEHOLD CANNOT BE DELETED.
     *
     * Ruling 7 closes the delete risk for an ORDINARY HOUSEHOLD EDIT by construction: a
     * PRIMARY_CONTACT is never in `existingNonPrimary`, so the reconcile's delete loop
     * cannot reach her. THIS IS A DIFFERENT PATH AND THAT REASONING DOES NOT REACH IT —
     * the deleteMany below is keyed on `householdId` and takes the primary with it,
     * cascading her NudgeLog rows and destroying the row phase 2 exists to guarantee.
     * The sequence guarantee on the households POST would then start refusing every
     * further household on the event, which is the correct failure but a baffling one.
     *
     * You cannot remove the host from her own party. If she wants to be alone again she
     * edits the household down to herself (Ruling 2's household of one), which the PUT
     * path does and the demotion guard protects.
     */
    const hostRow = await prisma.personEvent.findFirst({
      where: { householdId, role: 'HOST' },
      select: { id: true },
    });
    if (hostRow) {
      return NextResponse.json(
        {
          error:
            'This is your own household — it cannot be removed. Edit it down to just you if you are hosting alone.',
          code: 'HOST_HOUSEHOLD_UNDELETABLE',
        },
        { status: 409 }
      );
    }

    // Delete PersonEvent records for this household first (no cascade on this relation)
    await prisma.personEvent.deleteMany({
      where: { householdId },
    });

    // Delete the Household record
    await prisma.household.delete({
      where: { id: householdId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/events/[id]/households/[householdId] - Update a household
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; householdId: string }> }
) {
  try {
    const { id, householdId } = await context.params;
    const eventId = id;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body: HouseholdRequestBody = await request.json();
    const { primaryContact, partner, helpers, littleCount, guests, contactPersonEventId } = body;
    const { messagesMuted } = body;

    // Validate primary contact name
    if (!primaryContact?.name?.trim()) {
      return NextResponse.json({ error: 'Primary contact name is required' }, { status: 400 });
    }

    // Validate email format if provided
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allMembers = [
      primaryContact,
      ...(partner ? [partner] : []),
      ...(helpers || []),
      ...(guests || []),
    ];
    for (const member of allMembers) {
      if (member.email && !emailRegex.test(member.email)) {
        return NextResponse.json(
          { error: `Invalid email format: ${member.email}` },
          { status: 400 }
        );
      }
    }

    // Validate helper names (required for kids with jobs)
    if (helpers) {
      for (const helper of helpers) {
        if (!helper.name?.trim()) {
          return NextResponse.json({ error: 'Kid with a job must have a name' }, { status: 400 });
        }
      }
    }

    // Validate littleCount
    if (littleCount !== undefined && (littleCount < 0 || littleCount > 20)) {
      return NextResponse.json(
        { error: 'Kids without jobs count must be between 0 and 20' },
        { status: 400 }
      );
    }

    // Find existing household
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: {
          include: {
            person: true,
          },
        },
      },
    });

    if (!household || household.eventId !== eventId) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }

    // Get event for inviteAnchorAt
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { sentAt: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Find primary contact member
    const primaryMember = household.members.find((m) => m.householdRole === 'PRIMARY_CONTACT');
    if (!primaryMember) {
      return NextResponse.json(
        { error: 'Primary contact not found in household' },
        { status: 500 }
      );
    }

    // Reconcile household members. Diff-based upsert (GTC-159): existing
    // non-primary members are matched by personEventId and updated in place so
    // teamId / RSVP / NudgeLog survive an edit; only removed members are
    // deleted, only new members created. Logic lives in a testable seam.
    // GTC-201 (A3b-2): the reconcile now runs INSIDE a transaction — the correctness
    // fix that has been on record since GTC-159 (b73f140) as its residual risk. A
    // household edit is many dependent writes; a partial failure used to leave it
    // half-reconciled.
    const actor = await ledgerActorForUser(auth.user, auth.role);

    await prisma.$transaction(async (tx) => {
      await reconcileHouseholdMembers(tx, {
        eventId,
        household,
        primaryMember,
        sentAt: event.sentAt,
        input: { primaryContact, partner, helpers, littleCount, guests, contactPersonEventId },
      });

      // GTC-256 (Ruling 6): the household message switch. Written HERE rather than inside
      // reconcileHouseholdMembers on purpose — that file carries the GTC-159 / GTC-172 /
      // GTC-201 incident history, and this write has none of the ordering dependencies
      // that put `contactPersonEventId` inside it (the channel must validate against
      // post-edit roles; a boolean has nothing to validate against). Same transaction, so
      // a failed reconcile does not leave the switch flipped on a household that never
      // took the edit.
      if (messagesMuted !== undefined) {
        await tx.household.update({
          where: { id: householdId },
          data: { messagesMuted },
        });
      }

      // Versioned, never interrogated: editing a household's composition is not an
      // ask moving. Where it removes someone who holds items, that person's
      // assignments are untouched here — the T2 path is
      // DELETE /api/events/[id]/people/[personId], which carries its own entry.
      await recordChange(tx, {
        eventId,
        actor,
        changes: [
          {
            action: 'EDIT_EVENT',
            targetType: 'PersonEvent',
            targetId: household.id,
            before: { memberCount: household.members.length },
            after: { primaryContact: primaryContact.name, littleCount: littleCount ?? 0 },
          },
        ],
      });
    });

    // Fetch the complete updated household
    const result = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ household: result });
  } catch (error: any) {
    // GTC-172 (C1): a rejected contact picker is a bad request, not a server fault.
    // The transaction has already rolled back, so the edit is not half-applied.
    if (error instanceof ChannelValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error updating household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
