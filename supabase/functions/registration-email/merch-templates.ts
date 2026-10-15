/*
 * Email bodies for a merchandise pre-order.
 *
 * Like the other templates: no Deno APIs and no imports, so it runs under
 * plain `node merch-templates.ts` — see test-merch-templates.ts.
 */

export interface MerchItem {
  id?: string;
  size?: string | null;
  qty?: number;
}

export interface MerchOrder {
  id?: string;
  created_at?: string;
  order_no?: string | null;
  name?: string | null;
  school?: string | null;
  email?: string | null;
  phone?: string | null;
  items?: MerchItem[] | null;
  total?: number | null;
  notes?: string | null;
  ack?: boolean | null;
}

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

export const SITE = 'https://www.battleonimperial.com';
export const MERCH_PAGE = SITE + '/merch.html';
export const EVENT = 'Saturday, March 13, 2027';

/* EDIT: payment details — the same as the How-to-pay block on the site. */
export const ZELLE_ADDRESS = 'girlslacrosseboosterclub@gmail.com';
export const PAYEE = 'Canyon Girls Lacrosse Booster Club';
export const PAY_WITHIN_DAYS = 7;

/* EDIT: products, as in assets/merch.js and merch_price() in merch.sql. */
export const PRODUCTS: Record<string, { name: string; price: number }> = {
  tee:     { name: 'T-Shirt',          price: 15 },
  hoodie:  { name: 'Hoodie',           price: 30 },
  pants:   { name: 'Flannel PJ Pants', price: 20 },
  lanyard: { name: 'Lanyard',          price: 7 },
  pin:     { name: 'Tournament Pin',   price: 5 }
};

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function val(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : v;
  return s === null || s === undefined || s === '' ? '—' : String(s);
}

function firstName(r: MerchOrder): string {
  return (r.name || '').trim().split(/\s+/)[0] || '';
}

export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/* One line per item: "2 × Hoodie (M) — $60". Unknown ids are shown as their
   id so a bad row is visible rather than silently dropped. */
export function itemLines(r: MerchOrder): string[] {
  return (r.items || []).map((i) => {
    const p = PRODUCTS[i.id || ''];
    const name = p ? p.name : (i.id || 'item');
    const qty = Math.max(0, Number(i.qty) || 0);
    const line = p ? money(qty * p.price) : '?';
    return `${qty} × ${name}${i.size ? ` (${i.size})` : ''} — ${line}`;
  });
}

/* The total the database accepted; recomputed here only as a fallback. */
export function orderTotal(r: MerchOrder): number {
  if (typeof r.total === 'number') return r.total;
  return (r.items || []).reduce((s, i) => s + ((PRODUCTS[i.id || '']?.price || 0) * (Number(i.qty) || 0)), 0);
}

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f1ea;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d22;">
<div style="max-width:600px;margin:0 auto;padding:28px 18px;">
  <div style="background:#000;border-radius:14px 14px 0 0;padding:22px 26px;">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#e8b93a;font-weight:700;">Battle on Imperial</div>
    <div style="font-size:22px;font-weight:700;color:#fff;margin-top:6px;">${esc(title)}</div>
  </div>
  <div style="background:#fff;border:1px solid #e6e1d6;border-top:0;border-radius:0 0 14px 14px;padding:26px;font-size:15.5px;line-height:1.6;">
    ${bodyHtml}
  </div>
  <p style="font-size:12px;color:#76767e;margin:16px 0 0;text-align:center;">
    Canyon High School Lacrosse Booster Club · Anaheim Hills, California · <a href="${SITE}" style="color:#8a6a10;">battleonimperial.com</a>
  </p>
</div>
</body></html>`;
}

function itemsHtml(r: MerchOrder): string {
  return `<table style="border-collapse:collapse;font-size:15px;width:100%;">` +
    itemLines(r).map((l) => {
      const [left, right] = l.split(' — ');
      return `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;">${esc(left)}</td>` +
             `<td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${esc(right)}</td></tr>`;
    }).join('') +
    `<tr><td style="padding:10px 0 0;font-weight:700;">Total</td>` +
    `<td style="padding:10px 0 0;text-align:right;font-weight:700;">${esc(money(orderTotal(r)))}</td></tr></table>`;
}

