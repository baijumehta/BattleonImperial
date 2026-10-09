-- =============================================================================
-- Battle on Imperial — clear the sample and test registrations
--
-- Removes the invented entries that were loaded so the Registrations tab could
-- be reviewed before real coaches existed, plus the test rows from checking
-- the form. Everything matched here is one of:
--
--   * an @example.com address (the 20 sample coaches, the ZZZ test rows)
--   * a school starting "ZZZ" (the constraint and form tests)
--   * "Baiju's Test School" (the organiser's own test entry)
--
-- A real entry matches none of these. The first SELECT shows exactly what
-- will go; the DELETE uses the same condition. Run in the SQL Editor.
-- =============================================================================

-- What is about to be removed — check it before the delete.
select created_at, school, contact, email
from public.registrations
where email ilike '%@example.com'
   or school ilike 'ZZZ%'
   or school = 'Baiju''s Test School'
order by created_at;

begin;

delete from public.registrations
where email ilike '%@example.com'
   or school ilike 'ZZZ%'
   or school = 'Baiju''s Test School';

commit;

-- Should be 0 until the first real coach submits the form.
select count(*) as registrations_left from public.registrations;
