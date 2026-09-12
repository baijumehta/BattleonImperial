# Battle on Imperial

Marketing site for the Battle on Imperial lacrosse tournament, hosted by the
Canyon High School Lacrosse Booster Club — Canyon High School, 220 S Imperial Hwy,
Anaheim, CA 92807.

Plain static HTML/CSS/JS. No build step, no dependencies.

```
index.html          the whole site (one page, anchored sections)
assets/styles.css   all styling; brand colors are CSS variables at the top
assets/script.js    mobile nav, scroll reveals, stat count-up, interest form
```

## Running it locally

Just open `index.html` in a browser. Or serve it:

```bash
npx serve .
```

## Things to fill in before launch

| What | Where |
|---|---|
| Tournament dates (currently "Dates to be announced · Spring 2027") | `index.html` — hero `.hero__note`, and the "When is the tournament?" FAQ |
| Contact email (currently `info@battleonimperial.com`) | `index.html` — footer, final CTA, and `data-mailto` on the form |
| Number of fields (the map schematic shows two) | `index.html` — the location SVG |
| Drive-time table — verify against your own routes | `index.html` — `.compare` table |
| Spectator admission policy | FAQ, "Is there a cost for spectators?" |

## Turning on real registration

The interest form currently opens the visitor's email client with their team
details pre-filled, so it works with no server. To collect submissions instead,
add an `action` to the form in `index.html`:

```html
<form class="form" id="regForm" action="https://formspree.io/f/YOUR_ID" method="POST">
```

The script detects the `action` attribute and lets the browser POST normally —
no JS changes needed. Same approach works for Netlify Forms or a Google Form
endpoint. For card payments, the usual options are Stripe Payment Links or
TeamSnap/LeagueApps; those can replace the submit button entirely once the
entry packet is finalized.

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
