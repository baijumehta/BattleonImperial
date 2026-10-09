/*
 * Renders the sponsor emails from sample inquiries and checks what is easy to
 * get wrong and invisible once deployed.
 *
 *     node supabase/functions/registration-email/test-sponsor-templates.ts
 *     node supabase/functions/registration-email/test-sponsor-templates.ts --print
 */
import { sponsorConfirmEmail, sponsorOrganiserEmail, tierLabel, type SponsorInquiry } from './sponsor-templates.ts';

const ADMIN = 'https://www.battleonimperial.com/admin.html';

const full: SponsorInquiry = {
  business: 'Anaheim Hills Orthodontics',
  contact_name: 'Priya Natarajan',
  email: 'priya@example.com',
  phone: '714-555-0199',
  website: 'https://example.com',
  tier: 'Field Partner',
  message: 'We sponsor a few youth teams already.\n\nCould we do the turf field?',
  consent: true
};

const sparse: SponsorInquiry = {
  business: 'Corner Bakery',
  contact_name: '',
  email: 'owner@example.com',
  consent: false
};

const hostile: SponsorInquiry = {
  business: '<script>alert(1)</script> Co',
  contact_name: 'Sam "the" <b>Bold</b>',
  email: 'sam@example.com',
  tier: 'In-kind or something else',
  message: '<img src=x onerror=alert(1)>',
  consent: true
};

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ' — ' + detail}`);
  if (!ok) failures++;
}

const orgFull = sponsorOrganiserEmail(full, ADMIN);
const confFull = sponsorConfirmEmail(full);
const orgSparse = sponsorOrganiserEmail(sparse, ADMIN);
const confSparse = sponsorConfirmEmail(sparse);
const orgHostile = sponsorOrganiserEmail(hostile, ADMIN);
const confHostile = sponsorConfirmEmail(hostile);

check('tier label carries the price', tierLabel(full) === 'Field Partner ($1,250)', tierLabel(full));
check('missing tier reads as not chosen', tierLabel(sparse) === 'package not chosen', tierLabel(sparse));
check('free-form tier is lower-cased mid-sentence', tierLabel(hostile) === 'in-kind or something else', tierLabel(hostile));

check('organiser subject names the business and package',
  orgFull.subject === 'Sponsor inquiry: Anaheim Hills Orthodontics — Field Partner ($1,250)', orgFull.subject);
check('organiser alert links to the admin page', orgFull.text.includes(ADMIN) && orgFull.html.includes(ADMIN));
check('organiser alert flags a missing consent', orgSparse.text.includes('NO — they did not tick the box'));

check('confirmation greets by first name', confFull.text.startsWith('Hi Priya,'));
check('confirmation with no name says Hello, not "Hi ,"', confSparse.text.startsWith('Hello,') && !confSparse.text.includes('Hi ,'));
check('confirmation names the business and package',
  confFull.text.includes('Anaheim Hills Orthodontics (Field Partner ($1,250))'));
check('confirmation links to the sponsors page', confFull.text.includes('/sponsors.html') && confFull.html.includes('/sponsors.html'));

check('HTML typed by a visitor is escaped in the organiser HTML',
  !orgHostile.html.includes('<script>') && !orgHostile.html.includes('<img src=x') && orgHostile.html.includes('&lt;script&gt;'));
check('HTML typed by a visitor is escaped in the confirmation HTML',
  !confHostile.html.includes('<script>') && confHostile.html.includes('&lt;script&gt;'));
check('subject line is a single line', !orgHostile.subject.includes('\n') && !confHostile.subject.includes('\n'));

check('plain text keeps its blank lines', /\n\n/.test(confFull.text) && /\n\n/.test(orgFull.text));
check('organiser plain text keeps the message paragraphs', orgFull.text.includes('already.\n\nCould we'));

if (process.argv.includes('--print')) {
  for (const [label, m] of [['ORGANISER', orgFull], ['CONFIRMATION', confFull]] as const) {
    console.log(`\n===== ${label}: ${m.subject}\n`);
    console.log(m.text);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall sponsor template checks passed');
process.exit(failures ? 1 : 0);
