-- =============================================================================
-- Battle on Imperial — sample tournament schedule & standings data
--
-- SAMPLE DATA. Twenty invented teams so the schedule and standings pages can be
-- reviewed before real entries exist. Delete it all with the last statement in
-- this file when the real field is set.
--
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

create table if not exists public.tournament_teams (
  id    text primary key,
  name  text not null,
  level text not null check (level in ('Varsity', 'JV')),
  pool  text not null check (pool ~ '^[A-Z]$'),
  seed  int  not null default 0
);

create table if not exists public.games (
  id          text primary key,
  pool        text not null,
  round       int  not null check (round between 1 and 8),
  slot        int  not null check (slot >= 0),
  field       int  not null check (field >= 1),
  time_label  text not null,
  home_id     text not null references public.tournament_teams(id) on delete cascade,
  away_id     text not null references public.tournament_teams(id) on delete cascade,
  home_score  int check (home_score >= 0),
  away_score  int check (away_score >= 0),
  status      text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'final', 'cancelled')),
  check (home_id <> away_id)
);

create index if not exists games_slot_idx on public.games (slot, field);
create index if not exists games_pool_idx on public.games (pool);

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- Schedules and standings are public information — anyone should be able to read
-- them, including people who are not signed in. So unlike the registrations
-- table, these two DO grant SELECT to anon. They grant nothing else: scores are
-- updated from the Supabase dashboard, never from the page.
-- -----------------------------------------------------------------------------

alter table public.tournament_teams enable row level security;
alter table public.games            enable row level security;

drop policy if exists "anyone can read teams" on public.tournament_teams;
create policy "anyone can read teams" on public.tournament_teams
  for select to anon using (true);

drop policy if exists "anyone can read games" on public.games;
create policy "anyone can read games" on public.games
  for select to anon using (true);

revoke all on public.tournament_teams from anon;
revoke all on public.games            from anon;
grant select on public.tournament_teams to anon;
grant select on public.games            to anon;

-- -----------------------------------------------------------------------------
-- Sample data
-- -----------------------------------------------------------------------------

delete from public.games;
delete from public.tournament_teams;

insert into public.tournament_teams (id, name, level, pool, seed) values
  ('canyon', 'Canyon', 'Varsity', 'A', 0),
  ('vista-grande', 'Vista Grande', 'Varsity', 'A', 1),
  ('silverado-hills', 'Silverado Hills', 'Varsity', 'A', 2),
  ('harbor-crest', 'Harbor Crest', 'Varsity', 'A', 3),
  ('summit-ridge', 'Summit Ridge', 'Varsity', 'B', 0),
  ('oakridge', 'Oakridge', 'Varsity', 'B', 1),
  ('cypress-point', 'Cypress Point', 'Varsity', 'B', 2),
  ('northgate', 'Northgate', 'Varsity', 'B', 3),
  ('monte-vista-prep', 'Monte Vista Prep', 'Varsity', 'C', 0),
  ('stonebridge', 'Stonebridge', 'Varsity', 'C', 1),
  ('lakeview', 'Lakeview', 'Varsity', 'C', 2),
  ('redhawk', 'Redhawk', 'Varsity', 'C', 3),
  ('canyon-jv', 'Canyon JV', 'JV', 'D', 0),
  ('vista-grande-jv', 'Vista Grande JV', 'JV', 'D', 1),
  ('oakridge-jv', 'Oakridge JV', 'JV', 'D', 2),
  ('westmont-jv', 'Westmont JV', 'JV', 'D', 3),
  ('summit-ridge-jv', 'Summit Ridge JV', 'JV', 'E', 0),
  ('harbor-crest-jv', 'Harbor Crest JV', 'JV', 'E', 1),
  ('pinecrest-jv', 'Pinecrest JV', 'JV', 'E', 2),
  ('bridgeport-jv', 'Bridgeport JV', 'JV', 'E', 3);

