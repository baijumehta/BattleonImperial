-- =============================================================================
-- Battle on Imperial — vendor registrations
--
-- The "claim your booth" form on vendors.html. Same shape as registrations
-- and sponsor_inquiries: the public key can INSERT and nothing else, admins
-- work the list in Tournament Control, and each new row emails the organisers
-- and the vendor through the registration-email edge function (which routes
-- on the table name).
--
-- Run in the SQL Editor after schema.sql and admin-schema.sql. Safe to re-run.
-- =============================================================================

create table if not exists public.vendor_registrations (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  business      text not null check (char_length(business) between 2 and 120),
  -- EDIT: mirrors the select on vendors.html. Change one, change both.
  category      text check (category is null or category in (
                  'Sports wear & apparel',
                  'Gear & equipment',
                  'Swag & accessories',
                  'Local business',
                  'Food truck or food vendor',
                  'Something else'
                )),
  products      text check (products is null or char_length(products) <= 600),
  website       text check (website is null or char_length(website) <= 200),

  -- EDIT: the two booth types on vendors.html. Prices live in the page copy
  -- and in vendor-templates.ts, not here.
  booth_type    text not null check (booth_type in ('Merchant', 'Food')),
  booths        int  not null default 1 check (booths between 1 and 3),
  -- Food vendors tick that they hold a business licence and the OC Health
  -- Department permits. Merchants leave it false.
  permits_ack   boolean not null default false,

  contact_name  text not null check (char_length(contact_name) between 2 and 120),
  email         text not null check (
                  char_length(email) <= 200
                  and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                ),
  phone         text check (phone is null or char_length(phone) <= 40),
  notes         text check (notes is null or char_length(notes) <= 2000),
  payment_ack   boolean not null default false,
  consent       boolean not null default false,

  -- Worked by the organisers; the public form can never write these.
  status        text not null default 'new'
                check (status in ('new', 'contacted', 'confirmed', 'declined')),
  internal_notes text
);

create index if not exists vendor_registrations_created_at_idx
  on public.vendor_registrations (created_at desc);

alter table public.vendor_registrations enable row level security;

drop policy if exists "anon can submit a vendor registration" on public.vendor_registrations;
create policy "anon can submit a vendor registration"
  on public.vendor_registrations
  for insert to anon
  with check (status = 'new' and internal_notes is null);

drop policy if exists "admins read vendor registrations" on public.vendor_registrations;
create policy "admins read vendor registrations" on public.vendor_registrations
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update vendor registrations" on public.vendor_registrations;
create policy "admins update vendor registrations" on public.vendor_registrations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete vendor registrations" on public.vendor_registrations;
create policy "admins delete vendor registrations" on public.vendor_registrations
  for delete to authenticated using (public.is_admin());

revoke all on public.vendor_registrations from anon;
grant insert on public.vendor_registrations to anon;
grant select, update, delete on public.vendor_registrations to authenticated;

-- -----------------------------------------------------------------------------
-- Email on a new registration — same pattern as sponsors.sql: the webhook
-- secret is read from the registration trigger so it is pasted in once.
-- -----------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_vendor_registration_email()
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
    raise warning 'vendor registration saved but not emailed: no webhook secret on notify_registration_email()';
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
                 'table',  'vendor_registrations',
                 'schema', 'public',
                 'record', to_jsonb(new)
               ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.notify_vendor_registration_email() from public, anon, authenticated;

drop trigger if exists vendor_registrations_email_notify on public.vendor_registrations;
create trigger vendor_registrations_email_notify
  after insert on public.vendor_registrations
  for each row
  execute function public.notify_vendor_registration_email();

-- =============================================================================
-- Checking it
--   select created_at, business, booth_type, booths, contact_name, email, status
--   from public.vendor_registrations order by created_at desc;
-- =============================================================================
