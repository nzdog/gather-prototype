import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatPhoneForDisplay } from '@/lib/phone';

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);
  if (!resolvedContext || resolvedContext.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const eventId = resolvedContext.event.id;

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
                      eventId,
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

    // GTC-174 (D1): 'maybe' is its own line in the export. Same precedence as the
    // /api/h/[token] and invite-status rollups — MAYBE above DECLINED, all-accepted
    // wins outright — so the printed sheet cannot disagree with the screen.
    const responses = person.assignments.map((a) => a.response);
    let status: 'confirmed' | 'pending' | 'declined' | 'maybe';

    if (responses.length === 0) {
      status = 'pending';
    } else if (responses.every((r) => r === 'ACCEPTED')) {
      status = 'confirmed';
    } else if (responses.some((r) => r === 'DECLINED')) {
      status = 'declined';
    } else if (responses.some((r) => r === 'MAYBE')) {
      status = 'maybe';
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
