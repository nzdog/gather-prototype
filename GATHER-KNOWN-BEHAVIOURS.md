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
