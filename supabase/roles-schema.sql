-- =============================================================================
-- Battle on Imperial — staff roles
--
-- Splits tournament staff into two levels:
--
--   admin        everything — teams, schedule, scores, registrations
--   scorekeeper  scores and game status only
--
-- A scorekeeper is someone you hand a phone to at a field for the day. They
-- cannot rename teams, change pools, or see a single coach's contact details.
--
-- Safe to run after admin-schema.sql. Existing rows become admins, so your
-- own access does not change.
-- =============================================================================

alter table public.admins
  add column if not exists role text not null default 'admin';

-- Added separately so re-running does not fail once the constraint exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admins_role_check'
  ) then
    alter table public.admins
      add constraint admins_role_check check (role in ('admin', 'scorekeeper'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Two checks instead of one. Both SECURITY DEFINER so policies on admins do
-- not recurse through themselves.
-- -----------------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Games: any staff member may enter scores and set status
-- -----------------------------------------------------------------------------
drop policy if exists "admins manage games" on public.games;
drop policy if exists "staff manage games"  on public.games;
create policy "staff manage games" on public.games
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- Teams: admins only. A scorekeeper should not be able to rename or repool a
-- team mid-tournament.
-- -----------------------------------------------------------------------------
drop policy if exists "admins manage teams" on public.tournament_teams;
create policy "admins manage teams" on public.tournament_teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Registrations: admins only. These rows hold coaches' emails and phone
-- numbers, so a field scorekeeper has no reason to reach them.
-- -----------------------------------------------------------------------------
drop policy if exists "admins read registrations"   on public.registrations;
drop policy if exists "admins update registrations" on public.registrations;
drop policy if exists "admins delete registrations" on public.registrations;

create policy "admins read registrations" on public.registrations
  for select to authenticated using (public.is_admin());
create policy "admins update registrations" on public.registrations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete registrations" on public.registrations
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- The staff list: everyone sees their own row (the app reads it at sign-in to
-- learn its own role); only admins see the whole list.
-- -----------------------------------------------------------------------------
drop policy if exists "admins read the admin list" on public.admins;
drop policy if exists "staff read their own row"   on public.admins;
create policy "staff read their own row" on public.admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

revoke all on public.admins from anon;
grant select on public.admins to authenticated;

-- =============================================================================
-- ADDING A SCOREKEEPER
--
-- 1. Authentication -> Users -> Add user -> Create new user, with
--    "Auto Confirm User" ticked.
--
-- 2. Then:
--      insert into public.admins (user_id, email, role)
--      select id, email, 'scorekeeper' from auth.users
--      where email = 'scorer@example.com'
--      on conflict (user_id) do update set role = excluded.role;
--
--    That insert reports success even when it matches nothing, so check:
--      select email, role from public.admins order by role, email;
--
-- CHANGING SOMEONE'S ROLE
--      update public.admins set role = 'admin' where email = 'them@example.com';
--
-- REMOVING ACCESS
--      delete from public.admins where email = 'them@example.com';
-- =============================================================================
