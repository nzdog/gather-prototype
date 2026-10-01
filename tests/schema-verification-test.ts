/**
 * Schema Verification Test
 * Verifies that the SmsOptOut table and relations are correctly set up
 *
 * Run with: npx tsx tests/schema-verification-test.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifySchema() {
  console.log('\n🧪 Schema Verification Test\n');
  console.log('='.repeat(60));

  try {
    // ============================================
    // TEST 1: SmsOptOut table exists and is queryable
    // ============================================
    console.log('\n📋 Test 1: SmsOptOut Table\n');

    const optOutCount = await prisma.smsOptOut.count();
    console.log(`✅ SmsOptOut table exists`);
    console.log(`   Current records: ${optOutCount}`);

    // ============================================
    // TEST 2: No per-host unique — two rows for one number are allowed
    // ============================================
    // ⚠ REWRITTEN BY [[GTC-288]] — founder ruling 2026-09-12: an opt-out is account-wide, on the
    // phone number. `@@unique([phoneNumber, hostId])` is dropped: a number may hold more than one
    // row (a legacy per-host pair, or an opt-out, opt-in and opt-out again), and every reader asks
    // whether ANY in-force row exists. It read "Unique constraint on [phoneNumber, hostId]", and
    // expected the duplicate to be rejected with P2002.
    console.log('\n📋 Test 2: No per-host unique\n');

    // Find or create a test host
    const testHost = await prisma.person.findFirst({
      where: {
        hostedEvents: { some: {} },
      },
      select: { id: true, name: true },
    });

    if (!testHost) {
      console.log('⚠️  No host found, skipping constraint test');
    } else {
      console.log(`Using test host: ${testHost.name} (${testHost.id})`);

      const testPhone = '+64299999999';

      // Clean up any existing, under any host
      await prisma.smsOptOut.deleteMany({ where: { phoneNumber: testPhone } });

      // Create first record
      await prisma.smsOptOut.create({
        data: {
          phoneNumber: testPhone,
          hostId: testHost.id,
          rawMessage: 'STOP (test 1)',
        },
      });
      console.log('✅ Created opt-out record');

      // A second row for the same number is allowed
      try {
        await prisma.smsOptOut.create({
          data: {
            phoneNumber: testPhone,
            hostId: testHost.id,
            rawMessage: 'STOP (test 2)',
          },
        });
        console.log('✅ A second row for the same number was allowed (no per-host unique)');
      } catch (error: any) {
        console.log(
          `❌ A second row for the same number was rejected (${error.code ?? 'unknown error'})`
        );
      }

      // Clean up
      await prisma.smsOptOut.deleteMany({ where: { phoneNumber: testPhone } });
      console.log('✅ Test data cleaned up');
    }

    // ============================================
    // TEST 3: Relations work correctly
    // ============================================
    console.log('\n📋 Test 3: Relations\n');

    if (testHost) {
      // Create opt-out and fetch with relation
      const testPhone2 = '+64288888888';

      // ⚠ [[GTC-288]]: the per-host compound key is gone; the row is found by its id.
      const relationRow = await prisma.smsOptOut.create({
        data: {
          phoneNumber: testPhone2,
          hostId: testHost.id,
          rawMessage: 'STOP (relation test)',
        },
      });

      // Fetch with host relation
      const optOutWithHost = await prisma.smsOptOut.findUnique({
        where: { id: relationRow.id },
        include: {
          host: {
            select: { id: true, name: true },
          },
        },
      });

      if (optOutWithHost && optOutWithHost.host) {
        console.log('✅ SmsOptOut -> Person (host) relation works');
        console.log(`   Host: ${optOutWithHost.host.name}`);
      } else {
        console.log('❌ Relation not working');
      }

      // Fetch from Person side
      const hostWithOptOuts = await prisma.person.findUnique({
        where: { id: testHost.id },
        include: {
          receivedOptOuts: true,
        },
      });

      if (hostWithOptOuts && hostWithOptOuts.receivedOptOuts.length > 0) {
        console.log('✅ Person -> SmsOptOut (receivedOptOuts) relation works');
        console.log(`   Opt-outs for this host: ${hostWithOptOuts.receivedOptOuts.length}`);
      } else {
        console.log('❌ Reverse relation not working');
      }

      // Clean up
      await prisma.smsOptOut.delete({ where: { id: relationRow.id } });
      console.log('✅ Test data cleaned up');
    }

    // ============================================
    // TEST 4: Indexes exist (verify fast lookups)
    // ============================================
    console.log('\n📋 Test 4: Query Performance (Indexes)\n');

    // Create some test data
    if (testHost) {
      const testPhones = ['+64277777771', '+64277777772', '+64277777773'];

      // ⚠ [[GTC-288]]: no per-host compound key to upsert on; any leftover rows for these numbers
      // are cleared first, then one row each is created.
      await prisma.smsOptOut.deleteMany({ where: { phoneNumber: { in: testPhones } } });
      for (const phone of testPhones) {
        await prisma.smsOptOut.create({
          data: {
            phoneNumber: phone,
            hostId: testHost.id,
            rawMessage: 'STOP (index test)',
          },
        });
      }

      // Query by phoneNumber (should use index)
      const start1 = Date.now();
      const byPhone = await prisma.smsOptOut.findMany({
        where: {
          phoneNumber: { in: testPhones },
        },
      });
      const time1 = Date.now() - start1;
      console.log(`✅ Query by phoneNumber: ${byPhone.length} results in ${time1}ms`);

      // Query by hostId (should use index)
      const start2 = Date.now();
      const byHost = await prisma.smsOptOut.findMany({
        where: {
          hostId: testHost.id,
        },
      });
      const time2 = Date.now() - start2;
      console.log(`✅ Query by hostId: ${byHost.length} results in ${time2}ms`);

      // Clean up
      await prisma.smsOptOut.deleteMany({
        where: {
          phoneNumber: { in: testPhones },
          hostId: testHost.id,
        },
      });
      console.log('✅ Test data cleaned up');
    }

    // ============================================
    // TEST 5: A host's deletion keeps the opt-out (SET NULL)
    // ⚠ INVERTED BY [[GTC-288]] (plan ruling D3): an opt-out is the guest's, account-wide, and must
    // outlive the host it was once recorded under. It read "Cascade deletion works".
    // ============================================
    console.log('\n📋 Test 5: Cascade Deletion\n');

    /*
     * ⚠ ALWAYS ITS OWN PERSON — founder ruling, GTC-288, 2026-10-01. This read "find a person who
     * isn't hosting any events (or create one)" and then DELETED whoever it found: any gather_dev
     * Person with no events, memberships or assignments. Two real rows were deleted that way during
     * GTC-288's build (recorded in its Evidence and on GTC-343). It now creates the person it
     * deletes, and deletes only that one, by id.
     */
    const testPerson = await prisma.person.create({
      data: {
        name: `Test Person (Delete Me) ${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
      },
    });
    console.log(`Created test person: ${testPerson.id}`);

    // Create an opt-out for this person as host
    const optOut = await prisma.smsOptOut.create({
      data: {
        phoneNumber: '+64266666666',
        hostId: testPerson.id,
        rawMessage: 'STOP (cascade test)',
      },
    });
    console.log('✅ Created opt-out linked to test person');

    // Delete the person
    await prisma.person.delete({
      where: { id: testPerson.id },
    });
    console.log('✅ Deleted test person');

    // Check the opt-out survived, with its host link set null
    const keptOptOut = await prisma.smsOptOut.findUnique({
      where: {
        id: optOut.id,
      },
    });

    if (keptOptOut && keptOptOut.hostId === null) {
      console.log('✅ The opt-out survives its host’s deletion, with the host link null');
    } else if (!keptOptOut) {
      console.log('❌ The opt-out was deleted with its host (cascade, not SET NULL)');
    } else {
      console.log('❌ The opt-out survived but still names the deleted host');
    }
    // Clean up
    if (keptOptOut) await prisma.smsOptOut.delete({ where: { id: optOut.id } });

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Schema Verification Summary\n');
    console.log('✅ SmsOptOut table exists and is queryable');
    console.log('✅ No per-host unique: a number may hold more than one row');
    console.log('✅ Relations (Person <-> SmsOptOut) work correctly');
    console.log('✅ Indexes provide fast lookups');
    console.log('✅ A host’s deletion keeps the opt-out (host link set null)');
    console.log('\n🎉 Schema is correctly configured!\n');
  } catch (error) {
    console.error('❌ Schema verification failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifySchema().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
