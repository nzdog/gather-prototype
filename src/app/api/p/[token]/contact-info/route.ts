import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizePhoneNumber } from '@/lib/phone';

/**
 * PATCH /api/p/[token]/contact-info
 *
 * Allows participants to add their contact information (email or phone).
 * When contact info is added, upgrades reachabilityTier from SHARED to DIRECT.
 */
export async function PATCH(request: NextRequest, { params }: { params: { token: string } }) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Parse request body
  let body: { email?: string; phoneNumber?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, phoneNumber } = body;

  // Validate that at least one contact method is provided
  if (!email && !phoneNumber) {
    return NextResponse.json(
      { error: 'Either email or phoneNumber must be provided' },
      { status: 400 }
    );
  }

  // Prepare update data
  const personUpdateData: Record<string, unknown> = {};
  let contactMethod: 'EMAIL' | 'SMS' | 'NONE' = 'NONE';

  if (email) {
    personUpdateData.email = email;
    contactMethod = 'EMAIL';
  }

  if (phoneNumber) {
    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }
    personUpdateData.phoneNumber = normalized;
    contactMethod = 'SMS'; // SMS takes precedence over email if both are provided
  }

  // Update person and PersonEvent in a transaction
  await prisma.$transaction(async (tx) => {
    // Update Person with new contact info
    await tx.person.update({
      where: { id: context.person.id },
      data: personUpdateData,
    });

    // Update PersonEvent to upgrade reachability tier
    await tx.personEvent.update({
      where: {
        personId_eventId: {
          personId: context.person.id,
          eventId: context.event.id,
        },
      },
      data: {
        reachabilityTier: 'DIRECT',
        contactMethod,
      },
    });
  });

  return NextResponse.json({
    success: true,
    reachabilityTier: 'DIRECT',
    contactMethod,
  });
}
