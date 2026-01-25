# CI Security Integration Guide

This document provides exact commands to add security testing to your CI/CD pipeline.

---

## GitHub Actions Integration

### Option 1: Add to Existing Workflow

If you already have a GitHub Actions workflow (e.g., `.github/workflows/test.yml`), add this job:

```yaml
jobs:
  # ... your existing jobs ...

  security:
    name: Security Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate

      - name: Run security tests
        run: npm run test:security:all
```

### Option 2: Create New Security Workflow

Create `.github/workflows/security.yml`:

```yaml
name: Security Tests

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master, develop]

jobs:
  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate

      - name: Run security validation tests
        run: npm run test:security

      - name: Run BC verification tests
        run: npm run test:security:bc
        env:
          # BC tests need database access
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Run inventory gate (BLOCKER)
        run: npm run test:security:inventory

      - name: Upload security reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: security-reports
          path: |
            route-classifications.json
            SECURITY_ROUTE_INVENTORY.md
            SECURITY_INVENTORY_HARDENING.md
```

---

## GitLab CI Integration

Add to `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - security

security:audit:
  stage: security
  image: node:18
  cache:
    paths:
      - node_modules/
  before_script:
    - npm ci
    - npx prisma generate
  script:
    - npm run test:security:all
  artifacts:
    when: always
    paths:
      - route-classifications.json
      - SECURITY_ROUTE_INVENTORY.md
    reports:
      junit: test-results.xml
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_BRANCH == "develop"'
```

---

## CircleCI Integration

Add to `.circleci/config.yml`:

```yaml
version: 2.1

jobs:
  security-tests:
    docker:
      - image: cimg/node:18.0
    steps:
      - checkout
      - restore_cache:
          keys:
            - v1-dependencies-{{ checksum "package-lock.json" }}
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Generate Prisma Client
          command: npx prisma generate
      - run:
          name: Run security tests
          command: npm run test:security:all
      - store_artifacts:
          path: route-classifications.json
      - store_test_results:
          path: test-results

workflows:
  version: 2
  test-and-security:
    jobs:
      - security-tests
```

---

## Jenkins Integration

Add to `Jenkinsfile`:

```groovy
pipeline {
    agent {
        docker {
            image 'node:18'
        }
    }

    stages {
        stage('Install') {
            steps {
                sh 'npm ci'
                sh 'npx prisma generate'
            }
        }

        stage('Security Tests') {
            steps {
                sh 'npm run test:security:all'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'route-classifications.json', allowEmptyArchive: true
        }
    }
}
```

---

## Local Pre-Commit Hook

Create `.git/hooks/pre-commit`:

```bash
#!/bin/sh

echo "Running security inventory gate..."

npm run test:security:inventory

if [ $? -ne 0 ]; then
    echo "❌ Security gate failed. Commit blocked."
    echo "Fix security issues before committing."
    exit 1
fi

echo "✅ Security gate passed"
exit 0
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

---

## Package.json Integration

Already configured! Available commands:

```bash
# Run individual test suites
npm run test:security              # Auth guards validation (16 tests)
npm run test:security:bc           # BC verification (8 tests)
npm run test:security:classify     # Route classification
npm run test:security:inventory    # Classification + gate (BLOCKER)

# Run all security tests
npm run test:security:all
```

---

## Environment Variables

### Required for BC Tests

BC verification tests require a database connection:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/gather_test"
```

### Required for Production

Ensure these are set in CI:

```bash
NODE_ENV=production  # Prevents dev-only routes from running
DATABASE_URL=...      # Database connection
```

---

## Verification

### Test Locally

```bash
# 1. Classify routes
npm run test:security:classify

# 2. Run gate (will FAIL currently due to 30 critical issues)
npm run test:security:inventory

# 3. Run all tests
npm run test:security:all
```

### Expected Output (Current State)

```
✓ Security validation: 16/16 tests passed
✓ BC verification: 8/8 tests passed
✗ Inventory gate: FAILED

🚨 CRITICAL SECURITY ISSUES:
  - 21 mutation routes with NO authentication
  - 4 AI/high-cost routes with NO authentication
  - 5 sensitive routes with NO authentication

✗ SECURITY GATE FAILED
Exit code: 1
```

### Expected Output (After Fixes)

```
✓ Security validation: 16/16 tests passed
✓ BC verification: 8/8 tests passed
✓ Inventory gate: PASSED

Total routes analyzed: 74
Critical violations: 0
Weak auth warnings: 0

✓ SECURITY GATE PASSED
Exit code: 0
```

---

## Blocking Deployments

The inventory gate (`test:security:inventory`) exits with code `1` on failure, which will:
- ❌ Block GitHub Actions workflows
- ❌ Block GitLab CI pipelines
- ❌ Block CircleCI builds
- ❌ Prevent merges (if required checks are configured)

### GitHub: Require Status Check

1. Go to Settings → Branches → Branch protection rules
2. Enable "Require status checks to pass before merging"
3. Search for and select "Security Tests" or "security-audit"
4. Save changes

Now PRs cannot merge if security gate fails.

---

## Troubleshooting

### "route-classifications.json not found"

Run classification before gate:
```bash
npm run test:security:classify
npm run test:security:inventory
```

Or use the combined command:
```bash
npm run test:security:inventory  # Runs classify + gate
```

### Tests pass locally but fail in CI

Check Prisma client generation:
```bash
npx prisma generate
```

Ensure DATABASE_URL is set for BC tests:
```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Dev server required for BC tests

BC tests hit `http://localhost:3000` and need the dev server running:

**Option 1:** Start dev server in CI background
```yaml
- run: npm run dev &
- run: sleep 10  # Wait for server startup
- run: npm run test:security:bc
```

**Option 2:** Skip BC tests in CI (not recommended)
```bash
npm run test:security && npm run test:security:inventory
```

---

## Monitoring

### Track Security Issues Over Time

Save classification results:
```bash
npx tsx scripts/classify-routes.ts > security-audit-$(date +%Y%m%d).log
```

### Generate Reports

```bash
# Get count of vulnerable routes
cat route-classifications.json | jq '[.[] | select(.securityIssues | length > 0)] | length'

# List all critical issues
cat route-classifications.json | jq '.[] | select(.securityIssues[] | contains("CRITICAL"))'

# Export to CSV
cat route-classifications.json | jq -r '.[] | [.apiPath, .authType, (.securityIssues | join("; "))] | @csv'
```

---

## Next Steps

1. ✅ Add security workflow to CI (choose option above)
2. ⏳ Fix 30 critical vulnerabilities
3. ✅ Re-run: `npm run test:security:all`
4. ✅ Verify gate passes
5. ✅ Deploy with confidence

---

**Last Updated:** 2026-01-19
**Status:** Ready for CI integration
