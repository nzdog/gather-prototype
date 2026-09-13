-- GTC-174 (D1) — carry the directly-given attendance answers across.
--
-- DATA ONLY. Two UPDATEs, zero DDL. Created with `prisma migrate dev --create-only`,
-- which correctly produced an empty migration (there is no schema diff), and authored
-- into — Prisma's own path for a data migration. No generated SQL was edited
-- (Do-Not-Touch zone 5).
--
-- WHY. Hinge §3 (ruled gap #10) supersedes event-level RSVP as a guest-facing question,
-- so PersonEvent.rsvpStatus stops being written. But YES and NO in that column ARE
-- direct attendance answers guests actually gave — the same fact the new
-- attendanceAnswer column stores. Dropping them would silently un-answer people who
-- had answered.
--
-- NOT_SURE IS DELIBERATELY NOT CARRIED, AND THIS CHANGES WHAT THOSE ROWS MEAN. Their
-- stored "maybe I'm coming" becomes "attendance undetermined": they land at
-- attendanceAnswer IS NULL and read as UNKNOWN through deriveAttendance(). That is
-- correct under Hinge §8, which rules a maybe purely an ITEM-maybe — carried on
-- Assignment.response — with attendance unknown until the decide-by resolves it
-- (D2 / GTC-175). An attendance-maybe is abolished as a concept, not migrated: there
-- is no AttendanceAnswer value for it and there must not be. GTC-178 (E1) removes the
-- forced-conversion nudge that was the only machinery ever attached to NOT_SURE.
--
-- PENDING carries nothing: never asked, never answered, stays NULL.
--
-- attendanceAnsweredAt inherits rsvpRespondedAt, which may itself be NULL on a row
-- whose status was set without a timestamp. Such a row keeps its answer and loses only
-- the time of it — the column is nullable precisely so that stays honest.
--
-- Both statements are guarded by `IS NULL`, so re-running is safe. On the dev database
-- this is a verified no-op (all 61 PersonEvent rows read PENDING); the data-moving path
-- was proven separately against YES / NO / NOT_SURE / PENDING fixtures inside a
-- rolled-back transaction before this migration was applied.

UPDATE "PersonEvent"
SET "attendanceAnswer" = 'YES',
    "attendanceAnsweredAt" = "rsvpRespondedAt"
WHERE "attendanceAnswer" IS NULL
  AND "rsvpStatus" = 'YES';

UPDATE "PersonEvent"
SET "attendanceAnswer" = 'NO',
    "attendanceAnsweredAt" = "rsvpRespondedAt"
WHERE "attendanceAnswer" IS NULL
  AND "rsvpStatus" = 'NO';
