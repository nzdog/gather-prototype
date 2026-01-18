# Gather Prototype — Unified Diff Patch (v1.3.2 → v1.3.3)

This patch applies the corrections from v1.3.2 to v1.3.3.

## Summary of Changes

| File | Changes |
|------|---------|
| `src/lib/workflow.ts` | Prisma.TransactionClient type; sync computeTeamStatusFromItems; removePerson with actorId + audit + repair |
| `src/app/api/p/[token]/ack/[assignmentId]/route.ts` | Idempotent ACK with race-safe transaction |
| `src/app/api/h/[token]/status/route.ts` | Capture fromStatus before update |
| `src/app/api/c/[token]/route.ts` | Remove await from computeTeamStatusFromItems |
| `src/app/api/h/[token]/route.ts` | Remove await from computeTeamStatusFromItems |

---

## Patch

```diff
diff --git a/src/lib/workflow.ts b/src/lib/workflow.ts
index 1234567..abcdefg 100644
--- a/src/lib/workflow.ts
+++ b/src/lib/workflow.ts
@@ -1,12 +1,11 @@
 import { prisma } from './prisma';
-import type { Item, Assignment, Person, EventStatus, PrismaClient } from '@prisma/client';
+import type { Item, Assignment, Person, EventStatus, Prisma } from '@prisma/client';
 
 // Type for items with assignment + person included
 type ItemWithAssignmentAndPerson = Item & {
   assignment: (Assignment & { person: Person }) | null;
 };
 
-// Transaction client type
-type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
+// Use Prisma's built-in transaction client type
+type Tx = Prisma.TransactionClient;
 
 /**
  * Computes team status from assignment data directly.
  * Does NOT use cached Item.status - queries assignment existence.
- * Use this in all GET routes.
+ * Use this in all GET routes. Pure synchronous function.
  */
-export async function computeTeamStatusFromItems(
+export function computeTeamStatusFromItems(
   items: ItemWithAssignmentAndPerson[]
-): Promise<'SORTED' | 'GAP' | 'CRITICAL_GAP'> {
+): 'SORTED' | 'GAP' | 'CRITICAL_GAP' {
   const hasCriticalGap = items.some(i => i.critical && i.assignment === null);
   const hasGap = items.some(i => i.assignment === null);
 
   if (hasCriticalGap) return 'CRITICAL_GAP';
   if (hasGap) return 'GAP';
   return 'SORTED';
 }
 
 /**
  * Repairs Item.status to match Assignment existence.
  * ONLY call this after assignment mutations, within the same transaction.
  */
 export async function repairItemStatusAfterMutation(
-  tx: TxClient,
+  tx: Tx,
   itemId: string
 ): Promise<void> {
   const item = await tx.item.findUnique({
     where: { id: itemId },
     include: { assignment: true }
   });
 
   if (!item) return;
 
   const shouldBe = item.assignment !== null ? 'ASSIGNED' : 'UNASSIGNED';
 
   if (item.status !== shouldBe) {
     await tx.item.update({
       where: { id: itemId },
       data: { status: shouldBe },
     });
   }
 }
 
 /**
  * Returns true if event can be frozen.
  * Freeze blocked if ANY critical item lacks assignment.
  * Queries Assignment directly, NOT Item.status.
  */
 export async function canFreeze(eventId: string): Promise<boolean> {
   const criticalUnassignedCount = await prisma.item.count({
     where: {
       team: { eventId },
       critical: true,
       assignment: null,
     },
   });
 
   return criticalUnassignedCount === 0;
 }
 
 export async function getCriticalGapCount(eventId: string): Promise<number> {
   return prisma.item.count({
     where: {
       team: { eventId },
       critical: true,
       assignment: null,
     },
   });
 }
 
 /**
  * Validates event status transitions.
  * State machine from spec Section 6:
  *   DRAFT → CONFIRMING : Always allowed
  *   CONFIRMING → FROZEN : Blocked if critical gaps (checked separately)
  *   FROZEN → CONFIRMING : Allowed (override, logged)
  *   FROZEN → COMPLETE : Allowed
  *   COMPLETE → * : Never allowed
  */
 export function canTransition(fromStatus: EventStatus, toStatus: EventStatus): boolean {
   if (fromStatus === toStatus) return true;
   if (fromStatus === 'COMPLETE') return false;
 
   const validTransitions: Record<EventStatus, EventStatus[]> = {
     DRAFT: ['CONFIRMING'],
     CONFIRMING: ['FROZEN'],
     FROZEN: ['CONFIRMING', 'COMPLETE'],
     COMPLETE: []
   };
 
   return validTransitions[fromStatus].includes(toStatus);
 }
 
 /**
  * Mutation gating from spec Section 6 MUTATION_RULES.
  */
 export function canMutate(
   eventStatus: EventStatus,
   action: 'createItem' | 'editItem' | 'deleteItem' | 'assignItem' | 'addPerson' | 'removePerson',
   itemCritical?: boolean
 ): boolean {
   if (eventStatus === 'COMPLETE') return false;
   if (eventStatus === 'FROZEN') return false;
 
   if (eventStatus === 'CONFIRMING') {
     if (action === 'deleteItem' && itemCritical) {
       return false;
     }
     return true;
   }
 
   // DRAFT: all mutations allowed
   return true;
 }
 
 /**
  * Audit helper: logs action to AuditEntry within transaction.
  */
 export async function logAudit(
-  tx: TxClient,
+  tx: Tx,
   params: {
     eventId: string;
     actorId: string;
     actionType: string;
     targetType: string;
     targetId: string;
     details?: string;
   }
 ): Promise<void> {
   await tx.auditEntry.create({
     data: {
       eventId: params.eventId,
       actorId: params.actorId,
       actionType: params.actionType,
       targetType: params.targetType,
       targetId: params.targetId,
       details: params.details || '',
       timestamp: new Date()
     }
   });
 }
 
 /**
  * Removes a person from an event.
  * Appends person.name to previouslyAssignedTo (human-readable).
+ * Logs REMOVE_PERSON and UNASSIGN_ITEM audit entries.
+ * @param actorId - The person performing the removal (for audit logging)
  */
-export async function removePerson(personId: string, eventId: string): Promise<void> {
+export async function removePerson(
+  personId: string,
+  eventId: string,
+  actorId: string
+): Promise<void> {
   await prisma.$transaction(async (tx) => {
     const person = await tx.person.findUnique({
       where: { id: personId },
       select: { name: true }
     });
 
     if (!person) throw new Error('Person not found');
 
+    // Log REMOVE_PERSON action first
+    await logAudit(tx, {
+      eventId,
+      actorId,
+      actionType: 'REMOVE_PERSON',
+      targetType: 'PersonEvent',
+      targetId: personId,
+      details: `Removed person ${person.name} from event`
+    });
+
     const assignments = await tx.assignment.findMany({
       where: {
         personId,
         item: { team: { eventId } }
       },
       include: { item: true }
     });
 
     for (const assignment of assignments) {
+      // Update item: set previouslyAssignedTo
       await tx.item.update({
         where: { id: assignment.itemId },
         data: {
-          status: 'UNASSIGNED',
           previouslyAssignedTo: assignment.item.previouslyAssignedTo
             ? `${assignment.item.previouslyAssignedTo}, ${person.name}`
             : person.name,
         }
       });
 
+      // Delete assignment
       await tx.assignment.delete({
         where: { id: assignment.id }
       });
+
+      // Repair Item.status after assignment deletion
+      await repairItemStatusAfterMutation(tx, assignment.itemId);
+
+      // Log UNASSIGN_ITEM action for each item
+      await logAudit(tx, {
+        eventId,
+        actorId,
+        actionType: 'UNASSIGN_ITEM',
+        targetType: 'Item',
+        targetId: assignment.itemId,
+        details: `Unassigned item due to removing person ${person.name}`
+      });
     }
 
     await tx.accessToken.deleteMany({
       where: { personId, eventId }
     });
 
     await tx.personEvent.deleteMany({
       where: { personId, eventId }
     });
   });
 }
diff --git a/src/app/api/p/[token]/ack/[assignmentId]/route.ts b/src/app/api/p/[token]/ack/[assignmentId]/route.ts
index 1234567..abcdefg 100644
--- a/src/app/api/p/[token]/ack/[assignmentId]/route.ts
+++ b/src/app/api/p/[token]/ack/[assignmentId]/route.ts
@@ -1,6 +1,6 @@
 import { NextRequest, NextResponse } from 'next/server';
 import { resolveToken } from '@/lib/auth';
 import { prisma } from '@/lib/prisma';
 import { logAudit } from '@/lib/workflow';
 
 export async function POST(
   request: NextRequest,
   { params }: { params: { token: string; assignmentId: string } }
 ) {
   const context = await resolveToken(params.token);
   if (!context || context.scope !== 'PARTICIPANT') {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
   }
 
-  // Verify assignment belongs to this participant
-  const assignment = await prisma.assignment.findUnique({
-    where: { id: params.assignmentId }
-  });
-
-  if (!assignment || assignment.personId !== context.person.id) {
-    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
-  }
-
-  await prisma.$transaction(async (tx) => {
-    await tx.assignment.update({
-      where: { id: params.assignmentId },
-      data: { acknowledged: true }
+  // Idempotent ACK: check and update inside transaction to avoid race conditions
+  const result = await prisma.$transaction(async (tx) => {
+    const assignment = await tx.assignment.findUnique({
+      where: { id: params.assignmentId }
     });
 
-    await logAudit(tx, {
-      eventId: context.event.id,
-      actorId: context.person.id,
-      actionType: 'ACK_ASSIGNMENT',
-      targetType: 'Assignment',
-      targetId: params.assignmentId,
-      details: `Acknowledged assignment for item ${assignment.itemId}`
-    });
+    // Verify assignment exists and belongs to this participant
+    if (!assignment || assignment.personId !== context.person.id) {
+      return { found: false };
+    }
+
+    // If already acknowledged, do nothing (idempotent)
+    if (assignment.acknowledged) {
+      return { found: true, alreadyAcked: true };
+    }
+
+    // Update and log
+    await tx.assignment.update({
+      where: { id: params.assignmentId },
+      data: { acknowledged: true }
+    });
+
+    await logAudit(tx, {
+      eventId: context.event.id,
+      actorId: context.person.id,
+      actionType: 'ACK_ASSIGNMENT',
+      targetType: 'Assignment',
+      targetId: params.assignmentId,
+      details: `Acknowledged assignment for item ${assignment.itemId}`
+    });
+
+    return { found: true, alreadyAcked: false };
   });
 
+  if (!result.found) {
+    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
+  }
+
   return NextResponse.json({ success: true });
 }
diff --git a/src/app/api/h/[token]/status/route.ts b/src/app/api/h/[token]/status/route.ts
index 1234567..abcdefg 100644
--- a/src/app/api/h/[token]/status/route.ts
+++ b/src/app/api/h/[token]/status/route.ts
@@ -1,6 +1,6 @@
 import { NextRequest, NextResponse } from 'next/server';
 import { resolveToken } from '@/lib/auth';
 import { prisma } from '@/lib/prisma';
 import { canFreeze, getCriticalGapCount, canTransition, logAudit } from '@/lib/workflow';
 
 export async function PATCH(
   request: NextRequest,
   { params }: { params: { token: string } }
 ) {
   const context = await resolveToken(params.token);
   if (!context || context.scope !== 'HOST') {
     return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   }
 
-  if (context.event.status === 'COMPLETE') {
+  // Capture old status BEFORE any updates
+  const fromStatus = context.event.status;
+
+  if (fromStatus === 'COMPLETE') {
     return NextResponse.json({ error: 'Cannot modify completed event' }, { status: 403 });
   }
 
   const { status } = await request.json();
 
   // Validate state transition
-  if (!canTransition(context.event.status, status)) {
+  if (!canTransition(fromStatus, status)) {
     return NextResponse.json({
-      error: `Invalid transition from ${context.event.status} to ${status}`
+      error: `Invalid transition from ${fromStatus} to ${status}`
     }, { status: 400 });
   }
 
   // Freeze gate check
   if (status === 'FROZEN') {
     const allowed = await canFreeze(context.event.id);
     if (!allowed) {
       const gaps = await getCriticalGapCount(context.event.id);
       return NextResponse.json({
         error: `Cannot freeze: ${gaps} critical gaps`
       }, { status: 400 });
     }
   }
 
   // Single transaction for update + all audit logs
   const updated = await prisma.$transaction(async (tx) => {
     const event = await tx.event.update({
       where: { id: context.event.id },
       data: { status }
     });
 
     await logAudit(tx, {
       eventId: context.event.id,
       actorId: context.person.id,
       actionType: 'EVENT_STATUS_CHANGE',
       targetType: 'Event',
       targetId: context.event.id,
-      details: `Changed status from ${context.event.status} to ${status}`
+      details: `Changed status from ${fromStatus} to ${status}`
     });
 
     // Log override in same transaction
-    if (context.event.status === 'FROZEN' && status === 'CONFIRMING') {
+    if (fromStatus === 'FROZEN' && status === 'CONFIRMING') {
       await logAudit(tx, {
         eventId: context.event.id,
         actorId: context.person.id,
         actionType: 'OVERRIDE_UNFREEZE',
         targetType: 'Event',
         targetId: context.event.id,
         details: 'Host unfroze event'
       });
     }
 
     return event;
   });
 
   return NextResponse.json({ event: updated });
 }
diff --git a/src/app/api/c/[token]/route.ts b/src/app/api/c/[token]/route.ts
index 1234567..abcdefg 100644
--- a/src/app/api/c/[token]/route.ts
+++ b/src/app/api/c/[token]/route.ts
@@ -25,7 +25,7 @@ export async function GET(
   });
   
   // Compute status from assignment existence (no repair, synchronous)
-  const myStatus = await computeTeamStatusFromItems(myItems);
+  const myStatus = computeTeamStatusFromItems(myItems);
 
   // 2. Fetch other teams (id + name only)
   const otherTeams = await prisma.team.findMany({
diff --git a/src/app/api/h/[token]/route.ts b/src/app/api/h/[token]/route.ts
index 1234567..abcdefg 100644
--- a/src/app/api/h/[token]/route.ts
+++ b/src/app/api/h/[token]/route.ts
@@ -27,7 +27,7 @@ export async function GET(
   const teamsWithStatus = [];
   for (const team of teams) {
     // Compute status from assignment existence (no repair, synchronous)
-    const status = await computeTeamStatusFromItems(team.items);
+    const status = computeTeamStatusFromItems(team.items);
     teamsWithStatus.push({
       id: team.id,
       name: team.name,
```

