import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/events/[id]/households/[householdId]/claim - Member claims their slot
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; householdId: string } }
) {
  try {
    const eventId = params.id;
    const householdId = params.householdId;

    const body = await request.json();
    const { memberId, name, email, phone } = body;

    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }

    // Verify household exists and belongs to this event
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        proxyPerson: true,
        members: true,
      },
    });

    if (!household) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }

    if (household.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Household does not belong to this event' },
        { status: 400 }
      );
    }

    // Find the household member
    const member = household.members.find((m) => m.id === memberId);
    if (!member) {
      return NextResponse.json({ error: 'Household member not found' }, { status: 404 });
    }

    // Check if member is already claimed
    if (member.claimedAt) {
      return NextResponse.json({ error: 'Member slot already claimed' }, { status: 400 });
    }

    // Get proxy PersonEvent to link as proxy
    const proxyPersonEvent = await prisma.personEvent.findUnique({
      where: {
        personId_eventId: {
          personId: household.proxyPersonId,
          eventId,
        },
      },
    });

    if (!proxyPersonEvent) {
      return NextResponse.json(
        { error: 'Proxy person is not part of this event' },
        { status: 400 }
      );
    }

    // Create or find person
    let person;
    if (email) {
      person = await prisma.person.findUnique({ where: { email } });
    }

    const finalName = name || member.name;
    if (!person) {
      // Create new person
      person = await prisma.person.create({
        data: {
          name: finalName,
          email: email || null,
          phoneNumber: phone || null,
        },
      });
    }

    // Check if person already exists in this event
    const existingPersonEvent = await prisma.personEvent.findUnique({
      where: {
        personId_eventId: {
          personId: person.id,
          eventId,
        },
      },
    });

    if (existingPersonEvent) {
      return NextResponse.json({ error: 'Person is already part of this event' }, { status: 400 });
    }

    // Create PersonEvent with PROXY tier
    const personEvent = await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId,
        role: 'PARTICIPANT',
        reachabilityTier: 'PROXY',
        contactMethod: 'NONE',
        proxyPersonEventId: proxyPersonEvent.id,
      },
      include: {
        person: true,
      },
    });

    // Update household member with claim info
    const updatedMember = await prisma.householdMember.update({
      where: { id: memberId },
      data: {
        claimedAt: new Date(),
        personEventId: personEvent.id,
      },
    });

    return NextResponse.json(
      {
        personEvent: {
          id: personEvent.id,
          personId: personEvent.person.id,
          name: personEvent.person.name,
          email: personEvent.person.email,
          phone: personEvent.person.phoneNumber,
          role: personEvent.role,
          reachabilityTier: personEvent.reachabilityTier,
          contactMethod: personEvent.contactMethod,
          proxyPersonEventId: personEvent.proxyPersonEventId,
        },
        member: updatedMember,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error claiming household member:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
