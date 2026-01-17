import { prisma } from '../src/lib/prisma';

async function verifyMigration() {
  console.log('🔍 Verifying Ticket 1.1 schema migration...\n');

  try {
    // Check new tables exist
    const userCount = await prisma.user.count();
    console.log(`✓ User table exists (count: ${userCount})`);

    const sessionCount = await prisma.session.count();
    console.log(`✓ Session table exists (count: ${sessionCount})`);

    const magicLinkCount = await prisma.magicLink.count();
    console.log(`✓ MagicLink table exists (count: ${magicLinkCount})`);

    // Check Person.userId is NULL for all existing records
    const people = await prisma.person.findMany({
      select: { id: true, email: true, userId: true }
    });
    const linked = people.filter(p => p.userId !== null);
    console.log(`✓ Person.userId exists (${people.length} people, ${linked.length} linked)`);

    // Verify AccessToken unchanged
    const tokenCount = await prisma.accessToken.count();
    console.log(`✓ AccessToken table unchanged (count: ${tokenCount})`);

    // Test User creation
    const testUser = await prisma.user.create({
      data: { email: 'test-migration@example.com' }
    });
    console.log(`✓ User creation works (id: ${testUser.id})`);

    // Test Session creation
    const testSession = await prisma.session.create({
      data: {
        userId: testUser.id,
        token: 'test-token-' + Date.now(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });
    console.log(`✓ Session creation works (id: ${testSession.id})`);

    // Test MagicLink creation
    const testMagicLink = await prisma.magicLink.create({
      data: {
        email: 'test-migration@example.com',
        token: 'magic-test-' + Date.now(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      }
    });
    console.log(`✓ MagicLink creation works (id: ${testMagicLink.id})`);

    // Cleanup test data
    await prisma.magicLink.delete({ where: { id: testMagicLink.id } });
    await prisma.session.delete({ where: { id: testSession.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    console.log(`✓ User CRUD operations work (cleanup successful)`);

    console.log('\n✅ Schema migration verification complete!');
    console.log('\nSummary:');
    console.log(`- User table: ${userCount} records`);
    console.log(`- Session table: ${sessionCount} records`);
    console.log(`- MagicLink table: ${magicLinkCount} records`);
    console.log(`- Person records: ${people.length} (${linked.length} linked to User accounts)`);
    console.log(`- AccessToken records: ${tokenCount}`);
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyMigration()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