insert into public.games (id, pool, round, slot, field, time_label, home_id, away_id, home_score, away_score, status) values
  ('A-R1-1', 'A', 1, 0, 1, '8:00 AM', 'canyon', 'vista-grande', 11, 15, 'final'),
  ('A-R1-2', 'A', 1, 0, 2, '8:00 AM', 'silverado-hills', 'harbor-crest', 13, 15, 'final'),
  ('B-R1-1', 'B', 1, 0, 3, '8:00 AM', 'summit-ridge', 'oakridge', 5, 14, 'final'),
  ('B-R1-2', 'B', 1, 1, 1, '8:50 AM', 'cypress-point', 'northgate', 10, 15, 'final'),
  ('C-R1-1', 'C', 1, 1, 2, '8:50 AM', 'monte-vista-prep', 'stonebridge', 9, 10, 'final'),
  ('C-R1-2', 'C', 1, 1, 3, '8:50 AM', 'lakeview', 'redhawk', 8, 7, 'final'),
  ('D-R1-1', 'D', 1, 2, 1, '9:40 AM', 'canyon-jv', 'vista-grande-jv', 13, 9, 'final'),
  ('D-R1-2', 'D', 1, 2, 2, '9:40 AM', 'oakridge-jv', 'westmont-jv', 7, 12, 'final'),
  ('E-R1-1', 'E', 1, 2, 3, '9:40 AM', 'summit-ridge-jv', 'harbor-crest-jv', 13, 12, 'final'),
  ('E-R1-2', 'E', 1, 3, 1, '10:30 AM', 'pinecrest-jv', 'bridgeport-jv', 15, 14, 'final'),
  ('A-R2-1', 'A', 2, 3, 2, '10:30 AM', 'canyon', 'silverado-hills', 12, 4, 'final'),
  ('A-R2-2', 'A', 2, 3, 3, '10:30 AM', 'vista-grande', 'harbor-crest', 15, 8, 'final'),
  ('B-R2-1', 'B', 2, 4, 1, '11:20 AM', 'summit-ridge', 'cypress-point', 6, 15, 'final'),
  ('B-R2-2', 'B', 2, 4, 2, '11:20 AM', 'oakridge', 'northgate', 15, 12, 'final'),
  ('C-R2-1', 'C', 2, 4, 3, '11:20 AM', 'monte-vista-prep', 'lakeview', 12, 6, 'final'),
  ('C-R2-2', 'C', 2, 5, 1, '12:10 PM', 'stonebridge', 'redhawk', 12, 15, 'final'),
  ('D-R2-1', 'D', 2, 5, 2, '12:10 PM', 'canyon-jv', 'oakridge-jv', 10, 8, 'final'),
  ('D-R2-2', 'D', 2, 5, 3, '12:10 PM', 'vista-grande-jv', 'westmont-jv', 5, 7, 'final'),
  ('E-R2-1', 'E', 2, 6, 1, '1:00 PM', 'summit-ridge-jv', 'pinecrest-jv', 8, 10, 'final'),
  ('E-R2-2', 'E', 2, 6, 2, '1:00 PM', 'harbor-crest-jv', 'bridgeport-jv', 5, 9, 'final'),
  ('A-R3-1', 'A', 3, 6, 3, '1:00 PM', 'canyon', 'harbor-crest', null, null, 'scheduled'),
  ('A-R3-2', 'A', 3, 7, 1, '1:50 PM', 'vista-grande', 'silverado-hills', null, null, 'scheduled'),
  ('B-R3-1', 'B', 3, 7, 2, '1:50 PM', 'summit-ridge', 'northgate', null, null, 'scheduled'),
  ('B-R3-2', 'B', 3, 7, 3, '1:50 PM', 'oakridge', 'cypress-point', null, null, 'scheduled'),
  ('C-R3-1', 'C', 3, 8, 1, '2:40 PM', 'monte-vista-prep', 'redhawk', null, null, 'scheduled'),
  ('C-R3-2', 'C', 3, 8, 2, '2:40 PM', 'stonebridge', 'lakeview', null, null, 'scheduled'),
  ('D-R3-1', 'D', 3, 8, 3, '2:40 PM', 'canyon-jv', 'westmont-jv', null, null, 'scheduled'),
  ('D-R3-2', 'D', 3, 9, 1, '3:30 PM', 'vista-grande-jv', 'oakridge-jv', null, null, 'scheduled'),
  ('E-R3-1', 'E', 3, 9, 2, '3:30 PM', 'summit-ridge-jv', 'bridgeport-jv', null, null, 'scheduled'),
  ('E-R3-2', 'E', 3, 9, 3, '3:30 PM', 'harbor-crest-jv', 'pinecrest-jv', null, null, 'scheduled');

-- =============================================================================
-- To clear the sample data when the real field is confirmed:
--   delete from public.games;
--   delete from public.tournament_teams;
-- =============================================================================
