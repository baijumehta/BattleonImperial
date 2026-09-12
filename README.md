# Battle on Imperial

Marketing site for the Battle on Imperial lacrosse tournament, hosted by the
Canyon High School Lacrosse Booster Club — Canyon High School, 220 S Imperial Hwy,
Anaheim, CA 92807.

Plain static HTML/CSS/JS. No build step, no dependencies.

```
index.html            the whole site (one page, anchored sections)
assets/styles.css     all styling; brand colors are CSS variables at the top
assets/script.js      mobile nav, scroll reveals, stat count-up, interest form
assets/config.js      Supabase URL + anon key go here
assets/img/           photos (see CREDITS.md)
supabase/schema.sql   registrations table + row level security
dev-server.js         zero-dependency local preview server
vercel.json           cache + security headers for the deployed site
```

## Running it locally

Just open `index.html` in a browser. Or serve it (no install needed):

```bash
node dev-server.js
```

## Deployment

Hosted on **Vercel**, deploying automatically from `main`:

<https://battleon-imperial.vercel.app>

Push to `main` and Vercel builds it. There is no build step — it serves the
repo as static files.

`vercel.json` sets cache headers: photos get a day of freshness plus a week of
stale-while-revalidate, while CSS and JS stay on `must-revalidate` because their
filenames aren't content-hashed and a long cache would strand visitors on stale
code. If you replace a photo and need it live immediately, change the filename
rather than waiting out the cache.

## Things to fill in before launch

| What | Where |
|---|---|
| Tournament dates (currently "Dates to be announced · Spring 2027") | `index.html` — hero `.hero__note`, and the "When is the tournament?" FAQ |
| Contact email (currently `info@battleonimperial.com`) | `assets/config.js`, plus the footer and final CTA in `index.html` |
| Supabase URL + anon key | `assets/config.js` |
| Stock photos → real Canyon team photos | `assets/img/` (see [CREDITS.md](CREDITS.md)) |
| Number of fields (the map schematic shows two) | `index.html` — the location SVG |
| Drive-time table — verify against your own routes | `index.html` — `.compare` table |
| Spectator admission policy | FAQ, "Is there a cost for spectators?" |

## Registration backend (Supabase)

Submissions go to a Supabase table. Until it's configured the form falls back to
composing an email, so the site works either way.

**1. Create the table.** In your Supabase project: SQL Editor → New query → paste
[`supabase/schema.sql`](supabase/schema.sql) → Run.

**2. Add your keys.** Project Settings → API, then fill in
[`assets/config.js`](assets/config.js):

```js
window.BOI_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
  CONTACT_EMAIL: 'info@battleonimperial.com',
};
```

**3. Read submissions** in Table Editor → `registrations`, or:

```sql
select created_at, school, level, contact, email, phone, notes, status
from public.registrations order by created_at desc;
```

### Why the anon key in public source is fine

That key is *designed* to be public — it identifies the project, it doesn't
grant trust. Row Level Security decides what it can do, and the schema grants
the anonymous role `INSERT` and nothing else. There is no `SELECT` policy, so
nobody can read other teams' submissions back out through the API. You read them
in the dashboard, which uses the service role and bypasses RLS.

**Never put the `service_role` key in `config.js`** — that one does bypass RLS.

### Spam handling

The form carries an off-screen honeypot field. If it's filled the submission is
silently dropped with a normal-looking success message, so bots get no signal.
If you start seeing spam anyway, Supabase supports Turnstile/hCaptcha, or you can
put a Cloudflare Worker in front of the insert.

### Taking payment

Out of scope for the form as written. When the entry packet is final, the usual
options are a Stripe Payment Link on the confirmation email, or moving entry to
TeamSnap/LeagueApps and pointing the button there.

## Branding

Colors live in `:root` in `assets/styles.css`:

```css
--navy-900 / --navy-800 / --navy-700   /* dark backgrounds */
--blue-500 / --blue-400                /* primary accent */
--amber / --amber-dk                   /* CTA + highlight */
```

Swap those six values to match Canyon's school colors and the whole site follows.
Typography is Barlow Condensed (display) + Inter (body), loaded from Google Fonts.

## A note on copy

The site deliberately describes the entry fee as covering the cost of running the
event — fields, officials, athletic training, AI cameras, insurance, and operations.
It does not describe the tournament as a fundraiser or revenue source for Canyon
Lacrosse. Keep that framing if you edit the Registration section or the
"Where does the entry fee go?" FAQ.
