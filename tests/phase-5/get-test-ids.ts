import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getTestIds() {
  try {
    // Get a host
    const host = await prisma.person.findFirst({
      where: {
        hostedEvents: {
          some: {}
        }
      }
    });

    if (!host) {
      console.error('No host found in database');
      process.exit(1);
    }

    // Get an event (preferably COMPLETE or CONFIRMING)
    const event = await prisma.event.findFirst({
      where: {
        hostId: host.id,
        status: {
          in: ['COMPLETE', 'CONFIRMING', 'FROZEN']
        }
      },
      include: {
        teams: {
          include: {
            items: true
          }
        }
      }
    });

    if (!event) {
      // Try any event
      const anyEvent = await prisma.event.findFirst({
        where: { hostId: host.id },
        include: {
          teams: {
            include: {
              items: true
            }
          }
        }
      });

      if (anyEvent) {
        console.log('WARNING: Using a non-completed event for testing');
        console.log(JSON.stringify({
          hostId: host.id,
          hostName: host.name,
          eventId: anyEvent.id,
          eventName: anyEvent.name,
          eventStatus: anyEvent.status,
          teamCount: anyEvent.teams.length,
          itemCount: anyEvent.teams.reduce((sum, t) => sum + t.items.length, 0)
        }, null, 2));
        process.exit(0);
      }

      console.error('No events found for host');
      process.exit(1);
    }

    console.log(JSON.stringify({
      hostId: host.id,
      hostName: host.name,
      eventId: event.id,
      eventName: event.name,
      eventStatus: event.status,
      teamCount: event.teams.length,
      itemCount: event.teams.reduce((sum, t) => sum + t.items.length, 0)
    }, null, 2));

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

getTestIds();
