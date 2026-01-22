# Security Route Inventory

Generated: 2026-01-19T07:02:45.250Z

Total routes: 74
Mutation routes: 34
Session auth: 11
Token auth: 10
Public: 2
Unknown auth: 51

## Route Table

| Path | Method | Mutation? | Auth Type | Required Role(s) | Team Scoped? | Frozen Rule | File Path |
|------|--------|-----------|-----------|------------------|--------------|-------------|-----------|
| /auth/claim | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/auth/claim/route.ts |
| /auth/logout | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/auth/logout/route.ts |
| /auth/magic-link | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/auth/magic-link/route.ts |
| /auth/verify | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/auth/verify/route.ts |
| /billing/cancel | POST | YES | SESSION | UNKNOWN | NO | NONE | src/app/api/billing/cancel/route.ts |
| /billing/checkout | POST | YES | SESSION | UNKNOWN | NO | NONE | src/app/api/billing/checkout/route.ts |
| /billing/portal | POST | NO | SESSION | UNKNOWN | NO | NONE | src/app/api/billing/portal/route.ts |
| /billing/status | GET | NO | SESSION | UNKNOWN | NO | NONE | src/app/api/billing/status/route.ts |
| /c/:token | GET | NO | TOKEN | COORDINATOR | YES | NONE | src/app/api/c/[token]/route.ts |
| /c/:token/ack/:assignmentId | POST | NO | TOKEN | COORDINATOR | NO | NONE | src/app/api/c/[token]/ack/[assignmentId]/route.ts |
| /c/:token/items | POST | NO | TOKEN | COORDINATOR | YES | BLOCKED_ALL | src/app/api/c/[token]/items/route.ts |
| /c/:token/items/:itemId | PATCH, DELETE | NO | TOKEN | COORDINATOR | YES | BLOCKED_ALL | src/app/api/c/[token]/items/[itemId]/route.ts |
| /c/:token/items/:itemId/assign | POST, DELETE | NO | TOKEN | COORDINATOR | YES | BLOCKED_ALL | src/app/api/c/[token]/items/[itemId]/assign/route.ts |
| /demo/reset | POST | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/demo/reset/route.ts |
| /demo/tokens | GET | NO | UNKNOWN | COORDINATOR | NO | NONE | src/app/api/demo/tokens/route.ts |
| /entitlements/check-create | GET | NO | SESSION | UNKNOWN | NO | NONE | src/app/api/entitlements/check-create/route.ts |
| /events | GET, POST | NO | SESSION | COORDINATOR | NO | NONE | src/app/api/events/route.ts |
| /events/:id | GET, PATCH, DELETE | YES | SESSION | UNKNOWN | NO | NONE | src/app/api/events/[id]/route.ts |
| /events/:id/archive | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/archive/route.ts |
| /events/:id/assignments | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/assignments/route.ts |
| /events/:id/check | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/check/route.ts |
| /events/:id/conflicts | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/conflicts/route.ts |
| /events/:id/conflicts/:conflictId | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/conflicts/[conflictId]/route.ts |
| /events/:id/conflicts/:conflictId/acknowledge | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/conflicts/[conflictId]/acknowledge/route.ts |
| /events/:id/conflicts/:conflictId/delegate | POST | YES | UNKNOWN | COORDINATOR | NO | NONE | src/app/api/events/[id]/conflicts/[conflictId]/delegate/route.ts |
| /events/:id/conflicts/:conflictId/dismiss | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/conflicts/[conflictId]/dismiss/route.ts |
| /events/:id/conflicts/:conflictId/execute-resolution | POST | YES | UNKNOWN | UNKNOWN | YES | NONE | src/app/api/events/[id]/conflicts/[conflictId]/execute-resolution/route.ts |
| /events/:id/conflicts/:conflictId/resolve | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/conflicts/[conflictId]/resolve/route.ts |
| /events/:id/conflicts/:conflictId/suggest-resolution | POST | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/conflicts/[conflictId]/suggest-resolution/route.ts |
| /events/:id/conflicts/dismissed | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/conflicts/dismissed/route.ts |
| /events/:id/days | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/days/route.ts |
| /events/:id/gate-check | POST | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/gate-check/route.ts |
| /events/:id/generate | POST | YES | UNKNOWN | UNKNOWN | YES | NONE | src/app/api/events/[id]/generate/route.ts |
| /events/:id/items | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/items/route.ts |
| /events/:id/items/:itemId | PATCH, DELETE | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/items/[itemId]/route.ts |
| /events/:id/items/:itemId/assign | POST, DELETE | YES | SESSION | HOST, COORDINATOR | YES | BLOCKED_ALL | src/app/api/events/[id]/items/[itemId]/assign/route.ts |
| /events/:id/items/mark-for-review | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/items/mark-for-review/route.ts |
| /events/:id/people | GET, POST | YES | SESSION | HOST, COORDINATOR, PARTICIPANT | NO | NONE | src/app/api/events/[id]/people/route.ts |
| /events/:id/people/:personId | PATCH, DELETE | YES | UNKNOWN | COORDINATOR, PARTICIPANT | YES | NONE | src/app/api/events/[id]/people/[personId]/route.ts |
| /events/:id/people/auto-assign | POST | NO | UNKNOWN | PARTICIPANT | YES | NONE | src/app/api/events/[id]/people/auto-assign/route.ts |
| /events/:id/people/batch-import | POST | YES | UNKNOWN | PARTICIPANT | NO | NONE | src/app/api/events/[id]/people/batch-import/route.ts |
| /events/:id/regenerate | POST | YES | UNKNOWN | UNKNOWN | YES | NONE | src/app/api/events/[id]/regenerate/route.ts |
| /events/:id/regenerate/preview | POST | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/regenerate/preview/route.ts |
| /events/:id/restore | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/restore/route.ts |
| /events/:id/review-items | GET, POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/review-items/route.ts |
| /events/:id/revisions | GET, POST | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/revisions/route.ts |
| /events/:id/revisions/:revisionId | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/revisions/[revisionId]/route.ts |
| /events/:id/revisions/:revisionId/restore | POST | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/revisions/[revisionId]/restore/route.ts |
| /events/:id/suggestions | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/suggestions/route.ts |
| /events/:id/suggestions/:suggestionId | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/suggestions/[suggestionId]/route.ts |
| /events/:id/suggestions/:suggestionId/accept | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/suggestions/[suggestionId]/accept/route.ts |
| /events/:id/suggestions/:suggestionId/dismiss | POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/suggestions/[suggestionId]/dismiss/route.ts |
| /events/:id/suggestions/:suggestionId/explain | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/suggestions/[suggestionId]/explain/route.ts |
| /events/:id/summary | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/summary/route.ts |
| /events/:id/teams | GET, POST | YES | SESSION | HOST, COORDINATOR | NO | NONE | src/app/api/events/[id]/teams/route.ts |
| /events/:id/teams/:teamId | DELETE | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/teams/[teamId]/route.ts |
| /events/:id/teams/:teamId/items | GET, POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/teams/[teamId]/items/route.ts |
| /events/:id/tokens | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/tokens/route.ts |
| /events/:id/transition | POST | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/events/[id]/transition/route.ts |
| /gather/:eventId/directory | GET | NO | PUBLIC | PARTICIPANT | NO | NONE | src/app/api/gather/[eventId]/directory/route.ts |
| /h/:token | GET | NO | SESSION | UNKNOWN | NO | NONE | src/app/api/h/[token]/route.ts |
| /h/:token/audit | GET | NO | TOKEN | UNKNOWN | NO | NONE | src/app/api/h/[token]/audit/route.ts |
| /h/:token/status | PATCH | NO | TOKEN | UNKNOWN | NO | BLOCKED_COORDINATOR | src/app/api/h/[token]/status/route.ts |
| /h/:token/team/:teamId | GET | NO | TOKEN | UNKNOWN | YES | NONE | src/app/api/h/[token]/team/[teamId]/route.ts |
| /memory | GET, DELETE | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/memory/route.ts |
| /memory/patterns | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/memory/patterns/route.ts |
| /memory/settings | PATCH | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/memory/settings/route.ts |
| /p/:token | GET | NO | TOKEN | PARTICIPANT | NO | NONE | src/app/api/p/[token]/route.ts |
| /p/:token/ack/:assignmentId | POST | NO | TOKEN | PARTICIPANT | NO | NONE | src/app/api/p/[token]/ack/[assignmentId]/route.ts |
| /templates | GET, POST | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/templates/route.ts |
| /templates/:id | GET, DELETE | YES | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/templates/[id]/route.ts |
| /templates/:id/clone | POST | YES | UNKNOWN | UNKNOWN | YES | NONE | src/app/api/templates/[id]/clone/route.ts |
| /templates/gather | GET | NO | UNKNOWN | UNKNOWN | NO | NONE | src/app/api/templates/gather/route.ts |
| /webhooks/stripe | POST | NO | PUBLIC | UNKNOWN | NO | NONE | src/app/api/webhooks/stripe/route.ts |

