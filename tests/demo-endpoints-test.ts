/**
 * Demo Endpoints Test — GTC-015
 *
 * Asserts:
 * 1. Demo route files do NOT contain the production guard that returns 404
 * 2. Demo seed data exists in DB (event + required persona tokens)
 * 3. The tokens route is scoped to specific demo personas (not all tokens)
 *
 * Run with: npx tsx tests/demo-endpoints-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/prisma';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function logTest(name: string, passed: boolean, message?: string) {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    testsFailed++;
    console.log(`${RED}✗${RESET} ${name}`);
    if (message) {
      console.log(`  ${RED}Error: ${message}${RESET}`);
    }
  }
}

function logSection(title: string) {
  console.log(`\n${BOLD}${YELLOW}${title}${RESET}`);
}

const DEMO_EVENT_NAME = 'Henderson Family Christmas 2025';
const TOKENS_ROUTE = path.join(process.cwd(), 'src/app/api/demo/tokens/route.ts');
const SESSION_ROUTE = path.join(process.cwd(), 'src/app/api/demo/session/route.ts');

const PRODUCTION_GUARD = "process.env.NODE_ENV === 'production'";

async function testSuite1_RouteFileContent() {
  logSection('Test Suite 1: Route Files — Production Guard Removed');

  // Test 1.1: tokens route does not block in production
  try {
    const content = fs.readFileSync(TOKENS_ROUTE, 'utf-8');
    const hasGuard = content.includes(PRODUCTION_GUARD);
    logTest(
      'GET /api/demo/tokens: production guard removed',
      !hasGuard,
      hasGuard ? 'Route still returns 404 in production — guard must be removed' : undefined
    );
  } catch (err: any) {
    logTest('GET /api/demo/tokens: production guard removed', false, err.message);
  }

  // Test 1.2: session route does not block in production
  try {
    const content = fs.readFileSync(SESSION_ROUTE, 'utf-8');
    const hasGuard = content.includes(PRODUCTION_GUARD);
    logTest(
      'POST /api/demo/session: production guard removed',
      !hasGuard,
      hasGuard ? 'Route still returns 404 in production — guard must be removed' : undefined
    );
  } catch (err: any) {
    logTest('POST /api/demo/session: production guard removed', false, err.message);
  }

  // Test 1.3: tokens route is scoped to specific demo personas (not a findMany of all tokens)
  try {
    const content = fs.readFileSync(TOKENS_ROUTE, 'utf-8');
    // The route must target specific demo personas, not return every token in the DB
    const scopedToPersonas =
      content.includes('Sarah Henderson') ||
      content.includes('DEMO_') ||
      content.includes('personName') ||
      content.includes('where:');
    logTest(
      'GET /api/demo/tokens: scoped query (not all tokens)',
      scopedToPersonas,
      scopedToPersonas
        ? undefined
        : 'Route must query specific demo personas, not return all tokens from DB'
    );
  } catch (err: any) {
    logTest('GET /api/demo/tokens: scoped query (not all tokens)', false, err.message);
  }
}

async function testSuite2_DemoSeedData() {
  logSection('Test Suite 2: Demo Seed Data Present in DB');

  // Test 2.1: Demo event exists
  let eventId: string | null = null;
  try {
    const event = await prisma.event.findFirst({
      where: { name: DEMO_EVENT_NAME },
      select: { id: true },
    });
    const exists = event !== null;
    eventId = event?.id ?? null;
    logTest(
      `Demo event "${DEMO_EVENT_NAME}" exists in DB`,
      exists,
      exists ? undefined : 'Demo seed not run — no demo event found'
    );
  } catch (err: any) {
    logTest(`Demo event "${DEMO_EVENT_NAME}" exists in DB`, false, err.message);
  }

  if (!eventId) {
    console.log(`\n${YELLOW}⚠ Skipping token checks — demo event not found${RESET}`);
    return;
  }

  // Test 2.2: Sarah Henderson has a HOST token
  try {
    const token = await prisma.accessToken.findFirst({
      where: {
        scope: 'HOST',
        eventId,
        person: { name: 'Sarah Henderson' },
      },
    });
    const exists = token !== null;
    logTest(
      'Sarah Henderson has HOST token',
      exists,
      exists ? undefined : 'No HOST token found for Sarah Henderson'
    );
  } catch (err: any) {
    logTest('Sarah Henderson has HOST token', false, err.message);
  }

  // Test 2.3: Rob Henderson has a COORDINATOR token
  try {
    const token = await prisma.accessToken.findFirst({
      where: {
        scope: 'COORDINATOR',
        eventId,
        person: { name: 'Rob Henderson' },
      },
    });
    const exists = token !== null;
    logTest(
      'Rob Henderson has COORDINATOR token',
      exists,
      exists ? undefined : 'No COORDINATOR token found for Rob Henderson'
    );
  } catch (err: any) {
    logTest('Rob Henderson has COORDINATOR token', false, err.message);
  }

  // Test 2.4: Emma Henderson has a PARTICIPANT token
  try {
    const token = await prisma.accessToken.findFirst({
      where: {
        scope: 'PARTICIPANT',
        eventId,
        person: { name: 'Emma Henderson' },
      },
    });
    const exists = token !== null;
    logTest(
      'Emma Henderson has PARTICIPANT token',
      exists,
      exists ? undefined : 'No PARTICIPANT token found for Emma Henderson'
    );
  } catch (err: any) {
    logTest('Emma Henderson has PARTICIPANT token', false, err.message);
  }

  // Test 2.5: tokens endpoint returns all 3 required personas
  try {
    const tokens = await prisma.accessToken.findMany({
      where: {
        eventId,
        person: {
          name: { in: ['Sarah Henderson', 'Rob Henderson', 'Emma Henderson'] },
        },
      },
      include: { person: true },
    });
    const hasHost = tokens.some((t) => t.scope === 'HOST' && t.person.name === 'Sarah Henderson');
    const hasCoord = tokens.some(
      (t) => t.scope === 'COORDINATOR' && t.person.name === 'Rob Henderson'
    );
    const hasParticipant = tokens.some(
      (t) => t.scope === 'PARTICIPANT' && t.person.name === 'Emma Henderson'
    );
    const allPresent = hasHost && hasCoord && hasParticipant;
    logTest(
      'All 3 required demo persona tokens present',
      allPresent,
      allPresent
        ? undefined
        : `Missing: ${!hasHost ? 'Sarah HOST' : ''} ${!hasCoord ? 'Rob COORD' : ''} ${!hasParticipant ? 'Emma PARTICIPANT' : ''}`
    );
  } catch (err: any) {
    logTest('All 3 required demo persona tokens present', false, err.message);
  }
}

async function testSuite3_ErrorVisibility() {
  logSection('Test Suite 3: Demo Page Error Visibility');

  // Test 3.1: Demo page has user-facing error handling (no silent failures)
  try {
    const demoPage = fs.readFileSync(path.join(process.cwd(), 'src/app/demo/page.tsx'), 'utf-8');
    // The demo page must show error state when tokens are unavailable
    const hasErrorState =
      demoPage.includes('error') || demoPage.includes('Error') || demoPage.includes('unavailable');
    logTest(
      'Demo page handles unavailable state (no silent failures)',
      hasErrorState,
      hasErrorState ? undefined : 'Demo page has no error/unavailable handling'
    );
  } catch (err: any) {
    logTest('Demo page handles unavailable state (no silent failures)', false, err.message);
  }
}

async function main() {
  console.log(`${BOLD}${YELLOW}=== Demo Endpoints Test — GTC-015 ===${RESET}\n`);

  try {
    await testSuite1_RouteFileContent();
    await testSuite2_DemoSeedData();
    await testSuite3_ErrorVisibility();

    console.log(`\n${BOLD}${YELLOW}=== Test Summary ===${RESET}`);
    console.log(`Total tests: ${testsRun}`);
    console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
    console.log(`${RED}Failed: ${testsFailed}${RESET}`);

    if (testsFailed === 0) {
      console.log(`\n${GREEN}${BOLD}✓ All demo endpoint tests passed!${RESET}`);
      process.exit(0);
    } else {
      console.log(`\n${RED}${BOLD}✗ Some demo endpoint tests failed${RESET}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n${RED}${BOLD}Fatal error:${RESET}`, err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
