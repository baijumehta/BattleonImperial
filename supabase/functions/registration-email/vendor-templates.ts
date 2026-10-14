/*
 * Email bodies for a new vendor registration.
 *
 * Like the other templates: no Deno APIs and no imports, so it runs under
 * plain `node vendor-templates.ts` — see test-vendor-templates.ts.
 */

export interface VendorRegistration {
  id?: string;
  created_at?: string;
  business?: string | null;
  category?: string | null;
  products?: string | null;
  website?: string | null;
  booth_type?: string | null;
  booths?: number | null;
  permits_ack?: boolean | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  payment_ack?: boolean | null;
  consent?: boolean | null;
}

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

export const SITE = 'https://www.battleonimperial.com';
export const VENDOR_PAGE = SITE + '/vendors.html';
export const EVENT = 'Saturday, March 13, 2027';

/* EDIT: also on vendors.html. */
export const CONTACT_NAME = 'Lydie Gutfeld';
export const CONTACT_ROLE = 'Event Organizer';
export const CONTACT_PHONE = '714-747-4770';

/* EDIT: booth prices, as on vendors.html. */
export const BOOTH_PRICE: Record<string, number> = { Merchant: 200, Food: 300 };

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function val(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : v;
  return s === null || s === undefined || s === '' ? '—' : String(s);
}

function firstName(r: VendorRegistration): string {
  return (r.contact_name || '').trim().split(/\s+/)[0] || '';
}

