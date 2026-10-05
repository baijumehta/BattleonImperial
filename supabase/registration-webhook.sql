-- =============================================================================
-- Battle on Imperial — call the email function on a new registration
--
-- The same job as a dashboard Database Webhook, written out as a trigger. Use
-- this when the dashboard's webhook UI will not create one; it depends on the
-- supabase_functions schema that the UI sets up for you, and this does not.
--
-- BEFORE RUNNING: replace PASTE_WEBHOOK_SECRET_HERE below with the value you
-- set as WEBHOOK_SECRET in the edge function's secrets. They have to match
-- exactly or the function answers 403 and no email is sent.
--
-- Run in the SQL Editor. Safe to re-run.
-- =============================================================================

-- pg_net does the outbound HTTP. It is what the dashboard webhook uses too,
-- and the usual reason that UI fails is this not being enabled.
create extension if not exists pg_net with schema extensions;

-- -----------------------------------------------------------------------------
-- The trigger function
--
-- net.http_post queues the request and returns immediately, so the INSERT is
-- never waiting on an email. If the function is down or the key is wrong, the
-- row is still saved — which is the behaviour you want. A failed send costs a
-- notification, never an entry.
--
-- SECURITY DEFINER because the anon role calling the INSERT has no rights to
-- the net schema. search_path is pinned so a rogue public function cannot be
-- resolved ahead of the real one.
-- -----------------------------------------------------------------------------
create or replace function public.notify_registration_email()
returns trigger
language plpgsql
security definer
set search_path = extensions, public, pg_temp
as $$
declare
  fn_url  text := 'https://gduaigjclvqsraesnvrh.supabase.co/functions/v1/registration-email';
  secret  text := 'PASTE_WEBHOOK_SECRET_HERE';
begin
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-boi-secret', secret
               ),
    -- Shaped like a Supabase database webhook, so the edge function does not
    -- care which of the two created it.
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'registrations',
                 'schema', 'public',
                 'record', to_jsonb(new)
               ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

-- The secret sits in the function body, so keep it off anyone who should not
-- have it. Only the postgres/service roles can read function definitions here.
revoke all on function public.notify_registration_email() from public, anon, authenticated;

drop trigger if exists registrations_email_notify on public.registrations;
create trigger registrations_email_notify
  after insert on public.registrations
  for each row
  execute function public.notify_registration_email();

-- =============================================================================
-- Checking it
--
-- Every call and its response is logged by pg_net. After submitting the form:
--
--   select id, created, url, status_code, content
--   from net._http_response
--   order by created desc
--   limit 5;
--
-- status_code 200  → the function ran; read `content` for what SMTP2GO said
-- status_code 403  → the secret here does not match WEBHOOK_SECRET
-- status_code 500  → a secret is missing on the function
-- no rows at all   → the trigger is not firing; check it exists:
--
--   select tgname from pg_trigger
--   where tgrelid = 'public.registrations'::regclass and not tgisinternal;
--
-- To remove it again:
--   drop trigger if exists registrations_email_notify on public.registrations;
-- =============================================================================
