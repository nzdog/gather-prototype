import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { formatPhoneForDisplay } from '@/lib/phone';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  // Invalid/missing auth must return 401, not 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    // If auth throws (should not happen, but fail-closed), return 401
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      days: {
        orderBy: { date: 'asc' },
        take: 1,
      },
      people: {
        include: {
          person: {
            include: {
              assignments: {
                where: {
                  item: {
                    team: {
                      eventId: eventId,
                    },
                  },
                },
                include: {
                  item: {
                    select: { name: true, quantity: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const people = event.people.map((personEvent) => {
    const person = personEvent.person;
    const items = person.assignments.map((a) => {
      const qty = a.item.quantity ? ` (${a.item.quantity})` : '';
      return `${a.item.name}${qty}`;
    });

    // Determine status
    const responses = person.assignments.map((a) => a.response);
    let status: 'confirmed' | 'pending' | 'declined';

    if (responses.length === 0) {
      status = 'pending';
    } else if (responses.every((r) => r === 'ACCEPTED')) {
      status = 'confirmed';
    } else if (responses.some((r) => r === 'DECLINED')) {
      status = 'declined';
    } else {
      status = 'pending';
    }

    return {
      name: person.name,
      items,
      status,
      phone: person.phoneNumber ? formatPhoneForDisplay(person.phoneNumber) : undefined,
      email: person.email || undefined,
    };
  });

  return NextResponse.json({
    eventName: event.name,
    eventDate: event.days[0]?.date
      ? new Date(event.days[0].date).toLocaleDateString('en-NZ', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Date TBD',
    people,
  });
}
