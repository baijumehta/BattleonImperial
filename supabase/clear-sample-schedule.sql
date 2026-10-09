-- =============================================================================
-- Battle on Imperial — clear the sample schedule and standings
--
-- Removes the 20 invented teams and 30 invented games that were loaded so the
-- schedule and standings pages could be reviewed before real entries existed.
-- Afterwards both pages show "not published yet" until real teams are added in
-- Tournament Control.
--
-- Touches only tournament_teams and games. Registrations — the entries coaches
-- submit through the site — are a separate table and are NOT affected.
--
-- Run in the SQL Editor. One transaction: it all goes, or none of it does.
-- =============================================================================

begin;

-- games references tournament_teams with on delete cascade, so deleting the
-- teams would take the games anyway. Deleting games first says so plainly.
delete from public.games;
delete from public.tournament_teams;

commit;

-- Both should read 0.
select
  (select count(*) from public.tournament_teams) as teams_left,
  (select count(*) from public.games)            as games_left,
  (select count(*) from public.registrations)    as registrations_untouched;
