/*
 * Email body for an invoice sent from Tournament Control.
 *
 * Like the other templates: no Deno APIs and no imports, so it runs under
 * plain `node invoice-templates.ts` — see test-invoice-templates.ts.
 *
 * The amounts come from the row the database sent, where subtotal, amount
 * paid and balance are generated columns. Nothing is recomputed here except
 * the per-line totals shown in the table.
 */

export interface InvoiceLine {
  description?: string;
  qty?: number;
  unit_price?: number;
  discount?: number;
}

export interface Invoice {
  kind?: string | null;
  token?: string;
  invoice_no?: string | null;
  issued_on?: string | null;
  due_on?: string | null;
  status?: string | null;
  bill_school?: string | null;
  bill_program?: string | null;
  bill_contact?: string | null;
  bill_email?: string | null;
  po_ref?: string | null;
  lines?: InvoiceLine[] | null;
  credit?: number | string | null;
  credit_label?: string | null;
  subtotal?: number | string | null;
  amount_paid?: number | string | null;
  balance?: number | string | null;
  notes?: string | null;
}

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

export const SITE = 'https://www.battleonimperial.com';
export const EVENT = 'Saturday, March 13, 2027';

/* EDIT: payment details — the same as invoice.html and the site's How-to-pay
   block. CHECK_MAIL_TO is where checks are mailed; if it is ever emptied, the
   email tells them to ask instead. */
export const ZELLE_ADDRESS = 'girlslacrosseboosterclub@gmail.com';
export const PAYEE = 'Canyon Girls Lacrosse Booster Club';
export const CHECK_MAIL_TO = 'PO Box 17992, Anaheim, CA 92817';
export const CONTACT_EMAIL = 'battleonimperial@gmail.com';

export const SPONSOR_NOTE =
  'Sponsorship is payment for the recognition described in your package, not a tax-deductible donation.';

