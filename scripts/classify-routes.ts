/**
 * Route Classification Script
 *
 * Analyzes each route file to determine authentication type by code inspection.
 * Classifications:
 * - SESSION: Uses getUser() or requireEventRole()
 * - TOKEN: Uses resolveToken() or requireTokenScope() or /h/c/p token paths
 * - WEAK_PARAM: Uses hostId/personId query params WITHOUT session validation
 * - NONE: No authentication checks found
 * - PUBLIC: Intentionally public (webhooks, public endpoints)
 */

import * as fs from 'fs';
import * as path from 'path';

interface RouteAnalysis {
  filePath: string;
  apiPath: string;
  methods: string[];
  authType: string;
  authEvidence: string[];
  securityIssues: string[];
}

function analyzeRouteFile(filePath: string): RouteAnalysis {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Derive API path - CRITICAL: Must preserve /api prefix for HTTP endpoints
  const relPath = filePath.replace(process.cwd(), '').replace('/src/app', '');
  const apiPath = relPath
    .replace('/route.ts', '')
    .replace(/\[(\w+)\]/g, ':$1');

  // Detect methods
  const methods: string[] = [];
  if (content.match(/export\s+async\s+function\s+GET/)) methods.push('GET');
  if (content.match(/export\s+async\s+function\s+POST/)) methods.push('POST');
  if (content.match(/export\s+async\s+function\s+PATCH/)) methods.push('PATCH');
  if (content.match(/export\s+async\s+function\s+PUT/)) methods.push('PUT');
  if (content.match(/export\s+async\s+function\s+DELETE/)) methods.push('DELETE');

  // Analyze authentication
  const authEvidence: string[] = [];
  const securityIssues: string[] = [];
  let authType = 'NONE';

  // SESSION auth
  const hasGetUser = content.includes('getUser()');
  const hasRequireEventRole = content.includes('requireEventRole');
  const hasCookieCheck = content.includes('cookies()') && content.includes('session');

  if (hasGetUser || hasRequireEventRole || hasCookieCheck) {
    authType = 'SESSION';
    if (hasGetUser) authEvidence.push('getUser()');
    if (hasRequireEventRole) authEvidence.push('requireEventRole');
    if (hasCookieCheck) authEvidence.push('cookie session check');
  }

  // TOKEN auth
  const hasResolveToken = content.includes('resolveToken');
  const hasRequireTokenScope = content.includes('requireTokenScope');
  const isTokenPath = apiPath.match(/^\/(h|c|p)\/:/);

  if (hasResolveToken || hasRequireTokenScope || isTokenPath) {
    authType = 'TOKEN';
    if (hasResolveToken) authEvidence.push('resolveToken');
    if (hasRequireTokenScope) authEvidence.push('requireTokenScope');
    if (isTokenPath) authEvidence.push('token-based path pattern');
  }

  // PUBLIC endpoints
  const isWebhook = apiPath.includes('/webhooks/');
  const isPublicDirectory = apiPath.includes('/gather/') && apiPath.includes('/directory');
  const hasPublicComment = content.includes('PUBLIC') || content.includes('No auth required');

  if (isWebhook || isPublicDirectory) {
    authType = 'PUBLIC';
    if (isWebhook) authEvidence.push('webhook endpoint');
    if (isPublicDirectory) authEvidence.push('public directory');
  }

  // AUTH flow routes (special case) - check BEFORE NONE detection
  if (apiPath.startsWith('/api/auth/')) {
    authType = 'PUBLIC';
    authEvidence.push('auth flow endpoint (intentionally public)');
  }

  // WEAK PARAM auth (hostId/personId without session validation)
  const hasHostIdParam = content.includes("searchParams.get('hostId')") ||
                         content.includes('hostId') && content.includes('query');
  const hasPersonIdParam = content.includes("searchParams.get('personId')");
  const hasBearerTokenFallback = content.includes('Bearer') || content.includes('authorization');

  // If using param auth but NO session/token validation, it's WEAK
  if ((hasHostIdParam || hasPersonIdParam) && authType === 'NONE') {
    // Check if there's ANY validation beyond param presence
    const hasEventOwnerCheck = content.includes('event.hostId') && content.includes('!==');
    const hasPersonCheck = content.includes('person.') && content.includes('where');

    if (hasEventOwnerCheck || hasBearerTokenFallback) {
      authType = 'CUSTOM';
      authEvidence.push('custom param-based auth with validation');
      if (hasBearerTokenFallback) {
        authEvidence.push('bearer token fallback');
      }
    } else {
      authType = 'WEAK_PARAM';
      authEvidence.push(hasHostIdParam ? 'hostId query param' : 'personId query param');
      securityIssues.push('⚠️ WEAK AUTH: Query param without session validation');
    }
  }

  // NO AUTH detection
  if (authType === 'NONE' && !isPublicDirectory && !isWebhook) {
    // Check for mutation
    const mutationMethods = methods.filter(m => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(m));
    const hasPrismaWrite = content.match(/prisma\.\w+\.(create|update|delete|upsert)/);

    // ENHANCED: Also detect indirect mutations via workflow/helper functions
    const hasWorkflowMutation = content.includes('transitionToConfirming') ||
                                content.includes('transitionToFrozen') ||
                                content.includes('createEvent') ||
                                content.includes('updateEvent') ||
                                content.includes('deleteEvent');

    // CRITICAL: Any POST/PATCH/PUT/DELETE with NONE auth is a mutation risk
    // Even if we don't see direct Prisma calls, mutation methods should have auth
    if (mutationMethods.length > 0) {
      if (hasPrismaWrite || hasWorkflowMutation) {
        securityIssues.push('🚨 CRITICAL: Mutation route with NO authentication');
      } else {
        // Even without detected DB writes, POST/PATCH/PUT/DELETE with NONE auth is suspicious
        securityIssues.push('🚨 CRITICAL: Mutation method (POST/PATCH/PUT/DELETE) with NO authentication');
      }
    }

    // Check for AI/high-cost operations
    const isHighCost = content.includes('anthropic') ||
                       content.includes('generatePlan') ||
                       content.includes('detectConflicts') ||
                       content.includes('suggestResolution');

    if (isHighCost) {
      securityIssues.push('🚨 CRITICAL: AI/high-cost route with NO authentication');
    }

    // Check for sensitive data
    const isSensitive = apiPath.includes('/tokens') ||
                        apiPath.includes('/people') ||
                        apiPath.includes('/assignments') ||
                        apiPath.includes('/directory') ||
                        content.includes('email') ||
                        content.includes('phone');

    if (isSensitive) {
      securityIssues.push('⚠️ HIGH: Sensitive data route with NO authentication');
    }
  }

  // DEMO routes
  if (apiPath.startsWith('/demo/')) {
    authEvidence.push('demo endpoint');
    if (authType === 'NONE') {
      securityIssues.push('⚠️ Demo route - verify this is dev-only');
    }
  }

  return {
    filePath: filePath.replace(process.cwd() + '/', ''),
    apiPath,
    methods,
    authType,
    authEvidence,
    securityIssues
  };
}