---

## Verification Checklist

After applying this patch, verify:

### 1. TypeScript Compilation
```bash
npx tsc --noEmit
```

### 2. Lint Check
```bash
npm run lint
```

### 3. ACK Idempotency Test
```bash
# First call - should log ACK_ASSIGNMENT
curl -X POST http://localhost:3000/api/p/{token}/ack/{assignmentId}

# Second call - should NOT log, still return success
curl -X POST http://localhost:3000/api/p/{token}/ack/{assignmentId}

# Verify: only ONE ACK_ASSIGNMENT in audit_entry table for that assignmentId
```

### 4. Host Status Audit Test
```bash
# Change status and verify audit entry
curl -X PATCH http://localhost:3000/api/h/{token}/status \
  -H "Content-Type: application/json" \
  -d '{"status":"FROZEN"}'

# Check audit_entry: details should show correct "from" status
# e.g., "Changed status from CONFIRMING to FROZEN"
```

### 5. GET Route Non-Mutation Test
```bash
# Call GET routes and verify no DB writes occur
# Check that Item.status is NOT modified by GET requests
```

### 6. removePerson Audit Test (if endpoint exposed)
```bash
# Verify: one REMOVE_PERSON entry
# Plus: one UNASSIGN_ITEM per item the person had assigned
```

---

## Notes

### removePerson Signature Change

The `removePerson` function now requires a third parameter `actorId`:

```typescript
// Before (v1.3.2)
await removePerson(personId, eventId);

// After (v1.3.3)
await removePerson(personId, eventId, actorId);
```

Any existing call sites must be updated. The prototype currently doesn't expose a remove-person endpoint per spec ("What NOT to build"), so this should be safe.

### Import Changes

If your `workflow.ts` imports looked like this:

```typescript
// Before
import type { Item, Assignment, Person, EventStatus, PrismaClient } from '@prisma/client';

// After
import type { Item, Assignment, Person, EventStatus, Prisma } from '@prisma/client';
```

The `PrismaClient` import is replaced with `Prisma` for the `TransactionClient` type.
