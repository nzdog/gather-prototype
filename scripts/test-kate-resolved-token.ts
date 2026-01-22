import { resolveToken } from '../src/lib/auth';

const token = '486803efed95048a4dd783fffe26913f174d8df62f299a427759cc88654defef';

async function test() {
  console.log("🔍 Testing Kate's new coordinator token resolution...\n");
  const result = await resolveToken(token);

  if (!result) {
    console.log('❌ resolveToken returned null');
    process.exit(1);
  }

  console.log('✓ Token resolved successfully!');
  console.log(`  Person: ${result.person.name}`);
  console.log(`  Event: ${result.event.name}`);
  console.log(`  Scope: ${result.scope}`);
  console.log(`  Team: ${result.team?.name || 'NULL'}`);

  // Verify all required fields for coordinator route
  if (result.scope === 'COORDINATOR') {
    if (!result.team) {
      console.log('\n❌ FAIL: COORDINATOR token missing team');
      process.exit(1);
    }
    console.log('\n✓ SUCCESS: Token has all required fields for coordinator route');
  }

  process.exit(0);
}

test().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