export function invoiceLink(r: Invoice): string {
  return `${SITE}/invoice.html?t=${encodeURIComponent(r.token || '')}`;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(v: unknown): string {
  return '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* "2027-01-12" → "January 12, 2027". Parsed as a calendar date, not a moment,
   so no time zone can move it a day. */
export function longDate(iso?: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

function firstName(r: Invoice): string {
  return (r.bill_contact || '').trim().split(/\s+/)[0] || '';
}

export function lineTotal(l: InvoiceLine): number {
  return Math.round((num(l.qty) * num(l.unit_price) - num(l.discount)) * 100) / 100;
}

export function invoiceEmail(r: Invoice): Mail {
  const no = r.invoice_no || '';
  const name = firstName(r);
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const balance = money(r.balance);
  const due = longDate(r.due_on);
  const link = invoiceLink(r);
  const paidInFull = num(r.balance) <= 0;
  const subject = paidInFull
    ? `Invoice ${no} — Battle on Imperial — paid in full`
    : `Invoice ${no} — Battle on Imperial — ${balance} due ${due}`;

  const lines = (r.lines || []).map((l) =>
    `  ${l.description || 'Item'}  ×${num(l.qty)}  ${money(lineTotal(l))}`);
  const credit = num(r.credit);
  const paid = num(r.amount_paid);

  /* Payment instructions live on the invoice page, not in this email. Filters
     such as INKY flag an email that names a payment account (Zelle address,
     bank transfer, W-9) as "sensitive content", and on a young domain that is
     enough to quarantine it. The email says what is owed and where to look. */
  const text = [
    greeting,
    ``,
    `Here is invoice ${no} for ${r.bill_program || r.bill_school || 'your entry'} at Battle on Imperial, ${EVENT}.`,
    ``,
    ...lines,
    `  Subtotal: ${money(r.subtotal)}`,
    ...(credit ? [`  ${r.credit_label || 'Discount / credit'}: −${money(credit)}`] : []),
    ...(paid ? [`  Amount paid: −${money(paid)}`] : []),
    `  BALANCE DUE: ${balance}`,
    ``,
    paidInFull ? `This invoice is paid in full — thank you.` : `Due by ${due}.`,
    ...(r.po_ref ? [`Your PO / reference: ${r.po_ref}`] : []),
    ``,
    `View, print or save the invoice as a PDF: ${link}`,
    ``,
    ...(paidInFull ? [] : [
      `Payment options and the remittance details are on the invoice. Please include ${no} with your payment.`,
      ``
    ]),
    ...(r.kind === 'sponsor' ? [SPONSOR_NOTE, ``] : []),
    `Questions: reply to this email.`,
    ``,
    `Battle on Imperial`,
    `Canyon Girls Lacrosse Booster Club`
  ].join('\n');

  const rowsHtml = (r.lines || []).map((l) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #eee9df;">${esc(l.description || 'Item')}` +
    `${num(l.qty) !== 1 ? ` <span style="color:#76767e;">×${esc(num(l.qty))}</span>` : ''}</td>` +
    `<td style="padding:8px 0;border-bottom:1px solid #eee9df;text-align:right;white-space:nowrap;">${esc(money(lineTotal(l)))}</td></tr>`
  ).join('');
  const sumRow = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 0;${strong ? 'font-weight:700;font-size:16px;' : 'color:#5a5a62;'}">${esc(label)}</td>` +
    `<td style="padding:6px 0;text-align:right;white-space:nowrap;${strong ? 'font-weight:700;font-size:16px;' : ''}">${esc(value)}</td></tr>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F3F1EB;font-family:Arial,Helvetica,sans-serif;color:#171717;">
<div style="max-width:600px;margin:0 auto;padding:28px 18px;">
  <div style="background:#171717;border-radius:12px 12px 0 0;padding:20px 24px;">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#D6A928;font-weight:700;">Battle on Imperial · Girls Lacrosse Tournament</div>
    <div style="font-size:22px;font-weight:700;color:#fff;margin-top:6px;">Invoice ${esc(no)}</div>
  </div>
  <div style="background:#12382F;color:#fff;padding:12px 24px;font-size:14px;">
    ${paidInFull ? 'Paid in full' : `Balance due <b>${esc(balance)}</b> by <b>${esc(due)}</b>`}
  </div>
  <div style="background:#fff;border:1px solid #e6e1d6;border-top:0;border-radius:0 0 12px 12px;padding:24px;font-size:15px;line-height:1.55;">
    <p style="margin:0 0 14px;">${esc(greeting)}</p>
    <p style="margin:0 0 16px;">Here is invoice <b>${esc(no)}</b> for ${esc(r.bill_program || r.bill_school || 'your entry')} at Battle on Imperial, ${esc(EVENT)}.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14.5px;">
      ${rowsHtml}
      ${sumRow('Subtotal', money(r.subtotal))}
      ${credit ? sumRow(r.credit_label || 'Discount / credit', '−' + money(credit)) : ''}
      ${paid ? sumRow('Amount paid', '−' + money(paid)) : ''}
      ${sumRow('Balance due', balance, true)}
    </table>
    ${r.po_ref ? `<p style="margin:14px 0 0;color:#5a5a62;font-size:14px;">Your PO / reference: <b>${esc(r.po_ref)}</b></p>` : ''}
    <p style="margin:22px 0;text-align:center;">
      <a href="${esc(link)}" style="display:inline-block;background:#12382F;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">View, print or save as PDF</a>
    </p>
    ${paidInFull ? '' : `<p style="margin:0;font-size:14px;color:#44444c;">Payment options and the remittance details are on the invoice. Please include <b>${esc(no)}</b> with your payment.</p>`}
    ${r.kind === 'sponsor' ? `<p style="margin:18px 0 0;color:#5a5a62;font-size:13.5px;">${esc(SPONSOR_NOTE)}</p>` : ''}
    <p style="margin:18px 0 0;">Questions: reply to this email.</p>
    <p style="margin:14px 0 0;color:#5a5a62;">Battle on Imperial · Canyon Girls Lacrosse Booster Club</p>
  </div>
</div>
</body></html>`;

  return { subject, text, html };
}
