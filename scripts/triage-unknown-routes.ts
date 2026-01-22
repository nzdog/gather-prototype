/**
 * UNKNOWN Routes Triage Script
 *
 * Analyzes SECURITY_ROUTE_INVENTORY.md to categorize UNKNOWN routes by risk level:
 * - MUTATION: POST/PATCH/PUT/DELETE routes
 * - HIGH_COST: AI generation/check/suggest routes
 * - SENSITIVE_READ: Routes returning PII/private event data
 * - ADMIN: Auth/billing/memory/template routes
 */

import * as fs from 'fs';
import * as path from 'path';

interface RouteRow {
  path: string;
  method: string;
  mutation: boolean;
  authType: string;
  requiredRoles: string;
  teamScoped: boolean;
  frozenRule: string;
  filePath: string;
}

interface TriageResult {
  mutation: RouteRow[];
  highCost: RouteRow[];
  sensitiveRead: RouteRow[];
  admin: RouteRow[];
  lowRisk: RouteRow[];
}

function parseInventory(inventoryPath: string): RouteRow[] {
  const content = fs.readFileSync(inventoryPath, 'utf-8');
  const lines = content.split('\n');

  const routes: RouteRow[] = [];
  let inTable = false;

  for (const line of lines) {
    if (line.startsWith('| Path | Method |')) {
      inTable = true;
      continue;
    }

    if (line.startsWith('|------')) {
      continue;
    }

    if (inTable && line.startsWith('|')) {
      const parts = line.split('|').map(p => p.trim()).filter(p => p);

      if (parts.length >= 8 && parts[0] !== 'Path') {
        routes.push({
          path: parts[0],
          method: parts[1],
          mutation: parts[2] === 'YES',
          authType: parts[3],
          requiredRoles: parts[4],
          teamScoped: parts[5] === 'YES',
          frozenRule: parts[6],
          filePath: parts[7]
        });
      }
    }

    // Stop at Mutation Routes Only section
    if (line.startsWith('## Mutation Routes Only')) {
      break;
    }
  }

  return routes;
}

function isHighCost(route: RouteRow): boolean {
  const highCostPatterns = [
    '/generate',
    '/regenerate',
    '/check',
    '/suggest',
    '/explain',
    '/summary',
    'anthropic',
    'openai',
    'ai/'
  ];

  return highCostPatterns.some(pattern =>
    route.path.toLowerCase().includes(pattern) ||
    route.filePath.toLowerCase().includes(pattern)
  );
}

function isSensitiveRead(route: RouteRow): boolean {
  const sensitivePatterns = [
    '/assignments',
    '/tokens',
    '/people',
    '/directory',
    '/conflicts',
    '/audit',
    'dietary',
    'contact',
    'email',
    'phone'
  ];

  return sensitivePatterns.some(pattern =>
    route.path.toLowerCase().includes(pattern)
  );
}

function isAdmin(route: RouteRow): boolean {
  const adminPatterns = [
    '/auth/',
    '/billing/',
    '/memory',
    '/templates',
    '/demo/',
    '/entitlements'
  ];

  return adminPatterns.some(pattern =>
    route.path.toLowerCase().includes(pattern)
  );
}

function triageUnknownRoutes(routes: RouteRow[]): TriageResult {
  const unknownRoutes = routes.filter(r => r.authType === 'UNKNOWN');

  const result: TriageResult = {
    mutation: [],
    highCost: [],
    sensitiveRead: [],
    admin: [],
    lowRisk: []
  };

  for (const route of unknownRoutes) {
    let categorized = false;

    if (route.mutation) {
      result.mutation.push(route);
      categorized = true;
    }

    if (isHighCost(route)) {
      result.highCost.push(route);
      categorized = true;
    }

    if (isSensitiveRead(route)) {
      result.sensitiveRead.push(route);
      categorized = true;
    }

    if (isAdmin(route)) {
      result.admin.push(route);
      categorized = true;
    }

    if (!categorized) {
      result.lowRisk.push(route);
    }
  }

  return result;
}

function main() {
  const inventoryPath = path.join(__dirname, '../SECURITY_ROUTE_INVENTORY.md');

  if (!fs.existsSync(inventoryPath)) {
    console.error('ERROR: SECURITY_ROUTE_INVENTORY.md not found');
    process.exit(1);
  }

  const routes = parseInventory(inventoryPath);
  const totalRoutes = routes.length;
  const unknownRoutes = routes.filter(r => r.authType === 'UNKNOWN');
  const unknownCount = unknownRoutes.length;

  console.log('=== UNKNOWN ROUTES TRIAGE ===\n');
  console.log(`Total routes: ${totalRoutes}`);
  console.log(`UNKNOWN routes: ${unknownCount}\n`);

  const triage = triageUnknownRoutes(routes);

  console.log('--- Risk Categories ---');
  console.log(`MUTATION (writes): ${triage.mutation.length} ⚠️ CRITICAL`);
  console.log(`HIGH_COST (AI): ${triage.highCost.length} ⚠️ HIGH`);
  console.log(`SENSITIVE_READ (PII): ${triage.sensitiveRead.length} ⚠️ HIGH`);
  console.log(`ADMIN/ACCOUNT: ${triage.admin.length} ⚠️ MEDIUM`);
  console.log(`LOW_RISK: ${triage.lowRisk.length}\n`);

  // Top 10 highest risk
  console.log('--- TOP 10 HIGHEST RISK UNKNOWN ROUTES ---');
  const highRisk = [
    ...triage.mutation.filter(r => isHighCost(r) || isSensitiveRead(r)),
    ...triage.mutation.filter(r => !isHighCost(r) && !isSensitiveRead(r)).slice(0, 5),
    ...triage.highCost.filter(r => !r.mutation).slice(0, 3),
    ...triage.sensitiveRead.filter(r => !r.mutation).slice(0, 2)
  ].slice(0, 10);

  highRisk.forEach((route, i) => {
    const tags = [];
    if (route.mutation) tags.push('MUTATION');
    if (isHighCost(route)) tags.push('HIGH_COST');
    if (isSensitiveRead(route)) tags.push('SENSITIVE');
    if (isAdmin(route)) tags.push('ADMIN');

    console.log(`${i + 1}. ${route.method} ${route.path}`);
    console.log(`   Tags: ${tags.join(', ')}`);
    console.log(`   File: ${route.filePath}\n`);
  });

  // Detailed breakdown
  console.log('\n--- MUTATION ROUTES (UNKNOWN) ---');
  triage.mutation.forEach(r => {
    console.log(`- ${r.method} ${r.path} [${r.filePath}]`);
  });

  console.log('\n--- HIGH_COST AI ROUTES (UNKNOWN) ---');
  triage.highCost.forEach(r => {
    console.log(`- ${r.method} ${r.path} [${r.filePath}]`);
  });

  console.log('\n--- SENSITIVE_READ ROUTES (UNKNOWN) ---');
  triage.sensitiveRead.forEach(r => {
    console.log(`- ${r.method} ${r.path} [${r.filePath}]`);
  });

  console.log('\n--- ADMIN/ACCOUNT ROUTES (UNKNOWN) ---');
  triage.admin.forEach(r => {
    console.log(`- ${r.method} ${r.path} [${r.filePath}]`);
  });
}

main();
