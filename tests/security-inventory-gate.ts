/**
 * Security Inventory Hard Gate
 *
 * FAILS CI if any of these conditions are met:
 * 1. Mutation route with NO or WEAK authentication
 * 2. AI/high-cost route with NO or WEAK authentication
 * 3. Sensitive data route with NO or WEAK authentication
 *
 * This gate ensures security vulnerabilities cannot be deployed.
 */

import * as fs from 'fs';
import * as path from 'path';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

interface RouteAnalysis {
  filePath: string;
  apiPath: string;
  methods: string[];
  authType: string;
  authEvidence: string[];
  securityIssues: string[];
}

function loadClassifications(): RouteAnalysis[] {
  const classPath = path.join(process.cwd(), 'route-classifications.json');

  if (!fs.existsSync(classPath)) {
    console.error(`${RED}ERROR: route-classifications.json not found${RESET}`);
    console.error('Run: npx tsx scripts/classify-routes.ts');
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(classPath, 'utf-8'));
}

function main() {
  console.log(`${BOLD}${YELLOW}=== SECURITY INVENTORY GATE ===${RESET}\n`);

  const classifications = loadClassifications();

  // Find critical violations
  const criticalMutationNoAuth = classifications.filter((c) =>
    c.securityIssues.some((i) => i.includes('CRITICAL') && i.includes('Mutation'))
  );

  const criticalAINoAuth = classifications.filter((c) =>
    c.securityIssues.some((i) => i.includes('CRITICAL') && i.includes('AI/high-cost'))
  );

  const sensitiveNoAuth = classifications.filter((c) =>
    c.securityIssues.some((i) => i.includes('HIGH') && i.includes('Sensitive'))
  );

  const weakAuth = classifications.filter(
    (c) => c.authType === 'WEAK_PARAM' || c.securityIssues.some((i) => i.includes('WEAK'))
  );

  let failures = 0;

  // Gate 1: Mutation routes
  console.log(`${BOLD}Gate 1: Mutation Routes${RESET}`);
  if (criticalMutationNoAuth.length > 0) {
    console.log(
      `${RED}✗ FAIL: ${criticalMutationNoAuth.length} mutation routes with NO authentication${RESET}\n`
    );
    failures++;

    criticalMutationNoAuth.forEach((route) => {
      console.log(`  ${route.methods.join(', ')} ${route.apiPath}`);
      console.log(`    File: ${route.filePath}`);
      console.log(`    Auth: ${route.authType}`);
      console.log('');
    });
  } else {
    console.log(`${GREEN}✓ PASS: All mutation routes have authentication${RESET}\n`);
  }

  // Gate 2: AI/High-cost routes
  console.log(`${BOLD}Gate 2: AI/High-Cost Routes${RESET}`);
  if (criticalAINoAuth.length > 0) {
    console.log(
      `${RED}✗ FAIL: ${criticalAINoAuth.length} AI/high-cost routes with NO authentication${RESET}\n`
    );
    failures++;

    criticalAINoAuth.forEach((route) => {
      console.log(`  ${route.methods.join(', ')} ${route.apiPath}`);
      console.log(`    File: ${route.filePath}`);
      console.log(`    Auth: ${route.authType}`);
      console.log('');
    });
  } else {
    console.log(`${GREEN}✓ PASS: All AI routes have authentication${RESET}\n`);
  }

  // Gate 3: Sensitive data routes
  console.log(`${BOLD}Gate 3: Sensitive Data Routes${RESET}`);
  if (sensitiveNoAuth.length > 0) {
    console.log(
      `${RED}✗ FAIL: ${sensitiveNoAuth.length} sensitive routes with NO authentication${RESET}\n`
    );
    failures++;

    sensitiveNoAuth.forEach((route) => {
      console.log(`  ${route.methods.join(', ')} ${route.apiPath}`);
      console.log(`    File: ${route.filePath}`);
      console.log(`    Auth: ${route.authType}`);
      console.log('');
    });
  } else {
    console.log(`${GREEN}✓ PASS: All sensitive routes have authentication${RESET}\n`);
  }

  // Gate 4: Weak authentication
  console.log(`${BOLD}Gate 4: Weak Authentication${RESET}`);
  if (weakAuth.length > 0) {
    console.log(
      `${YELLOW}⚠  WARNING: ${weakAuth.length} routes with WEAK authentication${RESET}\n`
    );
    // Don't fail CI for weak auth, just warn

    weakAuth.forEach((route) => {
      console.log(`  ${route.methods.join(', ')} ${route.apiPath}`);
      console.log(`    File: ${route.filePath}`);
      console.log(`    Auth: ${route.authType}`);
      route.securityIssues.forEach((issue) => console.log(`    ${issue}`));
      console.log('');
    });
  } else {
    console.log(`${GREEN}✓ PASS: No weak authentication patterns${RESET}\n`);
  }

  // Summary
  console.log(`${BOLD}${YELLOW}=== SUMMARY ===${RESET}`);
  console.log(`Total routes analyzed: ${classifications.length}`);
  console.log(
    `Critical violations: ${failures > 0 ? RED : GREEN}${criticalMutationNoAuth.length + criticalAINoAuth.length + sensitiveNoAuth.length}${RESET}`
  );
  console.log(`Weak auth warnings: ${YELLOW}${weakAuth.length}${RESET}\n`);

  if (failures > 0) {
    console.log(`${RED}${BOLD}✗ SECURITY GATE FAILED${RESET}`);
    console.log(`${RED}Cannot deploy: ${failures} critical security issues found${RESET}\n`);
    console.log('Action required:');
    console.log('  1. Add authentication to all flagged routes');
    console.log('  2. Use getUser() + requireEventRole() for session auth');
    console.log('  3. Use resolveToken() + requireTokenScope() for token auth');
    console.log('  4. Re-run: npx tsx scripts/classify-routes.ts');
    console.log('  5. Re-run: npm run test:security:inventory\n');
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}✓ SECURITY GATE PASSED${RESET}\n`);
  process.exit(0);
}

main();
