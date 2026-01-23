import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { NameSelectionClient } from './NameSelectionClient';

interface Props {
  params: { token: string };
}

export default async function SharedLinkPage({ params }: Props) {
  const { token } = params;

  // Find event by shared link token
  const event = await prisma.event.findFirst({
    where: {
      sharedLinkToken: token,
      sharedLinkEnabled: true,
    },
    select: {
      id: true,
      name: true,
      status: true,
      hostId: true,
      host: {
        select: { name: true },
      },
      people: {
        select: {
          id: true,
          person: {
            select: {
              id: true,
              name: true,
              tokens: {
                where: { scope: 'PARTICIPANT' },
                select: {
                  id: true,
                  token: true,
                  claimedAt: true,
                },
              },
              assignments: {
                take: 1,
                select: {
                  item: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Invalid or disabled token
  if (!event) {
    notFound();
  }

  // Check event status
  if (event.status !== 'CONFIRMING' && event.status !== 'FROZEN') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Not Ready</h1>
          <p className="text-gray-600">
            This event is not accepting responses yet. Please check back later or contact{' '}
            {event.host?.name || 'the host'}.
          </p>
        </div>
      </div>
    );
  }

  // Prepare people data for client component
  const peopleData = event.people.map((pe) => ({
    id: pe.person.id,
    name: pe.person.name,
    isClaimed: !!pe.person.tokens[0]?.claimedAt,
    // Use first assigned item as disambiguator for duplicate names
    firstItem: pe.person.assignments[0]?.item?.name || null,
  }));

  // Identify duplicate names
  const nameCounts = new Map<string, number>();
  peopleData.forEach((p) => {
    const lowerName = p.name.toLowerCase().trim();
    nameCounts.set(lowerName, (nameCounts.get(lowerName) || 0) + 1);
  });

  const peopleWithFlags = peopleData.map((p) => ({
    ...p,
    hasDuplicate: (nameCounts.get(p.name.toLowerCase().trim()) || 0) > 1,
  }));

  return (
    <NameSelectionClient
      eventId={event.id}
      eventName={event.name}
      eventToken={token}
      hostName={event.host?.name || 'the host'}
      people={peopleWithFlags}
    />
  );
}
