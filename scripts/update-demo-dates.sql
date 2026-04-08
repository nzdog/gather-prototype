-- GTC-050: Update stale demo event dates from December 2025 to December 2026
-- Safe to run against production — no rows created or deleted.
-- All three statements use the isDemo flag to scope changes to the demo event only.

-- 1. Update the event name and start/end dates
--    NZDT is UTC+13, so 2026-12-24 00:00 NZDT = 2026-12-23T11:00:00Z
--    and 2026-12-26 23:59 NZDT = 2026-12-26T10:59:00Z
UPDATE "Event"
SET "name"      = 'Henderson Family Christmas 2026',
    "startDate" = '2026-12-23T11:00:00.000Z',
    "endDate"   = '2026-12-26T10:59:00.000Z'
WHERE "isDemo" = true
  AND "name"   = 'Henderson Family Christmas 2025';

-- 2. Update the three day records (Christmas Eve, Christmas Day, Boxing Day)
--    Shifts each date forward by exactly one year
UPDATE "Day"
SET "date" = "date" + INTERVAL '1 year'
WHERE "eventId" = (SELECT "id" FROM "Event" WHERE "isDemo" = true LIMIT 1);

-- 3. Update item drop-off timestamps for all items belonging to the demo event
--    Shifts each drop-off time forward by exactly one year
UPDATE "Item"
SET "dropOffAt" = "dropOffAt" + INTERVAL '1 year'
WHERE "dropOffAt" IS NOT NULL
  AND "teamId" IN (
    SELECT "id" FROM "Team"
    WHERE "eventId" = (SELECT "id" FROM "Event" WHERE "isDemo" = true LIMIT 1)
  );