/* ----------------------------------------------------------- to the buyer -- */
export function merchConfirmEmail(r: MerchOrder): Mail {
  const name = firstName(r);
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const no = val(r.order_no);
  const sum = money(orderTotal(r));
  const subject = `Order ${no} — Battle on Imperial merchandise, ${sum} by Zelle`;

  const text = [
    greeting,
    ``,
    `Thanks for your Battle on Imperial pre-order. Your order number is ${no}.`,
    ``,
    ...itemLines(r),
    `Total: ${sum}`,
    ``,
    `HOW TO PAY`,
    `Send ${sum} by Zelle to ${ZELLE_ADDRESS} (enrolled as ${PAYEE}) within`,
    `${PAY_WITHIN_DAYS} days, and put ${no} in the memo so we can match it. We will mark the`,
    `order paid; unpaid orders may be released after ${PAY_WITHIN_DAYS} days. If you would rather`,
    `pay by check, bring one payable to ${PAYEE} when you pick up.`,
    ``,
    `PICKUP`,
    `At the merchandise table at Canyon High School on ${EVENT}, under the name`,
    `${val(r.name)}. Bring this email or your order number. No shipping.`,
    ``,
    `Questions: reply to this email.`,
    `${MERCH_PAGE}`,
    ``,
    `Canyon High School Lacrosse Booster Club`
  ].join('\n');

  const html = wrapHtml(`Order ${no}`, `
    <p style="margin:0 0 14px;">${esc(greeting)}</p>
    <p style="margin:0 0 14px;">Thanks for your Battle on Imperial pre-order. Your order number is <b>${esc(no)}</b>.</p>
    ${itemsHtml(r)}
    <div style="margin:22px 0 0;padding:14px 16px;background:#fff8e6;border-left:4px solid #e8b93a;">
      <p style="margin:0 0 8px;font-weight:700;">How to pay</p>
      <p style="margin:0;">Send <b>${esc(sum)}</b> by <b>Zelle</b> to <b>${esc(ZELLE_ADDRESS)}</b>
        (enrolled as ${esc(PAYEE)}) within ${PAY_WITHIN_DAYS} days, and put <b>${esc(no)}</b> in the memo so we can
        match it. We will mark the order paid; unpaid orders may be released after ${PAY_WITHIN_DAYS} days.
        Prefer a check? Bring one payable to ${esc(PAYEE)} when you pick up.</p>
    </div>
    <p style="margin:18px 0 0;"><b>Pickup:</b> the merchandise table at Canyon High School on ${esc(EVENT)},
      under the name <b>${esc(val(r.name))}</b>. Bring this email or your order number. No shipping.</p>
    <p style="margin:18px 0 0;">Questions: reply to this email. Details are on the
      <a href="${MERCH_PAGE}" style="color:#8a6a10;">merchandise page</a>.</p>
    <p style="margin:18px 0 0;color:#76767e;">Canyon High School Lacrosse Booster Club</p>
  `);

  return { subject, text, html };
}

/* ------------------------------------------------------- to the organisers -- */
export function merchOrganiserEmail(r: MerchOrder, adminUrl: string): Mail {
  const no = val(r.order_no);
  const sum = money(orderTotal(r));
  const subject = `Merch order ${no} — ${sum} — ${val(r.name)}`;

  const text = [
    `New merchandise pre-order from the website.`,
    ``,
    `Order:    ${no}`,
    `Name:     ${val(r.name)}`,
    `Team:     ${val(r.school)}`,
    `Email:    ${val(r.email)}`,
    `Cell:     ${val(r.phone)}`,
    ``,
    ...itemLines(r),
    `Total:    ${sum}`,
    ``,
    `Notes:`,
    val(r.notes),
    ``,
    `They have been told to Zelle ${sum} with ${no} in the memo. When it lands, mark`,
    `the order Paid in Tournament Control: ${adminUrl}`
  ].join('\n');

  const html = wrapHtml(`Merch order ${no}`, `
    <p style="margin:0 0 14px;"><b>${esc(val(r.name))}</b>${r.school ? ` (${esc(r.school)})` : ''} placed a pre-order.</p>
    ${itemsHtml(r)}
    <table style="border-collapse:collapse;font-size:15px;margin-top:18px;">
      <tr><td style="padding:4px 12px 4px 0;color:#76767e;">Email</td><td style="padding:4px 0;">${esc(val(r.email))}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#76767e;">Cell</td><td style="padding:4px 0;">${esc(val(r.phone))}</td></tr>
    </table>
    <p style="margin:18px 0 6px;color:#76767e;">Notes</p>
    <p style="margin:0;white-space:pre-wrap;">${esc(val(r.notes))}</p>
    <p style="margin:22px 0 0;">They have been told to Zelle <b>${esc(sum)}</b> with <b>${esc(no)}</b> in the memo.
      When it lands, mark the order Paid in <a href="${esc(adminUrl)}" style="color:#8a6a10;">Tournament Control</a>.</p>
  `);

  return { subject, text, html };
}
