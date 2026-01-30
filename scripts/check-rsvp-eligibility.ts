import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEligibility() {
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  console.log('Current time:', now.toISOString());
  console.log('48 hours ago:', fortyEightHoursAgo.toISOString());
  console.log('\n');

  // Check all NOT_SURE PersonEvents
  const notSureRecords = await prisma.personEvent.findMany({
    where: {
      rsvpStatus: 'NOT_SURE',
      rsvpFollowupSentAt: null,
    },
    include: {
      person: {
        select: {
          name: true,
          phoneNumber: true,
        },
      },
      event: {
        select: {
          name: true,
          status: true,
        },
      },
    },
  });

  console.log(`Found ${notSureRecords.length} NOT_SURE PersonEvents without followup:\n`);

  for (const pe of notSureRecords) {
    console.log('─────────────────────────────────────');
    console.log(`PersonEvent ID: ${pe.id}`);
    console.log(`Person: ${pe.person.name}`);
    console.log(`Phone: ${pe.person.phoneNumber || 'NULL'}`);
    console.log(`Event: ${pe.event.name}`);
    console.log(`Event Status: ${pe.event.status}`);
    console.log(`RSVP Status: ${pe.rsvpStatus}`);
    console.log(`RSVP Responded At: ${pe.rsvpRespondedAt?.toISOString() || 'NULL'}`);
    console.log(`Followup Sent At: ${pe.rsvpFollowupSentAt?.toISOString() || 'NULL'}`);

    if (pe.rsvpRespondedAt) {
      const age = now.getTime() - pe.rsvpRespondedAt.getTime();
      const hoursOld = age / (60 * 60 * 1000);
      console.log(`Age: ${hoursOld.toFixed(1)} hours`);
      console.log(`Eligible (>48h): ${hoursOld > 48 ? 'YES ✅' : 'NO ❌'}`);
    } else {
      console.log('Age: N/A (rsvpRespondedAt is NULL)');
    }
  }

  console.log('─────────────────────────────────────\n');

  // Now run the actual eligibility query
  const eligible = await prisma.personEvent.findMany({
    where: {
      rsvpStatus: 'NOT_SURE',
      rsvpRespondedAt: {
        not: null,
        lte: fortyEightHoursAgo,
      },
      rsvpFollowupSentAt: null,
      event: {
        status: 'CONFIRMING',
      },
    },
    include: {
      person: {
        select: {
          name: true,
          phoneNumber: true,
        },
      },
      event: {
        select: {
          name: true,
          status: true,
        },
      },
    },
  });

  console.log(`\nEligible for followup (with all filters): ${eligible.length}`);

  if (eligible.length > 0) {
    console.log('\nEligible records:');
    eligible.forEach((pe) => {
      console.log(`- ${pe.person.name} (${pe.id})`);
    });
  }

  await prisma.$disconnect();
}

checkEligibility().catch(console.error);