function main() {
  const apiDir = path.join(process.cwd(), 'src/app/api');
  const analyses: RouteAnalysis[] = [];

  function findRoutes(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        findRoutes(fullPath);
      } else if (entry.name === 'route.ts') {
        analyses.push(analyzeRouteFile(fullPath));
      }
    }
  }

  findRoutes(apiDir);

  // Sort by security issues (critical first), then by auth type
  analyses.sort((a, b) => {
    const aCritical = a.securityIssues.some(i => i.includes('CRITICAL'));
    const bCritical = b.securityIssues.some(i => i.includes('CRITICAL'));

    if (aCritical && !bCritical) return -1;
    if (!aCritical && bCritical) return 1;

    return a.apiPath.localeCompare(b.apiPath);
  });

  // Statistics
  const stats = {
    total: analyses.length,
    session: analyses.filter(a => a.authType === 'SESSION').length,
    token: analyses.filter(a => a.authType === 'TOKEN').length,
    custom: analyses.filter(a => a.authType === 'CUSTOM').length,
    public: analyses.filter(a => a.authType === 'PUBLIC').length,
    weakParam: analyses.filter(a => a.authType === 'WEAK_PARAM').length,
    none: analyses.filter(a => a.authType === 'NONE').length,
    withIssues: analyses.filter(a => a.securityIssues.length > 0).length
  };

  console.log('=== ROUTE CLASSIFICATION RESULTS ===\n');
  console.log('Statistics:');
  console.log(`  Total routes: ${stats.total}`);
  console.log(`  SESSION: ${stats.session}`);
  console.log(`  TOKEN: ${stats.token}`);
  console.log(`  CUSTOM: ${stats.custom}`);
  console.log(`  PUBLIC: ${stats.public}`);
  console.log(`  WEAK_PARAM: ${stats.weakParam} ⚠️`);
  console.log(`  NONE: ${stats.none} 🚨`);
  console.log(`  Routes with issues: ${stats.withIssues}\n`);

  // Critical issues
  const critical = analyses.filter(a =>
    a.securityIssues.some(i => i.includes('CRITICAL'))
  );

  if (critical.length > 0) {
    console.log('🚨 CRITICAL SECURITY ISSUES:\n');
    critical.forEach(a => {
      console.log(`${a.methods.join(', ')} ${a.apiPath}`);
      console.log(`  File: ${a.filePath}`);
      a.securityIssues.forEach(issue => console.log(`  ${issue}`));
      console.log('');
    });
  }

  // High priority issues
  const highPriority = analyses.filter(a =>
    a.securityIssues.some(i => i.includes('HIGH') || i.includes('WEAK'))
  );

  if (highPriority.length > 0) {
    console.log('⚠️  HIGH PRIORITY ISSUES:\n');
    highPriority.forEach(a => {
      console.log(`${a.methods.join(', ')} ${a.apiPath}`);
      console.log(`  Type: ${a.authType}`);
      a.securityIssues.forEach(issue => console.log(`  ${issue}`));
      console.log('');
    });
  }

  // Output classifications for inventory update
  console.log('\n=== CLASSIFICATIONS FOR INVENTORY UPDATE ===\n');
  analyses.forEach(a => {
    console.log(`${a.apiPath} | ${a.methods.join(', ')} | ${a.authType} | ${a.authEvidence.join(', ') || 'none'}`);
  });

  // Save to JSON for programmatic use
  const outputPath = path.join(process.cwd(), 'route-classifications.json');
  fs.writeFileSync(outputPath, JSON.stringify(analyses, null, 2));
  console.log(`\n✓ Saved detailed analysis to ${outputPath}`);
}

main();
