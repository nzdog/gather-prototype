/**
 * Route Analysis Script
 * Analyzes all API routes to determine auth requirements and mutation status
 */

import * as fs from 'fs';
import * as path from 'path';

interface RouteInfo {
  path: string;
  methods: string[];
  isMutation: boolean;
  authType: 'SESSION' | 'TOKEN' | 'PUBLIC' | 'UNKNOWN';
  requiredRoles: string[];
  teamScoped: boolean;
  frozenRule: string;
  filePath: string;
  notes: string[];
}

function analyzeRouteFile(filePath: string): RouteInfo | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`, error);
    return null;
  }

  // Derive API path from file path
  const relPath = filePath.replace(process.cwd(), '').replace('/src/app/api', '');
  const apiPath = relPath.replace('/route.ts', '').replace(/\[(\w+)\]/g, ':$1'); // Convert [id] to :id

  // Detect HTTP methods
  const methods: string[] = [];
  if (content.match(/export\s+async\s+function\s+GET/)) methods.push('GET');
  if (content.match(/export\s+async\s+function\s+POST/)) methods.push('POST');
  if (content.match(/export\s+async\s+function\s+PATCH/)) methods.push('PATCH');
  if (content.match(/export\s+async\s+function\s+PUT/)) methods.push('PUT');
  if (content.match(/export\s+async\s+function\s+DELETE/)) methods.push('DELETE');

  // Determine if mutation (POST/PATCH/PUT/DELETE that writes to DB)
  const mutationMethods = methods.filter((m) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(m));
  const hasPrismaWrite = content.match(/prisma\.\w+\.(create|update|delete|upsert)/);
  const isMutation = mutationMethods.length > 0 && hasPrismaWrite !== null;

  // Detect auth type
  let authType: 'SESSION' | 'TOKEN' | 'PUBLIC' | 'UNKNOWN' = 'UNKNOWN';
  const hasGetUser = content.includes('getUser()');
  const hasResolveToken = content.includes('resolveToken');
  const hasRequireEventRole = content.includes('requireEventRole');
  const hasRequireTokenScope = content.includes('requireTokenScope');

  if (hasGetUser || hasRequireEventRole) {
    authType = 'SESSION';
  } else if (hasResolveToken || hasRequireTokenScope) {
    authType = 'TOKEN';
  } else if (
    apiPath.includes('/h/:token') ||
    apiPath.includes('/c/:token') ||
    apiPath.includes('/p/:token')
  ) {
    authType = 'TOKEN';
  } else if (apiPath.includes('/gather/') || apiPath.includes('/webhooks/')) {
    authType = 'PUBLIC';
  }

  // Detect required roles
  const requiredRoles: string[] = [];
  if (content.includes('requireEventRole') || content.includes('EventRoleType.HOST')) {
    requiredRoles.push('HOST');
  }
  if (content.includes('COORDINATOR') || apiPath.includes('/c/:token')) {
    requiredRoles.push('COORDINATOR');
  }
  if (content.includes('PARTICIPANT') || apiPath.includes('/p/:token')) {
    requiredRoles.push('PARTICIPANT');
  }

  // Detect team scoping
  const teamScoped =
    content.includes('teamId') &&
    (apiPath.includes('/c/:token') ||
      content.includes('team.id') ||
      content.includes('personEvent.teamId'));

  // Detect frozen rules
  let frozenRule = 'NONE';
  const hasRequireNotFrozen = content.includes('requireNotFrozen');
  const hasAllowOverride = content.match(/requireNotFrozen\([^,]+,\s*true\)/);

  if (hasRequireNotFrozen && hasAllowOverride) {
    frozenRule = 'BLOCKED_COORDINATOR, HOST_OVERRIDE';
  } else if (hasRequireNotFrozen) {
    frozenRule = 'BLOCKED_ALL';
  } else if (content.includes('FROZEN') && content.includes('403')) {
    frozenRule = 'BLOCKED_COORDINATOR';
  }

  // Collect notes
  const notes: string[] = [];
  if (content.includes('SECURITY:') || content.includes('Security:')) {
    const securityComments = content.match(/\/\/\s*(SECURITY:|Security:)[^\n]*/g);
    if (securityComments) {
      notes.push(...securityComments.map((c) => c.trim()));
    }
  }

  return {
    path: apiPath,
    methods,
    isMutation,
    authType,
    requiredRoles: requiredRoles.length > 0 ? requiredRoles : ['UNKNOWN'],
    teamScoped,
    frozenRule,
    filePath: filePath.replace(process.cwd() + '/', ''),
    notes,
  };
}

function main() {
  const apiDir = path.join(process.cwd(), 'src/app/api');
  const routes: RouteInfo[] = [];

  function findRoutes(dir: string) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      console.error(`Failed to read directory: ${dir}`, error);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        findRoutes(fullPath);
      } else if (entry.name === 'route.ts') {
        const routeInfo = analyzeRouteFile(fullPath);
        if (routeInfo) {
          routes.push(routeInfo);
        }
      }
    }
  }

  findRoutes(apiDir);

  // Sort by path
  routes.sort((a, b) => a.path.localeCompare(b.path));

  // Generate markdown table
  console.log('# Security Route Inventory\n');
  console.log('Generated:', new Date().toISOString());
  console.log(`\nTotal routes: ${routes.length}`);
  console.log(`Mutation routes: ${routes.filter((r) => r.isMutation).length}`);
  console.log(`Session auth: ${routes.filter((r) => r.authType === 'SESSION').length}`);
  console.log(`Token auth: ${routes.filter((r) => r.authType === 'TOKEN').length}`);
  console.log(`Public: ${routes.filter((r) => r.authType === 'PUBLIC').length}`);
  console.log(`Unknown auth: ${routes.filter((r) => r.authType === 'UNKNOWN').length}\n`);

  console.log('## Route Table\n');
  console.log(
    '| Path | Method | Mutation? | Auth Type | Required Role(s) | Team Scoped? | Frozen Rule | File Path |'
  );
  console.log(
    '|------|--------|-----------|-----------|------------------|--------------|-------------|-----------|'
  );

  for (const route of routes) {
    console.log(
      `| ${route.path} | ${route.methods.join(', ')} | ${route.isMutation ? 'YES' : 'NO'} | ${route.authType} | ${route.requiredRoles.join(', ')} | ${route.teamScoped ? 'YES' : 'NO'} | ${route.frozenRule} | ${route.filePath} |`
    );
  }

  // Print mutations only
  console.log('\n## Mutation Routes Only\n');
  console.log('| Path | Method | Auth Type | Required Role(s) | Team Scoped? | Frozen Rule |');
  console.log('|------|--------|-----------|------------------|--------------|-------------|');

  for (const route of routes.filter((r) => r.isMutation)) {
    console.log(
      `| ${route.path} | ${route.methods.filter((m) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(m)).join(', ')} | ${route.authType} | ${route.requiredRoles.join(', ')} | ${route.teamScoped ? 'YES' : 'NO'} | ${route.frozenRule} |`
    );
  }

  // Print notes
  const routesWithNotes = routes.filter((r) => r.notes.length > 0);
  if (routesWithNotes.length > 0) {
    console.log('\n## Security Notes\n');
    for (const route of routesWithNotes) {
      console.log(`### ${route.path}`);
      route.notes.forEach((note) => console.log(`- ${note}`));
      console.log('');
    }
  }
}

main();
