import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRsvpTest() {
  console.log('🌱 Seeding RSVP test data for Ticket 2.2...\n');

  try {
    // 1. Find or create test person
    let testPerson = await prisma.person.findFirst({
      where: { email: 'testguest@example.com' },
    });

    if (!testPerson) {
      console.log('Creating Test Guest person...');
      testPerson = await prisma.person.create({
        data: {
          name: 'Test Guest',
          email: 'testguest@example.com',
          phone: '+12025551234',
          phoneNumber: '+12025551234',
        },
      });
      console.log(`✅ Created person: ${testPerson.name} (${testPerson.id})\n`);
    } else {
      console.log(`✅ Found existing person: ${testPerson.name} (${testPerson.id})\n`);
    }

    // 2. Find an event in CONFIRMING status (or any event)
    let event = await prisma.event.findFirst({
      where: {
        status: 'CONFIRMING',
        archived: false,
      },
      include: {
        host: true,
      },
    });

    if (!event) {
      console.log('No CONFIRMING event found, looking for any active event...');
      event = await prisma.event.findFirst({
        where: { archived: false },
        include: { host: true },
      });
    }

    if (!event) {
      console.log('❌ No events found in database. Please create an event first.');
      process.exit(1);
    }

    console.log(`✅ Using event: "${event.name}" (${event.id})`);
    console.log(`   Host: ${event.host.name}`);
    console.log(`   Status: ${event.status}\n`);

    // 3. Find or create PersonEvent
    let personEvent = await prisma.personEvent.findFirst({
      where: {
        personId: testPerson.id,
        eventId: event.id,
      },
    });

    const fortyNineHoursAgo = new Date(Date.now() - 49 * 60 * 60 * 1000);

    if (!personEvent) {
      console.log('Creating PersonEvent...');
      personEvent = await prisma.personEvent.create({
        data: {
          personId: testPerson.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          reachabilityTier: 'DIRECT',
          contactMethod: 'SMS',
          rsvpStatus: 'NOT_SURE',
          rsvpRespondedAt: fortyNineHoursAgo,
          rsvpFollowupSentAt: null,
        },
      });
      console.log(`✅ Created PersonEvent (${personEvent.id})\n`);
    } else {
      console.log('Updating existing PersonEvent...');
      personEvent = await prisma.personEvent.update({
        where: { id: personEvent.id },
        data: {
          role: 'PARTICIPANT',
          reachabilityTier: 'DIRECT',
          contactMethod: 'SMS',
          rsvpStatus: 'NOT_SURE',
          rsvpRespondedAt: fortyNineHoursAgo,
          rsvpFollowupSentAt: null,
        },
      });
      console.log(`✅ Updated PersonEvent (${personEvent.id})\n`);
    }

    console.log('PersonEvent details:');
    console.log(`   - RSVP Status: ${personEvent.rsvpStatus}`);
    console.log(`   - RSVP Responded At: ${personEvent.rsvpRespondedAt}`);
    console.log(`   - Contact Method: ${personEvent.contactMethod}`);
    console.log(`   - Followup Sent At: ${personEvent.rsvpFollowupSentAt || 'NULL'}\n`);

    // 4. Find or create AccessToken for participant link
    let token = await prisma.accessToken.findFirst({
      where: {
        personId: testPerson.id,
        eventId: event.id,
        scope: 'PARTICIPANT',
      },
    });

    if (!token) {
      console.log('Creating participant access token...');
      token = await prisma.accessToken.create({
        data: {
          token: `test-participant-${Date.now()}`,
          scope: 'PARTICIPANT',
          personId: testPerson.id,
          eventId: event.id,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      });
      console.log(`✅ Created access token\n`);
    } else {
      console.log(`✅ Found existing access token\n`);
    }

    // 5. Output summary
    console.log('═══════════════════════════════════════════════════');
    console.log('📋 TEST DATA READY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Person: ${testPerson.name}`);
    console.log(`Phone: ${testPerson.phoneNumber}`);
    console.log(`Event: ${event.name}`);
    console.log(`RSVP Status: ${personEvent.rsvpStatus}`);
    console.log(`RSVP Responded: ${fortyNineHoursAgo.toISOString()} (49h ago)`);
    console.log(`Followup Sent: ${personEvent.rsvpFollowupSentAt || 'NULL'}`);
    console.log('───────────────────────────────────────────────────');
    console.log(`🔗 Participant Link: http://localhost:3000/p/${token.token}`);
    console.log('───────────────────────────────────────────────────');
    console.log(`PersonEvent ID: ${personEvent.id}`);
    console.log(`Token: ${token.token}`);
    console.log('═══════════════════════════════════════════════════\n');

    console.log('Next steps:');
    console.log('1. Run: curl -X POST http://localhost:3000/api/cron/nudges');
    console.log('2. Check that rsvpFollowupSentAt is now set');
    console.log('3. Open the participant link to verify Yes/No only UI\n');
  } catch (error) {
    console.error('Error seeding test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedRsvpTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
