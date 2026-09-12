-- =============================================================================
-- Battle on Imperial — team registration interest table
--
-- Run this once in your Supabase project: SQL Editor -> New query -> paste ->
-- Run. Safe to re-run; every statement is guarded.
-- =============================================================================

create table if not exists public.registrations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  school      text not null check (char_length(school) between 2 and 120),
  level       text not null check (level in (
                'Boys Varsity', 'Boys JV', 'Girls Varsity', 'Girls JV', 'Multiple teams'
              )),
  contact     text not null check (char_length(contact) between 2 and 120),
  email       text not null check (
                char_length(email) <= 200
                and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
              ),
  phone       text check (char_length(phone) <= 40),
  notes       text check (char_length(notes) <= 2000),
  consent     boolean not null default false,

  -- Set by you as you work the list; the public form can never write these.
  status      text not null default 'new'
              check (status in ('new', 'contacted', 'confirmed', 'declined')),
  internal_notes text
);

create index if not exists registrations_created_at_idx
  on public.registrations (created_at desc);

create index if not exists registrations_status_idx
  on public.registrations (status);

-- -----------------------------------------------------------------------------
-- Row Level Security
--
-- The anon key ships in the page source — that is how Supabase is designed to
-- work, and it is only safe because RLS decides what that key may actually do.
-- Here: anonymous visitors may INSERT and nothing else. There is deliberately
-- no SELECT/UPDATE/DELETE policy for anon, so nobody can read the submissions
-- back out of the public API. You read them in the Supabase dashboard, which
-- uses the service role and bypasses RLS.
-- -----------------------------------------------------------------------------

alter table public.registrations enable row level security;

drop policy if exists "anon can submit a registration" on public.registrations;
create policy "anon can submit a registration"
  on public.registrations
  for insert
  to anon
  with check (
    -- A submission can only ever be created in the 'new' state.
    status = 'new'
    and internal_notes is null
  );

-- Explicitly ensure the anon role has no other table privileges.
revoke all on public.registrations from anon;
grant insert on public.registrations to anon;

-- =============================================================================
-- Reading your submissions
--   select created_at, school, level, contact, email, phone, notes, status
--   from public.registrations
--   order by created_at desc;
-- =============================================================================
