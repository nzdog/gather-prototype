#!/bin/bash
# Script to manually verify POST /api/events authentication
# Run with: bash scripts/verify-api-events-auth.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BOLD}${YELLOW}=== POST /api/events Authentication Verification ===${NC}\n"

# Check if server is running
echo "Checking if server is running on http://localhost:3000..."
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${RED}✗ Server is not running${NC}"
    echo "Please start the server with: npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}\n"

# Test 1: Unauthenticated request
echo -e "${BOLD}Test 1: Unauthenticated Request${NC}"
echo "Making POST request without authentication..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"name":"Test_Manual_Unauth","startDate":"2026-01-01","endDate":"2026-01-02"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ Returned 401 Unauthorized${NC}"
else
    echo -e "${RED}✗ Expected 401, got $HTTP_CODE${NC}"
    exit 1
fi

if echo "$BODY" | grep -q "Unauthorized"; then
    echo -e "${GREEN}✓ Response contains 'Unauthorized' error${NC}"
else
    echo -e "${RED}✗ Response does not contain 'Unauthorized'${NC}"
    echo "Response: $BODY"
    exit 1
fi

# Verify no event was created
EVENT_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const count = await prisma.event.count({ where: { name: 'Test_Manual_Unauth' } });
  console.log(count);
  await prisma.\$disconnect();
})();
" 2>/dev/null)

if [ "$EVENT_COUNT" = "0" ]; then
    echo -e "${GREEN}✓ No event created in database${NC}\n"
else
    echo -e "${RED}✗ Event was created (count: $EVENT_COUNT)${NC}"
    exit 1
fi

# Test 2: Authenticated request
echo -e "${BOLD}Test 2: Authenticated Request${NC}"
echo "Creating test session..."

SESSION_TOKEN=$(node -e "
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();
(async () => {
  let user = await prisma.user.findUnique({ where: { email: 'test@gather.test' } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: 'test@gather.test', billingStatus: 'ACTIVE' }
    });
  }
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await prisma.session.create({
    data: { userId: user.id, token: sessionToken, expiresAt }
  });
  console.log(sessionToken);
  await prisma.\$disconnect();
})();
" 2>/dev/null)

echo "Making authenticated POST request..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Cookie: session=$SESSION_TOKEN" \
  -d '{"name":"Test_Manual_Auth","startDate":"2026-01-01","endDate":"2026-01-02"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Returned 200 OK${NC}"
else
    echo -e "${RED}✗ Expected 200, got $HTTP_CODE${NC}"
    exit 1
fi

if echo "$BODY" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Response contains success:true${NC}"
else
    echo -e "${RED}✗ Response does not contain success:true${NC}"
    echo "Response: $BODY"
    exit 1
fi

# Verify event was created
EVENT_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const count = await prisma.event.count({ where: { name: 'Test_Manual_Auth' } });
  console.log(count);
  await prisma.\$disconnect();
})();
" 2>/dev/null)

if [ "$EVENT_COUNT" = "1" ]; then
    echo -e "${GREEN}✓ Event created in database${NC}\n"
else
    echo -e "${RED}✗ Event not found (count: $EVENT_COUNT)${NC}"
    exit 1
fi

# Cleanup
echo "Cleaning up test data..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  await prisma.event.deleteMany({
    where: { name: { in: ['Test_Manual_Unauth', 'Test_Manual_Auth'] } }
  });
  await prisma.session.deleteMany({ where: { token: '$SESSION_TOKEN' } });
  await prisma.\$disconnect();
})();
" 2>/dev/null

echo -e "${GREEN}✓ Cleanup complete${NC}\n"

# Summary
echo -e "${BOLD}${GREEN}=== All Tests Passed ===${NC}"
echo "Verified:"
echo "  • Unauthenticated requests return 401"
echo "  • No events created without authentication"
echo "  • Authenticated requests (with session cookie) succeed"
echo "  • Events are created for authenticated requests"
