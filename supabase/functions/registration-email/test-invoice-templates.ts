/*
 * Renders the invoice email from sample rows and checks what is easy to get
 * wrong and invisible once deployed.
 *
 *     node supabase/functions/registration-email/test-invoice-templates.ts
 *     node supabase/functions/registration-email/test-invoice-templates.ts --print
 */
import { invoiceEmail, invoiceLink, lineTotal, longDate, money, type Invoice } from './invoice-templates.ts';

const bundle: Invoice = {
  token: '3f1c2b9e-0000-4000-8000-000000000001', invoice_no: 'BOI-27-001',
  issued_on: '2026-10-20', due_on: '2026-11-19', status: 'sent',
  bill_school: 'Orange Lutheran High School', bill_program: 'Orange Lutheran Varsity & JV',
  bill_contact: 'Allie Kyte', bill_email: 'coach@example.com', po_ref: 'PO-4471',
  lines: [
    { description: 'Varsity team registration — three games guaranteed', qty: 1, unit_price: 650, discount: 0 },
    { description: 'JV team registration — two to three games', qty: 1, unit_price: 500, discount: 0 }
  ],
  credit: '50.00', credit_label: 'Varsity + JV bundle',
  subtotal: '1150.00', amount_paid: '0.00', balance: '1100.00'
};

const paid: Invoice = { ...bundle, invoice_no: 'BOI-27-002', amount_paid: '1100.00', balance: '0.00', status: 'paid', po_ref: null };
const noName: Invoice = { ...bundle, bill_contact: '', invoice_no: 'BOI-27-003' };
const hostile: Invoice = {
  ...bundle, invoice_no: 'BOI-27-004', bill_program: '<script>alert(1)</script>',
  lines: [{ description: '<img src=x onerror=alert(1)>', qty: 2, unit_price: 10, discount: 0 }]
};

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ' — ' + detail}`);
  if (!ok) failures++;
}

check('money formats with cents', money('1100') === '$1,100.00' && money(50) === '$50.00', money('1100'));
check('long date reads as a calendar date', longDate('2027-01-12') === 'January 12, 2027', longDate('2027-01-12'));
check('line total is qty × price − discount', lineTotal({ qty: 2, unit_price: 650, discount: 100 }) === 1200);
check('link carries the token', invoiceLink(bundle) === 'https://www.battleonimperial.com/invoice.html?t=3f1c2b9e-0000-4000-8000-000000000001');

const m = invoiceEmail(bundle);
check('subject carries number, balance and due date',
  m.subject === 'Invoice BOI-27-001 — Battle on Imperial — $1,100.00 due November 19, 2026', m.subject);
check('greets by first name', m.text.startsWith('Hi Allie,'));
check('shows subtotal, bundle credit and balance',
  m.text.includes('Subtotal: $1,150.00') && m.text.includes('Varsity + JV bundle: −$50.00') && m.text.includes('BALANCE DUE: $1,100.00'));
check('quotes the PO reference', m.text.includes('PO-4471'));
check('links to the invoice page in both parts', m.text.includes(invoiceLink(bundle)) && m.html.includes(invoiceLink(bundle)));
check('gives Zelle and check instructions with the invoice number',
  m.text.includes('girlslacrosseboosterclub@gmail.com') && m.text.includes('Canyon Girls Lacrosse Booster Club') && m.text.includes('put BOI-27-001'));
check('no zero lines for an unpaid invoice', !m.text.includes('Amount paid'));
check('gives the mailing address for checks',
  m.text.includes('mailed to PO Box 17992, Anaheim, CA 92817') && m.html.includes('PO Box 17992, Anaheim, CA 92817') && !m.text.includes('for the mailing address'));

const p = invoiceEmail(paid);
check('paid invoice says so in the subject', p.subject.endsWith('paid in full'), p.subject);
check('paid invoice drops the how-to-pay block', !p.text.includes('HOW TO PAY') && !p.html.includes('How to pay'));
check('paid invoice shows the payment', p.text.includes('Amount paid: −$1,100.00'));

check('no name says Hello, not "Hi ,"', invoiceEmail(noName).text.startsWith('Hello,'));

const sponsor = invoiceEmail({ ...bundle, kind: 'sponsor', invoice_no: 'BOI-27-010', bill_school: 'Hills Orthodontics', bill_program: 'Field Partner sponsorship' });
check('sponsor invoice carries the not-a-donation note', sponsor.text.includes('not a tax-deductible donation') && sponsor.html.includes('not a tax-deductible donation'));
check('team invoice does not', !m.text.includes('tax-deductible'));
check('sponsor invoice names the sponsorship', sponsor.text.includes('for Field Partner sponsorship at Battle on Imperial'));

const h = invoiceEmail(hostile);
check('typed HTML is escaped', !h.html.includes('<script>') && !h.html.includes('<img src=x'));
check('subject is a single line', !h.subject.includes('\n'));
check('plain text keeps its blank lines', /\n\n/.test(m.text));

if (process.argv.includes('--print')) {
  console.log(`\n===== ${m.subject}\n`);
  console.log(m.text);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall invoice template checks passed');
process.exit(failures ? 1 : 0);
