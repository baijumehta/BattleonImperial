-- =============================================================================
-- Battle on Imperial — give the email triggers more time
--
-- The three triggers call the edge function with a 5-second limit. One call
-- on 14 October 2026 (a cold start plus two SMTP2GO sends) ran over it and
-- pg_net logged a timeout. The function now sends both emails in parallel,
-- and this raises the limit to 15 seconds so a slow cold start is not enough
-- to lose a notification.
--
-- It rewrites each trigger function from its own stored source, so the
-- webhook secret in notify_registration_email() is kept as is — nothing to
-- paste. Run in the SQL Editor. Safe to re-run.
-- =============================================================================

do $$
declare
  fn  text;
  src text;
begin
  foreach fn in array array[
    'notify_registration_email',
    'notify_sponsor_inquiry_email',
    'notify_vendor_registration_email'
  ] loop
    select p.prosrc into src
    from pg_proc p
    where p.proname = fn and p.pronamespace = 'public'::regnamespace;

    if src is null then
      raise notice '% not found, skipped', fn;
      continue;
    end if;

    src := replace(src, 'timeout_milliseconds := 5000', 'timeout_milliseconds := 15000');

    execute format(
      'create or replace function public.%I() returns trigger language plpgsql '
      'security definer set search_path = extensions, public, pg_temp as %L',
      fn, src
    );
    raise notice '% now waits up to 15 s', fn;
  end loop;
end $$;

-- Each should show 15000.
select p.proname,
       substring(p.prosrc from 'timeout_milliseconds := (\d+)') as timeout_ms
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('notify_registration_email', 'notify_sponsor_inquiry_email', 'notify_vendor_registration_email')
order by 1;
