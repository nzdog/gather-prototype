# GATHER-KNOWN-BEHAVIOURS.md
# Confirmed platform quirks and diagnostic patterns for AI executors.
# Read this file when a ticket involves unexpected platform behaviour,
# stale UI state, auth anomalies, or DB irregularities.
# Last updated: 2026-03-05

---

## How to Use This File
Each entry documents a confirmed platform behaviour that is NOT a bug in
Gather but may be misdiagnosed as one. Before touching auth, session,
middleware, or DB code to fix an unexpected behaviour, check this file.

Entries follow this format:
- Symptom: what the executor observes
- Cause: why it happens
- Fix pattern: the correct resolution approach
- Do not: what not to do
- First seen: ticket reference

---

## Known Behaviours

### KB-001 — Next.js RSC prefetch causes stale auth-dependent UI
**Symptom:** Nav or other server-rendered UI shows stale auth state
(e.g. "Sign In" instead of user email) on routes accessed via Next.js
`<Link>` prefetch.
**Cause:** Next.js prefetches RSC payloads for routes linked via `<Link>`.
When the user navigates to a prefetched route, Next.js serves the cached
payload without re-running server components — so session-dependent
functions like `getUser()` do not fire and auth-dependent UI appears stale.
This is expected Next.js behaviour, not a Gather bug.
**Fix pattern:** Call `router.refresh()` after auth state changes to force
a fresh server render. Apply at the route level only.
**Do not:** Touch auth, session, middleware, or cookie logic to resolve this.
**First seen:** GTC-002

---

### KB-002 — DB schema drift (P3005)
**Symptom:** `npm run db:migrate` reports schema drift — DB schema is ahead
of migration history.
**Cause:** Pre-existing condition. Schema was modified outside the migration
system at some point. DB is functional and all security tests pass.
**Fix pattern:** Do not attempt to resolve during bug fix tickets unless
the ticket explicitly authorises a migration fix with rollback plan.
**Do not:** Run `prisma migrate reset` or alter migration files to resolve.
This is a chore-level issue requiring explicit authorisation.
**First seen:** GTC-002 preflight

---

### KB-003 — window.history.replaceState() does not update Next.js useSearchParams()
**Symptom:** A URL param that was removed via window.history.replaceState()
reappears in searchParams when a handler builds a new URL from the current
params, re-triggering effects that depend on that param.
**Cause:** window.history.replaceState() updates the browser URL but does
not sync Next.js useSearchParams() state. Handlers that build URLs by
copying current searchParams will carry stale params forward.
**Fix pattern:** When building a navigation URL from searchParams, always
explicitly call params.delete() on any param that should not persist before
calling router.push(). Do not rely on the browser URL as the source of
truth for searchParams state.
**Do not:** Use window.history.replaceState() to manage params that affect
Next.js effect hooks or URL-derived state.
**First seen:** GTC-003

---

### KB-004 — Default seed creates a CONFIRMING event, not a DRAFT event
**Symptom:** Reproduction steps requiring a DRAFT event fail when run
against the default seed — the seeded event is in CONFIRMING status.
**Cause:** prisma/seed.ts creates an event in CONFIRMING state by default.
DRAFT events from prior test sessions may exist in the DB but cannot be
relied upon.
**Fix pattern:** For tickets requiring a DRAFT event, either:
1. Create the event via UI steps (pay → complete setup modal), or
2. Direct DB insert to set status to DRAFT (include rollback note), or
3. Update seed.ts to include a DRAFT event (only if authorised by ticket).
**Do not:** Assume default seed produces a DRAFT event. Always verify
event status before beginning reproduction steps.
**First seen:** GTC-003

---