## Mutation Routes Only

| Path | Method | Auth Type | Required Role(s) | Team Scoped? | Frozen Rule |
|------|--------|-----------|------------------|--------------|-------------|
| /auth/claim | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /auth/logout | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /auth/magic-link | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /auth/verify | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /billing/cancel | POST | SESSION | UNKNOWN | NO | NONE |
| /billing/checkout | POST | SESSION | UNKNOWN | NO | NONE |
| /events/:id | PATCH, DELETE | SESSION | UNKNOWN | NO | NONE |
| /events/:id/archive | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/check | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/conflicts/:conflictId/acknowledge | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/conflicts/:conflictId/delegate | POST | UNKNOWN | COORDINATOR | NO | NONE |
| /events/:id/conflicts/:conflictId/dismiss | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/conflicts/:conflictId/execute-resolution | POST | UNKNOWN | UNKNOWN | YES | NONE |
| /events/:id/conflicts/:conflictId/resolve | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/generate | POST | UNKNOWN | UNKNOWN | YES | NONE |
| /events/:id/items/:itemId | PATCH, DELETE | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/items/:itemId/assign | POST, DELETE | SESSION | HOST, COORDINATOR | YES | BLOCKED_ALL |
| /events/:id/items/mark-for-review | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/people | POST | SESSION | HOST, COORDINATOR, PARTICIPANT | NO | NONE |
| /events/:id/people/:personId | PATCH, DELETE | UNKNOWN | COORDINATOR, PARTICIPANT | YES | NONE |
| /events/:id/people/batch-import | POST | UNKNOWN | PARTICIPANT | NO | NONE |
| /events/:id/regenerate | POST | UNKNOWN | UNKNOWN | YES | NONE |
| /events/:id/restore | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/review-items | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/suggestions/:suggestionId/accept | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/suggestions/:suggestionId/dismiss | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/teams | POST | SESSION | HOST, COORDINATOR | NO | NONE |
| /events/:id/teams/:teamId | DELETE | UNKNOWN | UNKNOWN | NO | NONE |
| /events/:id/teams/:teamId/items | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /memory | DELETE | UNKNOWN | UNKNOWN | NO | NONE |
| /memory/settings | PATCH | UNKNOWN | UNKNOWN | NO | NONE |
| /templates | POST | UNKNOWN | UNKNOWN | NO | NONE |
| /templates/:id | DELETE | UNKNOWN | UNKNOWN | NO | NONE |
| /templates/:id/clone | POST | UNKNOWN | UNKNOWN | YES | NONE |

## Security Notes

### /c/:token/items
- // SECURITY: Block mutations when FROZEN (server-side validation)

### /c/:token/items/:itemId
- // SECURITY: Block mutations when FROZEN (server-side validation)
- // SECURITY: Block mutations when FROZEN (server-side validation)

### /c/:token/items/:itemId/assign
- // SECURITY: Block mutations when FROZEN (server-side validation)
- // SECURITY: Block mutations when FROZEN (server-side validation)

### /events/:id/tokens
- // SECURITY: Host-only endpoint

