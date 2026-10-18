-- =============================================================================
-- Battle on Imperial — confirm a team when its invoice is paid
--
-- When an invoice linked to a registration becomes Paid:
--   * the registration's status is set to 'confirmed', and
--   * each of its levels (Varsity / JV) is added to confirmed_teams, which
--     puts the school in "Confirmed so far" on the home page.
--
-- The school name is the registration's, exactly as the coach typed it
-- (often with the mascot); tidy it in Tournament Control → Confirmed Teams
-- if needed. Nothing is undone automatically if an invoice is later voided —
-- remove or hide the team there by hand.
--
-- Run in the SQL Editor after invoices.sql and confirmed-teams.sql. Safe to
-- re-run. The last block confirms any invoices that are already paid.
-- =============================================================================

create or replace function public.confirm_registration(reg_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r   public.registrations%rowtype;
  lvl text;
begin
  select * into r from public.registrations where id = reg_id;
  if not found then return; end if;

  update public.registrations set status = 'confirmed'
  where id = r.id and status <> 'confirmed';

  -- team1/team2 carry the levels on the current form; older rows only have
  -- the summary column.
  foreach lvl in array array[
    r.team1_level,
    r.team2_level,
    case when r.team1_level is null and r.level in ('Varsity', 'JV') then r.level end
  ] loop
    if lvl in ('Varsity', 'JV') then
      insert into public.confirmed_teams (school, level)
      values (r.school, lvl)
      on conflict (school, level) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.confirm_registration(uuid) from public, anon, authenticated;

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
  return new;
end;
$$;

revoke all on function public.invoices_confirm_on_paid() from public, anon, authenticated;

drop trigger if exists invoices_confirm_on_paid on public.invoices;
create trigger invoices_confirm_on_paid
  after update of status on public.invoices
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.invoices_confirm_on_paid();

-- Invoices already paid before this was installed.
do $$
declare inv record;
begin
  for inv in select registration_id from public.invoices
             where status = 'paid' and registration_id is not null loop
    perform public.confirm_registration(inv.registration_id);
  end loop;
end $$;

-- What is confirmed now.
select c.school, c.level, c.visible from public.confirmed_teams c order by c.school, c.level;
