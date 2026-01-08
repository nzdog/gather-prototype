import { resolveToken } from '../src/lib/auth';

const token = '6f0c36256a72874ffb2a010159a40823e04874f9b2ef1d5b0f76a81e63359a18';

async function test() {
  console.log('Testing Kate\'s coordinator token...');
  const result = await resolveToken(token);
  console.log('\nResult:', JSON.stringify(result, null, 2));

  if (!result) {
    console.log('\n❌ resolveToken returned null');
  } else {
    console.log('\n✓ Person:', result.person?.name);
    console.log('✓ Event:', result.event?.name);
    console.log('✓ Scope:', result.scope);
    console.log('✓ Team:', result.team?.name || 'NULL');
  }
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
