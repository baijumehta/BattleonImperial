-- =============================================================================
-- Battle on Imperial — add CIF division to registrations
--
-- The event is open to CIF Division 2 and Division 3 girls' programs, so the
-- form now asks which division a program is in. Run this once in the Supabase
-- SQL Editor. Safe to re-run.
--
-- Existing rows predate the question and cannot be back-filled honestly, so the
-- column is nullable and old rows keep a null. Null means "we never asked",
-- which is different from "Not sure" — the coordinator still has to ask those
-- teams by hand.
-- =============================================================================

alter table public.registrations
  add column if not exists cif_division text;

-- 'Another division' is deliberately offered. A program outside D2/D3 telling
-- you so on the form is far more useful than the same program guessing at an
-- answer that fits, and it lets the coordinator reply properly instead of
-- discovering the mismatch weeks later.
alter table public.registrations
  drop constraint if exists registrations_cif_division_check;

alter table public.registrations
  add constraint registrations_cif_division_check
  check (cif_division is null or cif_division in (
    'Division 2', 'Division 3', 'Not sure', 'Another division'
  ));

-- The anon INSERT policy is unchanged: it constrains status and internal_notes
-- only, so the new column is writable by the public form and the CHECK above is
-- what keeps the value honest. Nothing here grants anon any read access.

-- =============================================================================
-- Reading your submissions, with the division
--   select created_at, school, level, cif_division, contact, email, phone, status
--   from public.registrations
--   order by created_at desc;
--
-- Anyone who submitted before this column existed:
--   select created_at, school, contact, email
--   from public.registrations
--   where cif_division is null
--   order by created_at desc;
-- =============================================================================
