/*
 * Renders the merchandise emails from sample orders and checks what is easy
 * to get wrong and invisible once deployed.
 *
 *     node supabase/functions/registration-email/test-merch-templates.ts
 *     node supabase/functions/registration-email/test-merch-templates.ts --print
 */
import { itemLines, merchConfirmEmail, merchOrganiserEmail, orderTotal, type MerchOrder } from './merch-templates.ts';

const ADMIN = 'https://www.battleonimperial.com/admin.html';

const order: MerchOrder = {
  order_no: 'BOI-7K2MX', name: 'Dana Reyes', school: 'Canyon', email: 'dana@example.com', phone: '714-555-0100',
  items: [{ id: 'hoodie', size: 'M', qty: 2 }, { id: 'tee', size: 'L', qty: 1 }, { id: 'pin', size: null, qty: 3 }],
  total: 90, notes: 'Two hoodies are for twins.', ack: true
};

const noName: MerchOrder = { ...order, name: '', order_no: 'BOI-AB3CD', school: null, notes: null };

const hostile: MerchOrder = {
  order_no: 'BOI-ZZ999', name: '<script>alert(1)</script>', email: 'x@example.com', phone: '0000000',
  items: [{ id: 'mystery', size: '<b>XL</b>', qty: 1 }], total: 5, notes: '<img src=x onerror=alert(1)>', ack: true
};

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ' — ' + detail}`);
  if (!ok) failures++;
}

check('item lines show qty, name, size and line total',
  JSON.stringify(itemLines(order)) === JSON.stringify(['2 × Hoodie (M) — $60', '1 × T-Shirt (L) — $15', '3 × Tournament Pin — $15']),
  JSON.stringify(itemLines(order)));
check('order total uses the stored total', orderTotal(order) === 90);
check('order total falls back to prices when total is missing', orderTotal({ items: order.items }) === 90);
check('unknown item id is shown, not dropped', itemLines(hostile)[0].startsWith('1 × mystery'));

const conf = merchConfirmEmail(order);
const org = merchOrganiserEmail(order, ADMIN);
const confNoName = merchConfirmEmail(noName);
const confH = merchConfirmEmail(hostile);
const orgH = merchOrganiserEmail(hostile, ADMIN);

check('confirmation subject carries the order number and total',
  conf.subject === 'Order BOI-7K2MX — Battle on Imperial merchandise, $90 by Zelle', conf.subject);
check('confirmation greets by first name', conf.text.startsWith('Hi Dana,'));
check('confirmation with no name says Hello, not "Hi ,"', confNoName.text.startsWith('Hello,') && !confNoName.text.includes('Hi ,'));
check('confirmation tells them the Zelle address, amount and memo',
  conf.text.includes('girlslacrosseboosterclub@gmail.com') && conf.text.includes('$90') && conf.text.includes('BOI-7K2MX in the memo'));
check('confirmation says pickup only', conf.text.includes('No shipping'));
check('confirmation names the pickup day', conf.text.includes('March 13, 2027'));
check('confirmation HTML lists every item', ['Hoodie (M)', 'T-Shirt (L)', 'Tournament Pin'].every((s) => conf.html.includes(s)));

check('organiser subject carries order, total and name', org.subject === 'Merch order BOI-7K2MX — $90 — Dana Reyes', org.subject);
check('organiser alert links to the admin page', org.text.includes(ADMIN) && org.html.includes(ADMIN));
check('organiser alert says to mark Paid when the Zelle lands', org.text.includes('mark') && org.text.includes('Paid'));

check('HTML typed by a buyer is escaped in the confirmation', !confH.html.includes('<script>') && !confH.html.includes('<b>XL</b>'));
check('HTML typed by a buyer is escaped in the organiser alert', !orgH.html.includes('<script>') && !orgH.html.includes('<img src=x'));
check('subjects are single lines', !confH.subject.includes('\n') && !orgH.subject.includes('\n'));
check('plain text keeps its blank lines', /\n\n/.test(conf.text) && /\n\n/.test(org.text));

if (process.argv.includes('--print')) {
  for (const [label, m] of [['BUYER', conf], ['ORGANISER', org]] as const) {
    console.log(`\n===== ${label}: ${m.subject}\n`);
    console.log(m.text);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall merch template checks passed');
process.exit(failures ? 1 : 0);
