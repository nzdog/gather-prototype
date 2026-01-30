Before starting work on this ticket:

1. Make sure you're on master branch and it's up to date
2. Create a new branch: `git checkout -b epic1-ticket1.5-proxy-nudge-logic`
3. Confirm you're on the new branch before making any changes

Previous tickets completed:
- Ticket 1.1: Added ReachabilityTier enum and contactMethod to PersonEvent
- Ticket 1.2: Added Household and HouseholdMember models
- Ticket 1.3: Enhanced shared link claim, added contact-info upgrade endpoint
- Ticket 1.4: Dashboard reachability bar with tier breakdown

These changes are already merged to master.

---

# TICKET 1.5: Proxy Nudge Logic (Unclaimed Slots)

## Context

When household members don't claim their slot, the proxy should be nudged to follow up. This completes Epic 1 (Reachability).

**Depends on:** Tickets 1.1-1.4 (Household models, nudge infrastructure, dashboard)

## File Locations

```
src/lib/sms/nudge-templates.ts    — Add PROXY_HOUSEHOLD_REMINDER template
src/lib/sms/nudge-eligibility.ts  — Add proxy nudge targeting logic
src/lib/sms/nudge-scheduler.ts    — Schedule proxy nudges
src/app/api/cron/nudges/route.ts  — Cron trigger (extend, don't replace)
src/app/(dashboard)/...           — Show escalation status
```

## Build Spec

### 1. Eligibility (`nudge-eligibility.ts`)

Find proxy nudge targets where:
- `HouseholdMember.claimedAt IS NULL`
- `HouseholdMember.escalatedAt IS NULL`
- Household proxy has valid phone (`PersonEvent.contactMethod = SMS`)

### 2. Schedule

| Trigger | Condition | Action |
|---------|-----------|--------|
| 24h after `Household.createdAt` | `proxyNudgeCount = 0` | Send first nudge, increment count |
| 48h after `Household.createdAt` | `proxyNudgeCount = 1` | Send second nudge, increment count |
| After 2nd nudge | `proxyNudgeCount = 2` | Set `escalatedAt = now()`, stop nudging |

### 3. Template (`nudge-templates.ts`)

```typescript
PROXY_HOUSEHOLD_REMINDER: {
  key: 'proxy_household_reminder',
  body: '{{eventName}}: {{unclaimedCount}} people in your group haven\'t confirmed yet. Can you check in with them? {{dashboardLink}}'
}
```

### 4. Error Handling

| Condition | Response |
|-----------|----------|
| Proxy has no phone | Skip, log warning |
| SMS send fails | Log error, don't increment `proxyNudgeCount` |
| Household deleted mid-cron | Skip gracefully |

### 5. Dashboard

Show on household row:
- Nudge count badge (0/1/2)
- "Escalated" label when `escalatedAt` is set
- Last nudge timestamp

## Do Not Touch

- Tier 1 direct nudge logic
- SMS infrastructure (`twilio-client.ts`, `send-sms.ts`)
- Magic link flows

## Done When

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Unit test: eligible households returned correctly
- [ ] Unit test: ineligible households (claimed, escalated, no phone) excluded
- [ ] Integration test: nudge cron creates correct SMS jobs

## Verification Steps

```
1. Create event, add household (Lisa = proxy with phone, Tom = unclaimed member)
2. Set Household.createdAt to 25h ago
3. Run: curl -X POST /api/cron/nudges
4. Assert: Lisa received SMS, Tom's proxyNudgeCount = 1
5. Set Household.createdAt to 49h ago
6. Run cron again
7. Assert: proxyNudgeCount = 2, escalatedAt is set
8. Run cron again
9. Assert: No new SMS sent
```

## Edge Cases to Handle

- Multiple unclaimed members → single nudge to proxy (not per-member)
- Proxy is also a household member elsewhere → don't double-nudge
- Member claims between nudge scheduling and sending → skip send

---

**Changes made:**

1. **Collapsed redundant context** — removed the "What is Gather?" boilerplate
2. **Added eligibility criteria** — explicit SQL-style conditions, not prose
3. **Schedule as table** — scannable, unambiguous timing logic
4. **Error handling section** — the missing defensive spec
5. **Concrete template** — actual copy, not just "add a template"
6. **Test requirements** — unit and integration, not just "build passes"
7. **Verification as script** — reproducible steps with assertions
8. **Edge cases** — the gotchas that would otherwise surface in PR review



---
After completing all work and verification:

1. Create `TICKET_1.5_IMPLEMENTATION.md` in the project root documenting:
   - All files created or modified
   - Summary of changes made
   - Build status (typecheck, build results)
   - Verification results
   - Any implementation decisions or notes

2. Stage and commit all changes:
```bash
git add .
git commit -m "Ticket 1.5: Proxy nudge logic for unclaimed household slots"
```

3. Show me the final git status and confirm the branch is ready to merge to master.