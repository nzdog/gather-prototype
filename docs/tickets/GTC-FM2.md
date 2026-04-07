# GTC-FM2 — Post-event guest wrap-up message with host conversion CTA

## Evidence Package (Executor-Completed)

### Root cause / implementation approach

Built the complete wrap-up flow: when a host clicks "Wrap up event" on a FROZEN event, the system transitions the event to COMPLETE, generates a unique `WrapUpLink` per guest (with 30-day expiry), and queues personalised thank-you messages for delayed dispatch (10-minute delay for human feel). Messages are sent via SMS (preferred) with email fallback, using existing Twilio and Resend infrastructure. Each message contains a unique `/start/[token]` link that resolves to `/plan/new` with pre-populated guest name, email, and phone — the primary viral loop CTA.

### Files changed

| Action | File |
|---|---|
| Migrate | `prisma/schema.prisma` — added `Event.wrappedAt`, `WrapUpLink` model, `WRAPUP_MESSAGE_SENT`/`WRAPUP_MESSAGE_FAILED` to `InviteEventType` |
| Migrate | `prisma/migrations/20260407010613_add_wrapup_link_model/migration.sql` |
| Create | `src/lib/sms/wrap-up-templates.ts` — SMS + email message templates with token interpolation |
| Create | `src/lib/wrap-up.ts` — core logic: link generation, dispatch, summary, retry, query param sanitisation |
| Create | `src/app/api/events/[id]/wrap-up/route.ts` — POST: host confirms wrap-up |
| Create | `src/app/api/events/[id]/wrap-up/status/route.ts` — GET: dispatch summary |
| Create | `src/app/api/events/[id]/wrap-up/retry/route.ts` — POST: retry failed dispatches |
| Create | `src/app/api/cron/wrap-up-dispatch/route.ts` — GET/POST: cron job for delayed message dispatch |
| Create | `src/app/start/[token]/route.ts` — GET: resolves WrapUpLink token, redirects to `/plan/new` with pre-populated params |
| Edit | `src/app/api/events/[id]/transition/route.ts` — added FROZEN->COMPLETE handler block |
| Edit | `src/app/plan/[eventId]/page.tsx` — wrap-up card + expansion section with confirmation, status, retry UI |
| Edit | `src/app/plan/new/page.tsx` — pre-populated query params (sanitised), expired link notice |
| Edit | `package.json` — added `test:wrap-up` script |
| Create | `tests/wrap-up-dispatch-test.ts` — 35 pure-logic tests |
| Create | `docs/tickets/GTC-FM2.md` |

### Test results

- `npm run test:wrap-up` — **35/35 passed**
  - SMS template interpolation (5)
  - Email template interpolation (6)
  - Guest task item resolution (3)
  - Query param sanitisation (11)
  - Link token generation (4)
  - Start link construction (2)
  - Pre-event date check logic (2)
  - Link expiry logic (2)
- `npm run test:security` — **16/16 passed** (unchanged)

### Assertions checked

1. Wrap-up action visible on FROZEN event dashboard as "Wrap Up Event" card
2. Clicking wrap-up opens confirmation prompt with event name
3. Confirmation transitions event to COMPLETE and generates WrapUpLinks
4. Dispatch log records sent/failed/skipped per guest
5. Message templates correctly interpolate all tokens (guest name, task item, event name, host name, link)
6. Pre-populated link resolves to `/plan/new` with sanitised name/email/phone params
7. Pre-event wrap-up (endDate not passed) returns warning requiring explicit confirmation
8. Declining confirmation (not calling the endpoint) leaves event in FROZEN status
9. Guests without contact details are channel="skipped" and counted in summary
10. Expired links redirect to `/plan/new?expired=true` with dismissible notice
11. All pre-populated query params are sanitised against XSS

### Commit hash
`02244d2`