function money(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

/* "one Merchant booth ($200)", "two Food booths ($600)". The total is simple
   multiplication of a published price, so unlike team entries it is safe to
   state; the invoice is still what counts. */
export function boothSummary(r: VendorRegistration): string {
  const type = (r.booth_type || '').trim();
  const n = Math.max(1, Math.min(3, Number(r.booths) || 1));
  const words = ['one', 'two', 'three'];
  const price = BOOTH_PRICE[type];
  const plural = n === 1 ? 'booth' : 'booths';
  if (!type) return `${words[n - 1]} ${plural}`;
  const label = type === 'Food' ? 'food vendor' : 'merchant';
  return price ? `${words[n - 1]} ${label} ${plural} (${money(price * n)})` : `${words[n - 1]} ${label} ${plural}`;
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

function rows(pairs: [string, unknown][]): string {
  return pairs.map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#76767e;white-space:nowrap;vertical-align:top;">${esc(k)}</td>` +
    `<td style="padding:6px 0;vertical-align:top;">${esc(val(v))}</td></tr>`).join('');
}

/* Things the organiser should look at before confirming. */
export function vendorFlags(r: VendorRegistration): string[] {
  const flags: string[] = [];
  if (r.booth_type === 'Food' && !r.permits_ack) flags.push('food vendor did NOT confirm licence and health permits');
  if (r.payment_ack === false) flags.push('booth fee terms not acknowledged');
  if (r.consent === false) flags.push('did not tick OK to contact');
  return flags;
}

/* ------------------------------------------------------- to the organisers -- */
export function vendorOrganiserEmail(r: VendorRegistration, adminUrl: string): Mail {
  const business = val(r.business);
  const flags = vendorFlags(r);
  const subject = `Vendor booth request: ${business} — ${boothSummary(r)}` + (flags.length ? ' [check]' : '');

  const text = [
    `New vendor booth request from the website.`,
    ``,
    `Business:   ${business}`,
    `Category:   ${val(r.category)}`,
    `Booth:      ${boothSummary(r)}`,
    `Will bring: ${val(r.products)}`,
    `Website:    ${val(r.website)}`,
    ``,
    `Contact:    ${val(r.contact_name)}`,
    `Email:      ${val(r.email)}`,
    `Cell:       ${val(r.phone)}`,
    ``,
    `Licence and permits: ${r.booth_type === 'Food' ? (r.permits_ack ? 'confirmed' : 'NOT confirmed') : 'n/a (merchant)'}`,
    `Fee terms acknowledged: ${r.payment_ack ? 'yes' : 'NO'}`,
    ``,
    ...(flags.length ? [`Check before confirming: ${flags.join('; ')}`, ``] : []),
    `Notes:`,
    val(r.notes),
    ``,
    `Reply to this email to answer them directly.`,
    `Work the list: ${adminUrl}`
  ].join('\n');

  const html = wrapHtml('New vendor booth request', `
    <p style="margin:0 0 14px;"><b>${esc(business)}</b> asked for ${esc(boothSummary(r))}.</p>
    ${flags.length ? `<p style="margin:0 0 14px;padding:10px 12px;background:#fff3e0;border-left:4px solid #e8b93a;"><b>Check before confirming:</b> ${esc(flags.join('; '))}.</p>` : ''}
    <table style="border-collapse:collapse;font-size:15px;">${rows([
      ['Category', r.category],
      ['Will bring', r.products],
      ['Website', r.website],
      ['Contact', r.contact_name],
      ['Email', r.email],
      ['Cell', r.phone],
      ['Licence and permits', r.booth_type === 'Food' ? (r.permits_ack ? 'Confirmed' : 'NOT confirmed') : 'n/a (merchant)'],
      ['Fee terms', r.payment_ack ? 'Acknowledged' : 'NOT acknowledged']
    ])}</table>
    <p style="margin:18px 0 6px;color:#76767e;">Notes</p>
    <p style="margin:0;white-space:pre-wrap;">${esc(val(r.notes))}</p>
    <p style="margin:22px 0 0;">Reply to this email to answer them directly, or
      <a href="${esc(adminUrl)}" style="color:#8a6a10;">open Tournament Control</a> to work the list.</p>
  `);

  return { subject, text, html };
}

/* ---------------------------------------------------------- to the vendor -- */
export function vendorConfirmEmail(r: VendorRegistration): Mail {
  const name = firstName(r);
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const business = val(r.business);
  const subject = `Your booth request for Battle on Imperial`;
  const food = r.booth_type === 'Food';

  const text = [
    greeting,
    ``,
    `Thanks for asking about a vendor booth at Battle on Imperial — the girls high school`,
    `lacrosse tournament at Canyon High School in Anaheim Hills on ${EVENT}.`,
    ``,
    `We have your request for ${business}: ${boothSummary(r)}. Booths are confirmed in the`,
    `order requests come in. ${CONTACT_NAME} will confirm your space and send the invoice;`,
    `your booth is held once it is paid. Load-in time, your booth location and what to`,
    `bring come with the confirmation.`,
    ...(food ? [``, `As a food vendor, please have your business licence and Orange County Health`,
                   `Department permits with you on the day.`] : []),
    ``,
    `Questions in the meantime: reply to this email, or call ${CONTACT_NAME} on ${CONTACT_PHONE}.`,
    `Vendor details: ${VENDOR_PAGE}`,
    ``,
    `Thank you for supporting girls lacrosse in Orange County.`,
    ``,
    `${CONTACT_NAME}`,
    `${CONTACT_ROLE}, Battle on Imperial`,
    `Canyon High School Lacrosse Booster Club`
  ].join('\n');

  const html = wrapHtml('Your booth request', `
    <p style="margin:0 0 14px;">${esc(greeting)}</p>
    <p style="margin:0 0 14px;">Thanks for asking about a vendor booth at <b>Battle on Imperial</b> — the girls
      high school lacrosse tournament at Canyon High School in Anaheim Hills on <b>${esc(EVENT)}</b>.</p>
    <p style="margin:0 0 14px;">We have your request for <b>${esc(business)}</b>: ${esc(boothSummary(r))}.
      Booths are confirmed in the order requests come in. ${esc(CONTACT_NAME)} will confirm your space and
      send the invoice; your booth is held once it is paid. Load-in time, your booth location and what
      to bring come with the confirmation.</p>
    ${food ? `<p style="margin:0 0 14px;">As a food vendor, please have your <b>business licence</b> and
      <b>Orange County Health Department permits</b> with you on the day.</p>` : ''}
    <p style="margin:0 0 14px;">Questions in the meantime: reply to this email, or call ${esc(CONTACT_NAME)} on
      <a href="tel:${esc(CONTACT_PHONE.replace(/-/g, ''))}" style="color:#8a6a10;">${esc(CONTACT_PHONE)}</a>.
      Vendor details are on the <a href="${VENDOR_PAGE}" style="color:#8a6a10;">vendor page</a>.</p>
    <p style="margin:0 0 18px;">Thank you for supporting girls lacrosse in Orange County.</p>
    <p style="margin:0;"><b>${esc(CONTACT_NAME)}</b><br>
      ${esc(CONTACT_ROLE)}, Battle on Imperial<br>
      <span style="color:#76767e;">Canyon High School Lacrosse Booster Club</span></p>
  `);

  return { subject, text, html };
}
