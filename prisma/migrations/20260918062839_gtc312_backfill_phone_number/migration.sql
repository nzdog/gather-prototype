-- GTC-312 — a number she can see and Gather cannot use.
--
-- DATA ONLY. One UPDATE, zero DDL. Created with `prisma migrate dev --create-only`,
-- which correctly produced an empty migration (there is no schema diff), and authored
-- into — Prisma's own path for a data migration, and the precedent this repo already set
-- at `20260803230610_gtc202_backfill_send_clocks`. No generated SQL was edited.
--
-- WHAT THIS REPAIRS. `Person` carries two phone columns. `phoneNumber` is the one every
-- sender reads — `findNudgeCandidates` in src/lib/sms/nudge-eligibility.ts,
-- `chooseManualNudgeChannel`, `findDecideByFollowupCandidates`, and `ChooserPerson` in
-- src/lib/eligibility/channel-chooser.ts, whose own field comment says so. `phone` is the
-- legacy column, which ONE capture path of six wrote and which nothing read.
--
-- Measured read-only on gather_dev, 2026-09-18: 333 `Person` rows — 12 carrying
-- `phoneNumber`, 35 carrying `phone` alone, and the two populations DISJOINT, no row
-- holding both. That disjointness is the signature of a write path that picks one column
-- and never the other. Thirty-five people held a usable number in a column nothing reads,
-- and were shown it on three screens anyway.
--
-- WHY A STRAIGHT COPY IS SAFE HERE — measured before writing, not assumed:
--   * All 35 values already match `^\+64[0-9]{8,10}$`. There is nothing to normalise and
--     this migration calls no normaliser. `ImportCSVModal` normalises client-side, which
--     is why the stored values are valid even though the route that saved them did not.
--   * No row holds BOTH columns, so the copy overwrites nothing. The `IS NULL` guard below
--     enforces that rather than trusting it, and makes a re-run a no-op.
--   * ZONE 7 CHECKED BEFORE WRITING. No `SmsOptOut` row keys on any of the 35 numbers, so
--     no opt-out changes which person it matches. `tests/phone-column-unification-test.ts`
--     layer Z asserts the INVARIANT — every opt-out that matched by either column still
--     matches by `phoneNumber` — rather than the count, so it holds on any database,
--     including one where the count is not zero.
--
-- ⚠ `phone` IS LEFT POPULATED AND IS NOT DROPPED. Founder ruling, GTC-312 Unknown 1,
-- 2026-09-18: unify, with the drop held back. Leaving the old column in place keeps this
-- step additive and reversible, and the DROP becomes its own later migration once a
-- production population has been measured — which nobody has done, and which this machine
-- cannot reach. Until then the column is written by nothing and read by nothing.

UPDATE "Person"
SET "phoneNumber" = phone
WHERE phone IS NOT NULL
  AND "phoneNumber" IS NULL;
