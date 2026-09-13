-- =============================================================================
-- Battle on Imperial — girls-only event
--
-- The registration form no longer offers Boys options, so the database should
-- refuse them too. Gender is dropped from the level values entirely: the whole
-- tournament is girls, and 'Varsity' / 'JV' then matches the vocabulary
-- tournament_teams already uses.
--
-- ORDER MATTERS. Existing rows are rewritten first, because tightening the
-- constraint while a single 'Boys ...' row survives makes the ALTER fail.
--
-- Run once: SQL Editor -> New query -> paste -> Run.
-- =============================================================================

-- 1. See what is there now (informational — check the output before continuing).
select level, count(*) from public.registrations group by level order by level;

-- 2. Drop the old constraint so the rewrite below is not blocked by it.
alter table public.registrations
  drop constraint if exists registrations_level_check;

-- 3. Rewrite existing rows. The sample teams were seeded as Boys Varsity /
--    Boys JV; map both sides onto the new gender-free values.
update public.registrations set level = 'Varsity'
  where level in ('Boys Varsity', 'Girls Varsity');

update public.registrations set level = 'JV'
  where level in ('Boys JV', 'Girls JV');

-- 4. Anything unexpected (a hand-edited row, say) would still break the new
--    constraint, so park it on 'Multiple teams' rather than lose the row.
update public.registrations
  set level = 'Multiple teams'
  where level not in ('Varsity', 'JV', 'Multiple teams');

-- 5. Apply the narrower constraint.
alter table public.registrations
  add constraint registrations_level_check
  check (level in ('Varsity', 'JV', 'Multiple teams'));

-- 6. Confirm.
select level, count(*) from public.registrations group by level order by level;
