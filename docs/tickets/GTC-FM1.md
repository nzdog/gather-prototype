# BUILD TICKET — GTC-FM1

## Ticket Title
`Host-initiated nudge with one-tap warm message sending`

## This Ticket Builds
When a host views their event dashboard and sees guests with unacknowledged task assignments, they can send a pre-written warm nudge message to any individual guest with a single tap, choosing from a small set of tone variants.

---

## Evidence Package (Executor-Completed)

- **Root cause / implementation approach:**
  No bug — this is an additive feature. Added a `NUDGE_SENT_HOST` event type to the existing `InviteEvent` audit log (schema enum extension + migration). Created a new POST API route at `/api/events/[id]/people/[personId]/nudge` that handles auth (HOST only), 24hr cooldown enforcement (queried from InviteEvent), contact method resolution (SMS preferred, email fallback), message dispatch via existing `sendSms()` / new `sendNudgeEmail()`, and dual logging (sendSms auto-log + explicit NUDGE_SENT_HOST log). UI surfaces nudge action in PersonInviteDetailModal with inline NudgeComposer component offering 4 template variants, free edit, and send button. Cooldown, no-contact, and error states all handled in UI.

- **Files changed:**
  - `prisma/schema.prisma` — added `NUDGE_SENT_HOST` to `InviteEventType` enum
  - `prisma/migrations/20260407004520_add_nudge_sent_host_event_type/migration.sql` — generated migration
  - `src/app/api/events/[id]/people/[personId]/nudge/route.ts` — **new** POST endpoint
  - `src/app/api/events/[id]/people/[personId]/invite-detail/route.ts` — added `lastHostNudgeAt`, item names, `eventName`, `eventDate` to response
  - `src/lib/email.ts` — added `sendNudgeEmail()` function
  - `src/lib/sms/nudge-templates.ts` — added 4 host nudge template variants + types + labels
  - `src/components/plan/PersonInviteDetailModal.tsx` — added nudge section, HostNudgeSection component, updated interface
  - `src/components/plan/NudgeComposer.tsx` — **new** inline template selector + message editor + send button
  - `tests/host-nudge-test.ts` — **new** 40-assertion regression test
  - `package.json` — added `test:host-nudge` script

- **Test results:**
  - `npm run test:host-nudge` — 40/40 passed
  - `npm run test:security` — 16/16 passed (no regression)

- **Assertions checked:**
  1. All 4 template variants generate non-empty personalised messages
  2. Personalisation tokens (guestFirstName, taskItem, eventName, eventDate) resolve correctly in all variants
  3. Unicode detection correct for emoji and em-dash templates
  4. Multi-segment SMS calculation works for Unicode messages
  5. Variant display labels exist for all 4 variants
  6. Long names handled without truncation
  7. 24hr cooldown window: 23h-old nudge still locked, 25h-old nudge unlocked, null = unlocked
  8. Contact method fallback: SMS preferred > email fallback > none when no contact

- **Commit hash:** `7bc243b`
