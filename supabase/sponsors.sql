-- =============================================================================
-- Battle on Imperial — sponsors
--
-- Two tables and a storage bucket:
--
--   public.sponsors           the businesses that have signed on. Read by the
--                             site (logo band on the home page and the
--                             sponsors page), managed in Tournament Control.
--   public.sponsor_inquiries  the "become a sponsor" form on sponsors.html.
--                             Public key can INSERT and nothing else, exactly
--                             like registrations. Each new row emails the
--                             organisers and the business, through the same
--                             edge function as team entries.
--   storage sponsor-logos     public bucket the admin page uploads logos to.
--
-- Run in the SQL Editor after schema.sql and admin-schema.sql (it uses
-- public.is_admin()). Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sponsors
-- -----------------------------------------------------------------------------

create table if not exists public.sponsors (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  name        text not null check (char_length(name) between 1 and 120),
  -- EDIT: the six packages on sponsors.html. Change one, change both — the
  -- site orders the logo band by this list.
  tier        text not null check (tier in (
                'Presenting Partner',
                'Field Partner',
                'Player Experience Partner',
                'Athletic Trainer Partner',
                'Coaches Zone Partner',
                'Game Sponsor'
              )),
  website     text check (website is null or website ~* '^https?://'),
  -- Any image URL. The admin page uploads to the sponsor-logos bucket and
  -- stores the public URL here; a logo hosted elsewhere works too.
  logo_url    text check (logo_url is null or logo_url ~* '^https?://'),
  -- One line, shown under the name on the sponsors page. Optional.
  blurb       text check (blurb is null or char_length(blurb) <= 200),
  -- Lower sorts first within a tier.
  sort        int  not null default 0,
  -- Untick to take a sponsor off the site without deleting it — e.g. while
  -- waiting on their logo.
  visible     boolean not null default true
);

create index if not exists sponsors_order_idx on public.sponsors (tier, sort, name);

alter table public.sponsors enable row level security;

-- Visitors see visible sponsors. The logo band is public information, so like
-- the schedule this grants SELECT to anon — and nothing else.
drop policy if exists "anyone can read visible sponsors" on public.sponsors;
create policy "anyone can read visible sponsors" on public.sponsors
  for select to anon using (visible);

drop policy if exists "signed in can read sponsors" on public.sponsors;
create policy "signed in can read sponsors" on public.sponsors
  for select to authenticated using (true);

drop policy if exists "admins manage sponsors" on public.sponsors;
create policy "admins manage sponsors" on public.sponsors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.sponsors from anon;
grant select on public.sponsors to anon;
grant select, insert, update, delete on public.sponsors to authenticated;

-- -----------------------------------------------------------------------------
-- Sponsor inquiries (the form)
-- -----------------------------------------------------------------------------

create table if not exists public.sponsor_inquiries (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  business      text not null check (char_length(business) between 2 and 120),
  contact_name  text not null check (char_length(contact_name) between 2 and 120),
  email         text not null check (
                  char_length(email) <= 200
                  and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                ),
  phone         text check (phone is null or char_length(phone) <= 40),
  website       text check (website is null or char_length(website) <= 200),
  -- EDIT: mirrors the select on sponsors.html. Change one, change both.
  tier          text check (tier is null or tier in (
                  'Presenting Partner',
                  'Field Partner',
                  'Player Experience Partner',
                  'Athletic Trainer Partner',
                  'Coaches Zone Partner',
                  'Game Sponsor',
                  'Not sure yet',
                  'In-kind or something else'
                )),
  message       text check (message is null or char_length(message) <= 2000),
  consent       boolean not null default false,

  -- Worked by the organisers; the public form can never write these.
  status        text not null default 'new'
                check (status in ('new', 'contacted', 'confirmed', 'declined')),
  internal_notes text
);

create index if not exists sponsor_inquiries_created_at_idx
  on public.sponsor_inquiries (created_at desc);

alter table public.sponsor_inquiries enable row level security;

drop policy if exists "anon can submit a sponsor inquiry" on public.sponsor_inquiries;
create policy "anon can submit a sponsor inquiry"
  on public.sponsor_inquiries
  for insert to anon
  with check (status = 'new' and internal_notes is null);

drop policy if exists "admins read sponsor inquiries" on public.sponsor_inquiries;
create policy "admins read sponsor inquiries" on public.sponsor_inquiries
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update sponsor inquiries" on public.sponsor_inquiries;
create policy "admins update sponsor inquiries" on public.sponsor_inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete sponsor inquiries" on public.sponsor_inquiries;
create policy "admins delete sponsor inquiries" on public.sponsor_inquiries
  for delete to authenticated using (public.is_admin());

revoke all on public.sponsor_inquiries from anon;
grant insert on public.sponsor_inquiries to anon;
grant select, update, delete on public.sponsor_inquiries to authenticated;

-- -----------------------------------------------------------------------------
-- Logo bucket
--
-- Public read, so a logo URL works in an <img> with no token. Only admins can
-- put files in it, and only images, capped at 2 MB — a sponsor logo should be
-- a fraction of that.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsor-logos', 'sponsor-logos', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone can view sponsor logos" on storage.objects;
create policy "anyone can view sponsor logos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'sponsor-logos');

drop policy if exists "admins manage sponsor logos" on storage.objects;
create policy "admins manage sponsor logos" on storage.objects
  for all to authenticated
  using (bucket_id = 'sponsor-logos' and public.is_admin())
  with check (bucket_id = 'sponsor-logos' and public.is_admin());

-- -----------------------------------------------------------------------------
-- Email on a new inquiry
--
-- Same shape as registration-webhook.sql, posting to the same edge function,
-- which routes on the table name. The webhook secret is NOT pasted in again:
-- it is read out of the registration trigger's own definition at call time,
-- so there is one place it lives. If that trigger still carries the
-- placeholder, this one logs a warning and saves the row without emailing —
-- a lost notification, never a lost inquiry.
-- -----------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_sponsor_inquiry_email()
returns trigger
language plpgsql
security definer
set search_path = extensions, public, pg_temp
as $$
declare
  fn_url  text := 'https://gduaigjclvqsraesnvrh.supabase.co/functions/v1/registration-email';
  secret  text;
begin
  select substring(p.prosrc from 'secret\s+text\s*:=\s*''([^'']*)''')
    into secret
  from pg_proc p
  where p.proname = 'notify_registration_email'
    and p.pronamespace = 'public'::regnamespace;

  if secret is null or secret = '' or secret = 'PASTE_WEBHOOK_SECRET_HERE' then
    raise warning 'sponsor inquiry saved but not emailed: no webhook secret on notify_registration_email()';
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-boi-secret', secret
               ),
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'sponsor_inquiries',
                 'schema', 'public',
                 'record', to_jsonb(new)
               ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.notify_sponsor_inquiry_email() from public, anon, authenticated;

drop trigger if exists sponsor_inquiries_email_notify on public.sponsor_inquiries;
create trigger sponsor_inquiries_email_notify
  after insert on public.sponsor_inquiries
  for each row
  execute function public.notify_sponsor_inquiry_email();

-- =============================================================================
-- Checking it
--
--   select name, tier, visible, logo_url from public.sponsors order by tier, sort;
--   select created_at, business, contact_name, email, tier, status
--   from public.sponsor_inquiries order by created_at desc;
--
-- The edge function has to be redeployed with sponsor-templates.ts for the
-- emails to go out — see supabase/functions/registration-email/README.md.
-- =============================================================================
