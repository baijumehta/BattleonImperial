-- =============================================================================
-- Battle on Imperial — confirmed teams
--
-- The schools whose entry is confirmed, shown in the registration section of
-- the home page ("Confirmed so far") as the field fills. Managed in
-- Tournament Control → Confirmed Teams. Deliberately separate from
-- tournament_teams, which carries pools and seeds for the schedule and is
-- filled only once the pools are drawn.
--
-- Run in the SQL Editor after admin-schema.sql. Safe to re-run.
-- =============================================================================

create table if not exists public.confirmed_teams (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  school      text not null check (char_length(school) between 2 and 120),
  level       text not null check (level in ('Varsity', 'JV')),
  -- Lower sorts first; equal sorts fall back to the school name.
  sort        int  not null default 0,
  -- Untick to take a team off the site without deleting it.
  visible     boolean not null default true,
  unique (school, level)
);

alter table public.confirmed_teams enable row level security;

drop policy if exists "anyone can read visible confirmed teams" on public.confirmed_teams;
create policy "anyone can read visible confirmed teams" on public.confirmed_teams
  for select to anon using (visible);

drop policy if exists "signed in can read confirmed teams" on public.confirmed_teams;
create policy "signed in can read confirmed teams" on public.confirmed_teams
  for select to authenticated using (true);

drop policy if exists "admins manage confirmed teams" on public.confirmed_teams;
create policy "admins manage confirmed teams" on public.confirmed_teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.confirmed_teams from anon;
grant select on public.confirmed_teams to anon;
grant select, insert, update, delete on public.confirmed_teams to authenticated;

-- No seed rows: a team goes on this list only once its entry is fully
-- confirmed, and that is done in Tournament Control → Confirmed Teams.

select school, level, visible from public.confirmed_teams order by sort, school, level;
