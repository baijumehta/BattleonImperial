-- =============================================================================
-- Battle on Imperial — why did a sponsor inquiry not email?
--
-- Run in the SQL Editor. Two result sets.
--
-- The first answers, in one row:
--   trigger_installed   1 = the email trigger is on sponsor_inquiries
--   function_exists     1 = notify_sponsor_inquiry_email() was created
--   webhook_secret      what the trigger finds in notify_registration_email():
--                       'found (N chars)' is good; 'placeholder' means the
--                       registration trigger still has PASTE_WEBHOOK_SECRET_HERE;
--                       'not found' means that function is missing or shaped
--                       differently (e.g. the webhook was made in the dashboard)
--   inquiries           rows in sponsor_inquiries (the test should be here)
--   logo_bucket         1 = the sponsor-logos bucket exists
--
-- The second is pg_net's log of the last few outbound calls: what the edge
-- function answered. status_code 200 → read `content` for what SMTP2GO said;
-- 403 → secret mismatch; 500 → a secret missing on the function; no row for
-- the inquiry's time → the trigger never fired.
-- =============================================================================

select
  (select count(*) from pg_trigger
    where tgrelid = 'public.sponsor_inquiries'::regclass
      and tgname = 'sponsor_inquiries_email_notify')                      as trigger_installed,
  (select count(*) from pg_proc
    where proname = 'notify_sponsor_inquiry_email'
      and pronamespace = 'public'::regnamespace)                           as function_exists,
  (select case
            when s is null then 'not found'
            when s in ('', 'PASTE_WEBHOOK_SECRET_HERE') then 'placeholder'
            else 'found (' || length(s) || ' chars)'
          end
   from (select substring(p.prosrc from 'secret\s+text\s*:=\s*''([^'']*)''') as s
         from pg_proc p
         where p.proname = 'notify_registration_email'
           and p.pronamespace = 'public'::regnamespace) x)                 as webhook_secret,
  (select count(*) from public.sponsor_inquiries)                          as inquiries,
  (select count(*) from storage.buckets where id = 'sponsor-logos')        as logo_bucket;

select id, created, status_code, timed_out, error_msg, left(content, 300) as content
from net._http_response
order by created desc
limit 5;
