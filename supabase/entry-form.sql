-- =============================================================================
-- Battle on Imperial — full entry form fields
--
-- Brings the sign-up form up to what a tournament actually needs to run a
-- team, modelled on the HB Cup entry form. Run once in the Supabase SQL
-- Editor. Safe to re-run.
--
-- Every column is nullable. Rows submitted against the earlier, shorter form
-- are still valid and must stay readable; a null here means "never asked",
-- which the admin list shows as such rather than as a blank answer.
--
-- Length limits matter more than they look. The anon role can INSERT, so an
-- unbounded text column is an invitation to post a megabyte. Each CHECK below
-- is the real gate; the form's maxlength is only a courtesy to honest people.
-- =============================================================================

alter table public.registrations
  -- Who is filling this in. `contact` already holds the full name and keeps
  -- doing so — these split it for the entry packet and for mail merges.
  add column if not exists contact_first text,
  add column if not exists contact_last  text,
  add column if not exists role          text,

  -- Head coach. Often not the person submitting: an AD or team parent
  -- frequently files the entry, and the coach is who you need on game day.
  add column if not exists coach1_first  text,
  add column if not exists coach1_last   text,
  add column if not exists coach1_email  text,
  add column if not exists coach1_phone  text,

  -- Second coach, optional throughout.
  add column if not exists coach2_first  text,
  add column if not exists coach2_last   text,
  add column if not exists coach2_email  text,
  add column if not exists coach2_phone  text,

  -- A program may enter up to two teams. Team 2 is optional.
  add column if not exists team1_level    text,
  add column if not exists team1_strength text,
  add column if not exists team2_level    text,
  add column if not exists team2_strength text,

  -- The coach ticking the deposit terms. Not a payment and not a contract —
  -- it is a record that the terms were on screen when they submitted.
  add column if not exists payment_ack boolean not null default false;

-- --------------------------------------------------------------- constraints
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('contact_first',  120), ('contact_last',  120), ('role',          120),
      ('coach1_first',   120), ('coach1_last',   120), ('coach1_phone',   40),
      ('coach2_first',   120), ('coach2_last',   120), ('coach2_phone',   40),
      ('team1_strength', 600), ('team2_strength', 600)
    ) as t(col, len)
  loop
    execute format(
      'alter table public.registrations drop constraint if exists registrations_%s_len',
      c.col);
    execute format(
      'alter table public.registrations add constraint registrations_%s_len
         check (%I is null or char_length(%I) <= %s)',
      c.col, c.col, c.col, c.len);
  end loop;
end $$;

-- Coach emails get the same shape check the submitter's email already has.
alter table public.registrations drop constraint if exists registrations_coach_emails;
alter table public.registrations add constraint registrations_coach_emails check (
  (coach1_email is null or (char_length(coach1_email) <= 200
     and coach1_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
  and
  (coach2_email is null or (char_length(coach2_email) <= 200
     and coach2_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
);

-- Girls-only event, so the level vocabulary matches tournament_teams.
alter table public.registrations drop constraint if exists registrations_team_levels;
alter table public.registrations add constraint registrations_team_levels check (
  (team1_level is null or team1_level in ('Varsity', 'JV'))
  and
  (team2_level is null or team2_level in ('Varsity', 'JV'))
);

-- A second team without a first is a form bug, not a real entry.
alter table public.registrations drop constraint if exists registrations_team_order;
alter table public.registrations add constraint registrations_team_order
  check (team2_level is null or team1_level is not null);

-- The anon INSERT policy is unchanged. It constrains status and
-- internal_notes only, so these columns are writable by the public form and
-- the CHECKs above are what keep the values honest.

-- =============================================================================
-- Reading a full entry
--   select created_at, school, cif_division,
--          contact_first, contact_last, role, email, phone,
--          coach1_first, coach1_last, coach1_email, coach1_phone,
--          coach2_first, coach2_last, coach2_email, coach2_phone,
--          team1_level, team1_strength, team2_level, team2_strength,
--          payment_ack, status
--   from public.registrations
--   order by created_at desc;
--
-- Programs entering two teams:
--   select school, team1_level, team2_level from public.registrations
--   where team2_level is not null;
-- =============================================================================
