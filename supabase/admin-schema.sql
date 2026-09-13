-- =============================================================================
-- Battle on Imperial — admin access
--
-- Gives signed-in tournament staff write access to teams, games and
-- registrations, while the public key stays exactly as restricted as it is now.
--
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Then follow the two steps at the bottom of this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who counts as an admin
--
-- Being signed in is NOT enough. A user must also be listed here. That way, if
-- public sign-ups are ever left enabled by accident, a stranger who creates an
-- account still gets nothing.
-- -----------------------------------------------------------------------------

create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  email    text,
  added_at timestamptz not null default now()
);

-- SECURITY DEFINER so the check itself is not subject to RLS on admins —
-- without this, a policy on admins that queries admins recurses forever.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.admins enable row level security;
drop policy if exists "admins read the admin list" on public.admins;
create policy "admins read the admin list" on public.admins
  for select to authenticated using (public.is_admin());

-- Supabase grants table privileges to anon by default on new tables in the
-- public schema. RLS already returns nothing to anon here, but there is no
-- reason for the public role to hold privileges on the admin list at all —
-- take them away so the table is not one disabled policy from being readable.
revoke all on public.admins from anon;
grant select on public.admins to authenticated;

-- -----------------------------------------------------------------------------
-- Teams and games: public reads stay, admins get writes
-- -----------------------------------------------------------------------------

drop policy if exists "admins manage teams" on public.tournament_teams;
create policy "admins manage teams" on public.tournament_teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage games" on public.games;
create policy "admins manage games" on public.games
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Signed-in users can also read the schedule (the anon policies cover
-- logged-out visitors; authenticated is a separate role and needs its own).
drop policy if exists "signed in can read teams" on public.tournament_teams;
create policy "signed in can read teams" on public.tournament_teams
  for select to authenticated using (true);

drop policy if exists "signed in can read games" on public.games;
create policy "signed in can read games" on public.games
  for select to authenticated using (true);

grant select, insert, update, delete on public.tournament_teams to authenticated;
grant select, insert, update, delete on public.games            to authenticated;

-- -----------------------------------------------------------------------------
-- Registrations: admins can read and work the list
--
-- anon keeps INSERT-only. Nothing here loosens the public key — a scraped
-- publishable key still cannot read a single row.
-- -----------------------------------------------------------------------------

drop policy if exists "admins read registrations" on public.registrations;
create policy "admins read registrations" on public.registrations
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update registrations" on public.registrations;
create policy "admins update registrations" on public.registrations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete registrations" on public.registrations;
create policy "admins delete registrations" on public.registrations
  for delete to authenticated using (public.is_admin());

grant select, update, delete on public.registrations to authenticated;

-- =============================================================================
-- TWO STEPS TO FINISH
--
-- 1. Create the account.
--    Dashboard -> Authentication -> Users -> Add user -> "Create new user".
--    Set an email and password, and tick "Auto Confirm User".
--    Do this for each person who will enter scores.
--
-- 2. Put that account on the admin list. Re-run this with their email:
--
--      insert into public.admins (user_id, email)
--      select id, email from auth.users where email = 'you@example.com'
--      on conflict (user_id) do nothing;
--
--    Check it worked:
--      select a.email, a.added_at from public.admins a;
--
-- ALSO RECOMMENDED
--    Authentication -> Sign In / Providers -> disable "Allow new users to sign
--    up". The allowlist already blocks unknown accounts, but there is no reason
--    to let strangers create them in the first place.
--
-- TO REVOKE SOMEONE
--      delete from public.admins where email = 'them@example.com';
--    (Deleting the auth user as well is cleaner, but this is enough.)
-- =============================================================================
