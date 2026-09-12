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

`vercel.json` sets cache and security headers:

- **`/assets/img/*`** — one day fresh, then a week of `stale-while-revalidate`.
  Photos are most of the page weight and rarely change. Renaming a file busts
  its cache immediately, so swap a photo by changing the filename if you need
  it live at once.
- **`/assets/*.css`, `/assets/*.js`** — deliberately left on `must-revalidate`.
  These filenames aren't content-hashed, so a long cache would strand visitors
  on stale code after an edit.
- **Everything** — `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.

Note that `vercel.json` is validated strictly and JSON has no comments — adding
a `comment` key to a headers entry makes the whole deployment fail schema
validation, which silently leaves the previous build serving.

## Things to fill in before launch

| What | Where |
|---|---|
| Exact weekend (the site says "March 2027", weekend TBA) | `index.html` — hero badge, `.hero__rule`, `.hero__note`, the "When is the tournament?" FAQ, and the `description` + `og:description` meta tags |
| Contact email (currently `info@battleonimperial.com`) | `assets/config.js`, plus the footer and final CTA in `index.html` |
| Supabase URL + anon key | `assets/config.js` |
| Stock photos → real Canyon team photos | `assets/img/` (see [CREDITS.md](CREDITS.md)) |
| Number of fields (the map schematic shows two) | `index.html` — the location SVG |
| Drive-time table — verify against your own routes | `index.html` — `.compare` table |
| Spectator admission policy | FAQ, "Is there a cost for spectators?" |
| **Refund policy — have the board sign off** | `index.html` — the `#policy` block |

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

Payment is handled **outside** the site, by invoice. There is deliberately no
card checkout in the page.

```
form submit  ->  registrations row (status: new)
             ->  coordinator reviews, confirms a spot
             ->  Stripe invoice for the $250 deposit   (status: contacted)
             ->  deposit clears                        (status: confirmed)
             ->  Stripe invoice for the $750 balance, due 30 days out
```

Why invoices rather than a checkout button: most public high school programs pay
through a district purchase order, which needs an invoice and a W-9 — not a
checkout page. Invoices also let a team pay by ACH, which on Stripe costs $5 per
$1,000 against $29.30 for a card. Across a full 20-team field that is roughly
$100 versus $586.

Use the `status` column on `registrations` to track where each team is. At 20
teams, reconciling Stripe against that table by hand is entirely manageable.

If you later want self-serve card payment, it needs two Vercel serverless
functions — one to create a Stripe Checkout Session, one to receive the webhook
and mark the row paid (verifying Stripe's signature, and idempotent because
Stripe retries). That is the only part of this that requires real backend code.

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

## The refund policy is a draft

The `#policy` section on the site is a reasonable starting point, not legal
advice. Before the first dollar arrives, have the booster club board read it and
decide two things in particular:

1. **Organizer cancellation.** As written, if the tournament is called off before
   any games are played, teams get everything back including the deposit. That is
   generous and good for goodwill, but it puts the club on the hook for costs
   already committed — officials, trainers, and camera rental are largely spent by
   then. If the club cannot absorb that, change it to a refund less the deposit,
   or offer a credit toward the following year.
2. **The 30/60-day thresholds.** These should sit outside the dates you commit to
   officials and vendors. If you book officials 45 days out, a team withdrawing at
   40 days with a near-full refund costs you real money.

The site states plainly that the entry fee is not a tax-deductible charitable
contribution. Keep that line — it is payment for a service, and a 501(c)(3)
receipt implying otherwise creates a problem. Confirm the specifics with the
club's treasurer or CPA.
