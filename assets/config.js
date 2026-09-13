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

  // Publishable key. Safe in public source by design — it identifies the
  // project, it does not grant trust. Row Level Security (supabase/schema.sql)
  // limits it to INSERT on registrations and nothing else: no read, no update,
  // no delete. Never replace this with the service_role / secret key.
  SUPABASE_ANON_KEY: 'sb_publishable_OTUf_7xjT8ArfCMsAfzThA_thkqPgPy',

  // Where the mailto fallback sends, and the address shown on the site.
  CONTACT_EMAIL: 'info@battleonimperial.com',
};
