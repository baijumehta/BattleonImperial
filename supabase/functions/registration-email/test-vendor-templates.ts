/*
 * Renders the vendor emails from sample registrations and checks what is easy
 * to get wrong and invisible once deployed.
 *
 *     node supabase/functions/registration-email/test-vendor-templates.ts
 *     node supabase/functions/registration-email/test-vendor-templates.ts --print
 */
import { boothSummary, vendorConfirmEmail, vendorFlags, vendorOrganiserEmail, type VendorRegistration } from './vendor-templates.ts';

const ADMIN = 'https://www.battleonimperial.com/admin.html';

const merchant: VendorRegistration = {
  business: 'Hills Lacrosse Supply', category: 'Gear & equipment',
  products: 'Sticks, heads, mesh and stringing on the spot.', website: '@hillslax',
  booth_type: 'Merchant', booths: 2, permits_ack: false,
  contact_name: 'Jordan Lee', email: 'jordan@example.com', phone: '714-555-0150',
  notes: 'Need to be near a power outlet if possible.', payment_ack: true, consent: true
};

const food: VendorRegistration = {
  business: 'Canyon Coffee Cart', category: 'Food truck or food vendor',
  products: 'Coffee, cold brew, pastries.',
  booth_type: 'Food', booths: 1, permits_ack: true,
  contact_name: 'Maria Ortega', email: 'maria@example.com', phone: '714-555-0160',
  payment_ack: true, consent: true
};

const foodNoPermits: VendorRegistration = { ...food, permits_ack: false, contact_name: '', payment_ack: false };

const hostile: VendorRegistration = {
  business: '<script>alert(1)</script> Bowls', booth_type: 'Merchant', booths: 1,
  products: '<img src=x onerror=alert(1)>', contact_name: 'Sam "the" <b>Bold</b>',
  email: 'sam@example.com', payment_ack: true, consent: true
};

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ' — ' + detail}`);
  if (!ok) failures++;
}

check('booth summary multiplies the published price', boothSummary(merchant) === 'two merchant booths ($400)', boothSummary(merchant));
check('food booth summary', boothSummary(food) === 'one food vendor booth ($300)', boothSummary(food));
check('booth count is clamped to 1–3', boothSummary({ booth_type: 'Merchant', booths: 9 }) === 'three merchant booths ($600)');
check('missing booth type still reads', boothSummary({ booths: 1 }) === 'one booth', boothSummary({ booths: 1 }));

check('merchant with everything ticked has no flags', vendorFlags(merchant).length === 0);
check('food vendor without permits is flagged', vendorFlags(foodNoPermits).some((f) => /health permits/.test(f)));
check('unacknowledged fee terms are flagged', vendorFlags(foodNoPermits).some((f) => /fee terms/.test(f)));

const orgM = vendorOrganiserEmail(merchant, ADMIN);
const orgF = vendorOrganiserEmail(foodNoPermits, ADMIN);
const confM = vendorConfirmEmail(merchant);
const confF = vendorConfirmEmail(food);
const confNoName = vendorConfirmEmail(foodNoPermits);
const orgH = vendorOrganiserEmail(hostile, ADMIN);
const confH = vendorConfirmEmail(hostile);

check('organiser subject names the business and booths',
  orgM.subject === 'Vendor booth request: Hills Lacrosse Supply — two merchant booths ($400)', orgM.subject);
check('flagged request carries [check] in the subject', orgF.subject.endsWith('[check]'), orgF.subject);
check('organiser alert links to the admin page', orgM.text.includes(ADMIN) && orgM.html.includes(ADMIN));
check('merchant alert says permits are n/a', orgM.text.includes('n/a (merchant)'));
check('food alert without permits says NOT confirmed', orgF.text.includes('NOT confirmed') && orgF.html.includes('NOT confirmed'));

check('confirmation greets by first name', confM.text.startsWith('Hi Jordan,'));
check('confirmation with no name says Hello, not "Hi ,"', confNoName.text.startsWith('Hello,') && !confNoName.text.includes('Hi ,'));
check('confirmation states the booths and total', confM.text.includes('two merchant booths ($400)'));
check('food confirmation reminds about permits', confF.text.includes('Health') && confF.html.includes('Health Department permits'));
check('merchant confirmation does not mention permits', !confM.text.includes('Health Department'));
check('confirmation links to the vendor page', confM.text.includes('/vendors.html') && confM.html.includes('/vendors.html'));

check('HTML typed by a vendor is escaped in the organiser HTML',
  !orgH.html.includes('<script>') && !orgH.html.includes('<img src=x') && orgH.html.includes('&lt;script&gt;'));
check('HTML typed by a vendor is escaped in the confirmation HTML', !confH.html.includes('<script>'));
check('subject lines are single lines', !orgH.subject.includes('\n') && !confH.subject.includes('\n'));
check('plain text keeps its blank lines', /\n\n/.test(confM.text) && /\n\n/.test(orgM.text));

if (process.argv.includes('--print')) {
  for (const [label, m] of [['ORGANISER', orgM], ['CONFIRMATION (food)', confF]] as const) {
    console.log(`\n===== ${label}: ${m.subject}\n`);
    console.log(m.text);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall vendor template checks passed');
process.exit(failures ? 1 : 0);
