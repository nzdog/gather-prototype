import { NextResponse } from 'next/server';
import { sendSms } from '@/lib/sms/send-sms';
import { prisma } from '@/lib/prisma';

/**
 * Test endpoint to send SMS to verified number
 * Access: POST http://localhost:3000/api/sms/test-send
 * Body: { "to": "+64226667629" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phoneNumber = body.to || '+64226667629';

    // Get a test event and person
    const event = await prisma.event.findFirst({
      where: { status: 'CONFIRMING' },
      include: {
        people: {
          include: { person: true },
          take: 1,
        },
      },
    });

    if (!event || !event.people.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'No test event found. Create an event in CONFIRMING status first.',
        },
        { status: 404 }
      );
    }

    const person = event.people[0].person;

    // Send SMS
    const result = await sendSms({
      to: phoneNumber,
      message: 'Test from Gather - SMS infrastructure is working! 🎉 Reply STOP to test opt-out.',
      eventId: event.id,
      personId: person.id,
      metadata: {
        test: true,
        testType: 'api_endpoint',
      },
    });

    // Get recent SMS events
    const recentEvents = await prisma.inviteEvent.findMany({
      where: {
        eventId: event.id,
        type: {
          in: ['NUDGE_SENT_AUTO', 'SMS_SEND_FAILED', 'SMS_BLOCKED_INVALID', 'SMS_BLOCKED_OPT_OUT'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    return NextResponse.json({
      ...result,
      phoneNumber,
      eventId: event.id,
      personId: person.id,
      recentEvents: recentEvents.map((e) => ({
        type: e.type,
        createdAt: e.createdAt,
        metadata: e.metadata,
      })),
    });
  } catch (error) {
    console.error('SMS test send error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint shows instructions
 */
export async function GET() {
  return NextResponse.json({
    message: 'SMS Test Send Endpoint',
    usage: 'POST to this endpoint with: { "to": "+64226667629" }',
    example:
      'curl -X POST http://localhost:3000/api/sms/test-send -H "Content-Type: application/json" -d \'{"to":"+64226667629"}\'',
  });
}
