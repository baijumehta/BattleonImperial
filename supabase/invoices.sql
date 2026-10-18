-- =============================================================================
-- Battle on Imperial — invoices
--
-- Invoices for team entries, created and worked in Tournament Control →
-- Invoices. Each has a private link (invoice.html?t=<token>) the school opens
-- to view, print or save it as a PDF; "Send" emails that link through the
-- registration-email edge function.
--
-- Subtotal, amount paid and balance are computed by the database from the
-- line items and payments, so the list, the page and the email can never
-- disagree.
--
-- Run in the SQL Editor after schema.sql and admin-schema.sql. Safe to re-run.
-- =============================================================================

create sequence if not exists public.invoice_no_seq start 1;

-- Sum of qty × unit_price − discount over the line items.
create or replace function public.invoice_subtotal(lines jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(sum(
           round(coalesce((l->>'qty')::numeric, 0) * coalesce((l->>'unit_price')::numeric, 0)
                 - coalesce((l->>'discount')::numeric, 0), 2)
         ), 0)
  from jsonb_array_elements(case when jsonb_typeof(lines) = 'array' then lines else '[]'::jsonb end) l;
$$;

-- Sum of payment amounts.
create or replace function public.invoice_paid(payments jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(sum(coalesce((p->>'amount')::numeric, 0)), 0)
  from jsonb_array_elements(case when jsonb_typeof(payments) = 'array' then payments else '[]'::jsonb end) p;
$$;

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  -- The private link. Unguessable; the page reads the invoice through
  -- get_invoice(token) below, never the table.
  token           uuid not null unique default gen_random_uuid(),
  invoice_no      text not null unique
                  default ('BOI-27-' || lpad(nextval('public.invoice_no_seq')::text, 3, '0')),
  registration_id uuid references public.registrations (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  issued_on       date not null default ((now() at time zone 'America/Los_Angeles')::date),
  due_on          date,
  status          text not null default 'draft'
                  check (status in ('draft', 'sent', 'partial', 'paid', 'void')),

  bill_school     text not null check (char_length(bill_school) between 1 and 160),
  bill_program    text check (bill_program is null or char_length(bill_program) <= 160),
  bill_contact    text check (bill_contact is null or char_length(bill_contact) <= 160),
  bill_email      text check (bill_email is null or bill_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  bill_address    text check (bill_address is null or char_length(bill_address) <= 400),
  po_ref          text check (po_ref is null or char_length(po_ref) <= 80),

  -- [{ "description": "...", "qty": 1, "unit_price": 650, "discount": 0 }, ...]
  lines           jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  credit          numeric(10,2) not null default 0 check (credit >= 0),
  credit_label    text check (credit_label is null or char_length(credit_label) <= 120),
  -- [{ "date": "2026-11-02", "amount": 1100, "method": "Zelle", "ref": "..." }, ...]
  payments        jsonb not null default '[]'::jsonb check (jsonb_typeof(payments) = 'array'),

  subtotal        numeric(10,2) generated always as (public.invoice_subtotal(lines)) stored,
  amount_paid     numeric(10,2) generated always as (public.invoice_paid(payments)) stored,
  balance         numeric(10,2) generated always as
                    (public.invoice_subtotal(lines) - credit - public.invoice_paid(payments)) stored,

  notes           text check (notes is null or char_length(notes) <= 2000),

  sent_at         timestamptz,
  send_count      int not null default 0,
  last_sent_to    text
);

create index if not exists invoices_registration_idx on public.invoices (registration_id);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

create or replace function public.invoices_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.invoices_touch();

-- -----------------------------------------------------------------------------
-- Access: admins only. The public never reads the table.
-- -----------------------------------------------------------------------------

alter table public.invoices enable row level security;

drop policy if exists "admins manage invoices" on public.invoices;
create policy "admins manage invoices" on public.invoices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.invoices from anon;
grant select, insert, update, delete on public.invoices to authenticated;
grant usage, select on sequence public.invoice_no_seq to authenticated;

-- The invoice page calls this with the token from its link. Drafts are only
-- returned to a signed-in admin (for the preview button); internal fields are
-- left out.
create or replace function public.get_invoice(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(i) - 'id' - 'registration_id' - 'send_count' - 'last_sent_to'
                     - 'created_at' - 'updated_at' - 'token'
  from public.invoices i
  where i.token = p_token
    and (i.status <> 'draft' or public.is_admin());
$$;

revoke all on function public.get_invoice(uuid) from public;
grant execute on function public.get_invoice(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Email: Tournament Control sends an invoice by bumping send_count. The
-- trigger posts the row to the edge function, which emails the school the
-- invoice and its link, with a copy to the organisers. The webhook secret is
-- read from the registration trigger, as elsewhere.
-- -----------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_invoice_email()
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
    raise warning 'invoice marked sent but not emailed: no webhook secret on notify_registration_email()';
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-boi-secret', secret
               ),
    body    := jsonb_build_object(
                 'type',   'SEND',
                 'table',  'invoices',
                 'schema', 'public',
                 'record', to_jsonb(new)
               ),
    timeout_milliseconds := 15000
  );
  return new;
end;
$$;

revoke all on function public.notify_invoice_email() from public, anon, authenticated;

drop trigger if exists invoices_email_notify on public.invoices;
create trigger invoices_email_notify
  after update on public.invoices
  for each row
  when (new.send_count > old.send_count)
  execute function public.notify_invoice_email();

-- =============================================================================
-- Checking it
--   select invoice_no, bill_school, subtotal, credit, amount_paid, balance,
--          status, due_on, sent_at
--   from public.invoices order by created_at desc;
-- =============================================================================
