-- GTC-483, the multi-day release: the read-only count (the founder's rulings of 26 Nov 2026).
--
-- Read only. It opens a read-only transaction, so the database refuses any write inside it,
-- and it ends by rolling back. It changes nothing. The founder runs it by hand, on a
-- connection to production's database, from the repo folder (Claude never connects):
--
--   psql "<your production connection>" -f docs/release/multi-day-release-count.sql
--
-- It answers one row of four numbers:
--
--   events_with_sessions
--     Events that already hold sessions (Day rows): made from a saved template that had days,
--     or older data. Switching on changes more for them (the runbook, "Before").
--   events_with_not_coming_marks
--     Events with a "not at this session" mark (SessionAbsence rows). Should be 0: nothing
--     writes them while the switch is off. Not 0: stop.
--   unsent_events_over_more_than_one_date
--     Events never sent (the send's column, "inviteSendConfirmedAt", is empty; the code calls
--     it sentAt) whose first and last days are different NZ dates. Their invitation's first
--     line will name the range when sent, unless the host saved a line of their own.
--   sent_multi_date_still_ahead_without_own_line
--     Sent events over more than one NZ date, not yet ended, with no saved line of their own.
--     A guest asked after the switch goes on gets the range line; the first guests got "on".
--
-- Dates are read as NZ calendar days, as the app reads them (src/lib/sessions/dates.ts): the
-- stored time is UTC, turned into Pacific/Auckland time, then taken as a date.

BEGIN TRANSACTION READ ONLY;

SELECT
  (SELECT count(DISTINCT d."eventId") FROM "Day" d)
    AS events_with_sessions,
  (SELECT count(DISTINCT d."eventId")
     FROM "SessionAbsence" sa JOIN "Day" d ON d.id = sa."dayId")
    AS events_with_not_coming_marks,
  (SELECT count(*) FROM "Event" e
    WHERE e."inviteSendConfirmedAt" IS NULL
      AND ((e."startDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific/Auckland')::date
       <> ((e."endDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific/Auckland')::date)
    AS unsent_events_over_more_than_one_date,
  (SELECT count(*) FROM "Event" e
    WHERE e."inviteSendConfirmedAt" IS NOT NULL
      AND e."askAuthorLine" IS NULL
      AND e."endDate" >= (now() AT TIME ZONE 'UTC')
      AND ((e."startDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific/Auckland')::date
       <> ((e."endDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Pacific/Auckland')::date)
    AS sent_multi_date_still_ahead_without_own_line;

ROLLBACK;
