/**
 * Debug what's actually rendering in the views
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3002';

async function main() {
  const event = await prisma.event.findFirst({
    where: { name: 'Integration Test Event' },
  });

  if (!event) {
    console.error('❌ Test event not found');
    process.exit(1);
  }

  const tokens = await prisma.accessToken.findMany({
    where: { eventId: event.id },
  });

  const hostToken = tokens.find((t) => t.scope === 'HOST');

  // Fetch host view and show first 2000 characters
  console.log('🔍 HOST VIEW RESPONSE:\n');
  const response = await fetch(`${BASE_URL}/h/${hostToken?.token}`);
  const html = await response.text();

  console.log(`Status: ${response.status}`);
  console.log(`Content-Type: ${response.headers.get('content-type')}`);
  console.log(`Length: ${html.length} characters\n`);

  // Show first 2000 chars
  console.log('First 2000 characters of response:\n');
  console.log(html.substring(0, 2000));
  console.log('\n...\n');

  // Check if it's an error page
  if (html.includes('error') || html.includes('Error')) {
    console.log('⚠️  Response contains "error" or "Error"');
  }

  // Check if it's a Next.js error
  if (html.includes('Application error')) {
    console.log('⚠️  Next.js Application Error detected');
  }

  // Check if it's loading or redirecting
  if (html.includes('Loading') || html.includes('loading')) {
    console.log('ℹ️  Response contains loading state');
  }
}

main()
  .catch((error) => {
    console.error('❌ Debug failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
