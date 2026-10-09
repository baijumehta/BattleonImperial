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

<https://www.battleonimperial.com>

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

## Small files at the site root

- **`battle-on-imperial.ics`** — the "Add to calendar" file. An all-day event
  on March 13, 2027 with the address and the check-in time in the description.
  `vercel.json` serves it as `text/calendar` so phones open it in the calendar
  app rather than downloading it. The Google Calendar link in the address card
  carries the same details in its query string; change both with the date.
- **`sitemap.xml`** and **`robots.txt`** — every public page is listed;
  `admin.html` is disallowed and noindexed.
- **`404.html`** — Vercel serves it for any missing path. Its links are
  absolute because it renders at any depth.

The home page also carries a JSON-LD `SportsEvent` block (date, address,
organizer, team-entry prices with the early-bird `validThrough`) so Google can
show the event in search. It duplicates facts stated in the copy — keep them in
step or the rich result gets pulled.

### Key Dates and shared schedule links

The Key Dates strip in the registration section derives every date from the
tournament date and the refund terms: November 30 (early bird), January 11
(the last day still *more than* 60 days before March 13), February 11 (30 days
before). `assets/script.js` greys out dates that have passed and tags the next
one. The same three dates appear beside the refund tiers in `#policy`.

On the schedule and standings pages the filter is mirrored into the address
bar (`?team=…&level=…`), so the **Copy link** button gives a coach a link that
opens on their team. A link with either parameter replaces whatever filter the
browser remembered. **Print** uses the print stylesheet, which drops the nav
and footer and keeps each game card whole.

## Sponsors

`sponsors.html` carries the pitch, the six packages ($250 to $2,500, from the
sponsor flyer) and an inquiry form. The home page has a `#sponsors` section
with a call to action and a logo band.

- **Listing sponsors** — Tournament Control → **Sponsors**. Add a name, pick
  the package, paste the website and upload a logo; it appears on the home
  page and on `sponsors.html` straight away, grouped by package with the
  presenting partner largest. Untick *Visible* to hide one without deleting
  it. Until the first sponsor exists the band is hidden and the home page
  heading reads "Sponsor the Tournament" instead of "Our Sponsors".
- **Inquiries** — the form writes to `public.sponsor_inquiries` (insert-only
  for the public key, like registrations). Each one emails the organisers and
  the business through the same edge function as team entries, which routes
  on the table name. Work the list in Tournament Control → **Sponsor
  Inquiries**.
- **Setup** — run `supabase/sponsors.sql` (tables, policies, the
  `sponsor-logos` storage bucket and the email trigger), then redeploy the
  edge function so it includes `sponsor-templates.ts`. The trigger reads the
  webhook secret out of the registration trigger, so nothing is pasted twice.
- **Changing a package** — the names and prices live in five places that
  must match: the cards and the form select on `sponsors.html`, the tier
  CHECKs in `supabase/sponsors.sql`, the order list in `assets/sponsors.js`,
  the select in `admin.html` (and `SPONSOR_TIERS` in `admin.js`), and
  `PACKAGES` in `sponsor-templates.ts`.
- **Sponsor packet PDF** — `assets/battle-on-imperial-sponsorship.pdf`, linked
  from `sponsors.html` and the home page. Its source is
  `print/sponsor-flyer.html`; the render command is in a comment at the top of
  that file. Regenerate it after any change to packages, prices, the date or
  the contact.
- **Contact** — the sponsorship contact (Lydie, 714-747-4770,
  battleonimperial@gmail.com) is on `sponsors.html` and in
  `sponsor-templates.ts`. The same Gmail address is the site-wide contact.

## Things to fill in before launch

| What | Where |
|---|---|
| Tournament date (currently Saturday, March 13, 2027) | `index.html` — hero badge, `.hero__rule`, the "When is the tournament?" FAQ, the Key Dates strip, the JSON-LD block, the `description` + `og:description` meta tags; `battle-on-imperial.ics` and the Google Calendar link in the address card; the refund-tier dates in `#policy` |
| Contact email (currently `battleonimperial@gmail.com`) | `assets/config.js`, plus the footer and final CTA in `index.html` |
| Supabase URL + anon key | `assets/config.js` |
| Drive-time table — verify against your own routes | `index.html` — `.compare` table |
| Main field entrance — confirm the check-in marker is in the right place | `index.html` — the location SVG, `#checkin` |
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
  CONTACT_EMAIL: 'battleonimperial@gmail.com',
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
             ->  Stripe invoice for the balance, due 30 days out
```

Why invoices rather than a checkout button: most public high school programs pay
through a district purchase order, which needs an invoice and a W-9 — not a
checkout page. Invoices also let a team pay by ACH, which on Stripe is 0.8% capped
at $5, against 2.9% plus 30c for a card. Across a full field at regular prices —
say 12 varsity and 6 JV, each paying a deposit and a balance — that is roughly
$120 versus $440.

Use the `status` column on `registrations` to track where each team is. At 18
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
event — fields, officials, athletic training, insurance, and operations.
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
   already committed — officials, trainers and insurance are largely spent by
   then. If the club cannot absorb that, change it to a refund less the deposit,
   or offer a credit toward the following year.
2. **The 30/60-day thresholds.** These should sit outside the dates you commit to
   officials and vendors. If you book officials 45 days out, a team withdrawing at
   40 days with a near-full refund costs you real money.

The site states plainly that the entry fee is not a tax-deductible charitable
contribution. Keep that line — it is payment for a service, and a 501(c)(3)
receipt implying otherwise creates a problem. Confirm the specifics with the
club's treasurer or CPA.
