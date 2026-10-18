-- =============================================================================
-- Battle on Imperial — invoices for sponsors and vendors
--
-- Extends public.invoices (invoices.sql) so one invoicing system covers all
-- three kinds of payer:
--   kind = 'team'    linked to registrations          (as before)
--   kind = 'sponsor' linked to sponsor_inquiries
--   kind = 'vendor'  linked to vendor_registrations
--
-- The invoice page and email word themselves by kind. When a sponsor or
-- vendor invoice is paid, the inquiry or booth request is set to Confirmed;
-- a paid sponsor is also added to the sponsors list HIDDEN, ready for its
-- logo — tick Visible in Tournament Control → Sponsors to show it on the site.
--
-- Run in the SQL Editor after invoices.sql, auto-confirm.sql, sponsors.sql and
-- vendors.sql. Safe to re-run.
-- =============================================================================

alter table public.invoices
  add column if not exists kind text not null default 'team',
  add column if not exists sponsor_inquiry_id uuid references public.sponsor_inquiries (id) on delete set null,
  add column if not exists vendor_registration_id uuid references public.vendor_registrations (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_kind_check') then
    alter table public.invoices add constraint invoices_kind_check check (kind in ('team', 'sponsor', 'vendor'));
  end if;
end $$;

create index if not exists invoices_sponsor_idx on public.invoices (sponsor_inquiry_id);
create index if not exists invoices_vendor_idx on public.invoices (vendor_registration_id);

-- The private page: same as before, with the new link columns left out.
create or replace function public.get_invoice(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(i) - 'id' - 'registration_id' - 'sponsor_inquiry_id' - 'vendor_registration_id'
                     - 'send_count' - 'last_sent_to' - 'created_at' - 'updated_at' - 'token'
  from public.invoices i
  where i.token = p_token
    and (i.status <> 'draft' or public.is_admin());
$$;

revoke all on function public.get_invoice(uuid) from public;
grant execute on function public.get_invoice(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Paid → confirmed, for all three kinds.
-- -----------------------------------------------------------------------------

create or replace function public.confirm_sponsor(inq_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare q public.sponsor_inquiries%rowtype;
begin
  select * into q from public.sponsor_inquiries where id = inq_id;
  if not found then return; end if;

  update public.sponsor_inquiries set status = 'confirmed'
  where id = q.id and status <> 'confirmed';

  -- Only a real package can go on the sponsors list; "Not sure yet" and
  -- "In-kind" are left for an organiser to add by hand. Hidden until a logo
  -- is in and someone ticks Visible.
  if q.tier in ('Presenting Partner', 'Field Partner', 'Player Experience Partner',
                'Athletic Trainer Partner', 'Coaches Zone Partner', 'Game Sponsor')
     and not exists (select 1 from public.sponsors s where lower(s.name) = lower(q.business) and s.tier = q.tier) then
    insert into public.sponsors (name, tier, website, visible)
    values (q.business,
            q.tier,
            case when q.website ~* '^https?://' then q.website end,
            false);
  end if;
end;
$$;

create or replace function public.confirm_vendor(v_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vendor_registrations set status = 'confirmed'
  where id = v_id and status <> 'confirmed';
end;
$$;

revoke all on function public.confirm_sponsor(uuid) from public, anon, authenticated;
revoke all on function public.confirm_vendor(uuid) from public, anon, authenticated;

create or replace function public.invoices_confirm_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.registration_id is not null then
    perform public.confirm_registration(new.registration_id);
  end if;
  if new.sponsor_inquiry_id is not null then
    perform public.confirm_sponsor(new.sponsor_inquiry_id);
  end if;
  if new.vendor_registration_id is not null then
    perform public.confirm_vendor(new.vendor_registration_id);
  end if;
  return new;
end;
$$;

revoke all on function public.invoices_confirm_on_paid() from public, anon, authenticated;
-- The trigger from auto-confirm.sql already calls this function; nothing to re-create.

select kind, count(*) from public.invoices group by kind;
