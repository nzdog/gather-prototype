// POST /api/events/[id]/conflicts/[conflictId]/acknowledge - Acknowledge Critical conflict
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MitigationPlanType } from '@prisma/client';

interface AcknowledgeRequest {
  impactStatement: string;
  impactUnderstood: boolean;
  mitigationPlanType: MitigationPlanType;
  acknowledgedBy: string; // Host ID
  alternativesConsidered?: 'NONE' | 'REVIEWED' | 'ATTEMPTED';
  visibility?: {
    cohosts: boolean;
    coordinators: 'relevant_only' | 'all' | 'none';
    participants: boolean;
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; conflictId: string }> }
) {
  try {
    const { id: eventId, conflictId } = await context.params;
    const body: AcknowledgeRequest = await request.json();

    // Verify conflict exists and belongs to event
    const conflict = await prisma.conflict.findUnique({
      where: { id: conflictId },
      include: {
        acknowledgements: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!conflict) {
      return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });
    }

    if (conflict.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Conflict does not belong to this event' },
        { status: 403 }
      );
    }

    // Verify conflict is Critical severity
    if (conflict.severity !== 'CRITICAL') {
      return NextResponse.json(
        { error: 'Only Critical conflicts can be acknowledged' },
        { status: 400 }
      );
    }

    // Validate impactStatement
    if (!body.impactStatement || body.impactStatement.trim().length < 10) {
      return NextResponse.json(
        { error: 'Impact statement must be at least 10 characters' },
        { status: 400 }
      );
    }

    // Validate impactStatement references affected party or action
    const hasReference =
      // Check for party references (guest, vegetarian, etc.)
      /guest|vegetarian|vegan|gluten|dairy|participant|coordinator|person|people/i.test(
        body.impactStatement
      ) ||
      // Check for action words (communicate, substitute, etc.)
      /communicate|notify|inform|substitute|replace|reassign|provide|bring|cater|accept|gap|external/i.test(
        body.impactStatement
      );

    if (!hasReference) {
      return NextResponse.json(
        {
          error: 'Impact statement must reference affected parties or mitigation action',
          hint: 'Mention who is affected (e.g., "vegetarian guests") or what action you will take (e.g., "communicate with guests", "provide substitute")',
        },
        { status: 400 }
      );
    }

    // Validate impactUnderstood is true
    if (body.impactUnderstood !== true) {
      return NextResponse.json(
        { error: 'You must confirm that you understand the impact' },
        { status: 400 }
      );
    }

    // Validate mitigationPlanType
    const validMitigationTypes: MitigationPlanType[] = [
      'SUBSTITUTE',
      'REASSIGN',
      'COMMUNICATE',
      'ACCEPT_GAP',
      'EXTERNAL_CATERING',
      'BRING_OWN',
      'OTHER',
    ];

    if (!validMitigationTypes.includes(body.mitigationPlanType)) {
      return NextResponse.json({ error: 'Invalid mitigation plan type' }, { status: 400 });
    }

    // Default visibility settings
    const visibility = body.visibility || {
      cohosts: true,
      coordinators: 'relevant_only',
      participants: false,
    };

    // If there's an existing active acknowledgement, supersede it
    let supersedesAcknowledgementId: string | null = null;
    if (conflict.acknowledgements.length > 0) {
      const activeAcknowledgement = conflict.acknowledgements[0];
      supersedesAcknowledgementId = activeAcknowledgement.id;

      // Mark old acknowledgement as superseded
      await prisma.acknowledgement.update({
        where: { id: activeAcknowledgement.id },
        data: { status: 'SUPERSEDED' },
      });
    }

    // Create new acknowledgement
    const acknowledgement = await prisma.acknowledgement.create({
      data: {
        conflictId,
        eventId,
        acknowledgedAt: new Date(),
        acknowledgedBy: body.acknowledgedBy,
        impactStatement: body.impactStatement.trim(),
        impactUnderstood: body.impactUnderstood,
        mitigationPlanType: body.mitigationPlanType,
        affectedParties: conflict.affectedParties || [],
        alternativesConsidered: body.alternativesConsidered || 'NONE',
        visibilityCohosts: visibility.cohosts,
        visibilityCoordinators: visibility.coordinators,
        visibilityParticipants: visibility.participants,
        supersedesAcknowledgementId,
        status: 'ACTIVE',
      },
    });

    // Update conflict status to acknowledged
    const updatedConflict = await prisma.conflict.update({
      where: { id: conflictId },
      data: {
        status: 'ACKNOWLEDGED',
      },
    });

    return NextResponse.json({
      acknowledgement,
      conflict: updatedConflict,
    });
  } catch (error) {
    console.error('Error acknowledging conflict:', error);
    return NextResponse.json({ error: 'Failed to acknowledge conflict' }, { status: 500 });
  }
}
