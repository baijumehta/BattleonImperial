/**
 * Battle on Imperial — site configuration.
 *
 * Fill these in with your Supabase project's values:
 *   Supabase dashboard -> Project Settings -> API
 *     SUPABASE_URL      = "Project URL"
 *     SUPABASE_ANON_KEY = the "anon" / "public" key
 *
 * The anon key is meant to be public — it ships in the page source by design.
 * What it can actually do is controlled by Row Level Security in
 * supabase/schema.sql, which allows INSERT only and no reads. Never put the
 * service_role key here; that one bypasses RLS entirely.
 *
 * Leave these blank and the registration form falls back to composing an
 * email instead, so the site keeps working before the database is set up.
 */
window.BOI_CONFIG = {
  SUPABASE_URL: 'https://gduaigjclvqsraesnvrh.supabase.co',

  // Paste the project's anon / publishable key here. Until it is filled in,
  // the registration form falls back to composing an email.
  SUPABASE_ANON_KEY: '',

  // Where the mailto fallback sends, and the address shown on the site.
  CONTACT_EMAIL: 'info@battleonimperial.com',
};
