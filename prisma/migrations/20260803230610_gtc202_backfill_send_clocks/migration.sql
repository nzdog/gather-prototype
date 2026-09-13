-- GTC-202 (A3c-2) — the backfill plan §9.3 specified and GTC-168 (A2) did not run.
--
-- DATA ONLY. Four UPDATEs, zero DDL. Created with `prisma migrate dev --create-only`,
-- which correctly produced an empty migration (there is no schema diff), and authored
-- into — Prisma's own path for a data migration. No generated SQL was edited.
--
-- WHY THIS IS OWED. A2 added `PersonEvent.sentAt` and re-pointed `Event.sentAt` at the
-- existing `inviteSendConfirmedAt` column via `@map` (deviation 1, ruled: a physical
-- rename emits DROP+ADD non-interactively and would have destroyed the send timestamp
-- on every historical event). The `@map` satisfies clause 1 of §9.3 for free, and that
-- is what was verified — but §9.3 has four clauses, and the other three were never run.
-- `PersonEvent.sentAt` measured 0/N on every sent event in the dev database.
--
-- Every statement is guarded by `IS NULL`, so re-running is safe.

-- ─────────────────────────────────────────────────────────────────────────────
-- Event.sentAt  :=  inviteSendConfirmedAt          -- clause 1: the @map, no statement
--                ?? frozenAt                        -- clause 2: frozen, no recorded send
--                ?? updatedAt (if FROZEN/COMPLETE)  -- clause 3: last resort
--
-- Both statements are no-ops on the current dev database — no row has `frozenAt`, and
-- every sent row already carries `inviteSendConfirmedAt`. That is exactly why the
-- omission was invisible, and exactly why the statements belong here: a database with
-- real frozen history would have had events that read as sent through isSent()'s compat
-- shim while being invisible to SENT_AND_LIVE's SQL, which filters on the column alone.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "Event"
SET "inviteSendConfirmedAt" = "frozenAt"
WHERE "inviteSendConfirmedAt" IS NULL
  AND "frozenAt" IS NOT NULL;

UPDATE "Event"
SET "inviteSendConfirmedAt" = "updatedAt"
WHERE "inviteSendConfirmedAt" IS NULL
  AND "status" IN ('FROZEN', 'COMPLETE');

-- ─────────────────────────────────────────────────────────────────────────────
-- PersonEvent.sentAt  :=  Person.inviteAnchorAt   -- carried per membership
--                      ?? Event.sentAt             -- where the person predates anchoring
--
-- Only for events that have actually been sent: an unsent event's members have no send
-- clock, and stamping one would make isMiniSend() and E1's cadence read from a date on
-- which nothing happened.
--
-- KNOWN LIMITATION, carried deliberately rather than silently fixed:
-- `Person.inviteAnchorAt` is global across events (plan §8.2's per-person-for-a-
-- per-event-fact leak), so a person anchored in another event carries that anchor here.
-- §9.3 rules this backfill literally; clamping it would invent a rule the plan does not
-- state and would hide the leak. GTC-178 (E1) owns the anchor's move.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE "PersonEvent" pe
SET "sentAt" = p."inviteAnchorAt"
FROM "Person" p, "Event" e
WHERE pe."personId" = p."id"
  AND pe."eventId" = e."id"
  AND pe."sentAt" IS NULL
  AND p."inviteAnchorAt" IS NOT NULL
  AND e."inviteSendConfirmedAt" IS NOT NULL;

UPDATE "PersonEvent" pe
SET "sentAt" = e."inviteSendConfirmedAt"
FROM "Event" e
WHERE pe."eventId" = e."id"
  AND pe."sentAt" IS NULL
  AND e."inviteSendConfirmedAt" IS NOT NULL;
