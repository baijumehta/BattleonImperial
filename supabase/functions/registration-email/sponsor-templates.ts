/*
 * Email bodies for a new sponsor inquiry.
 *
 * Like templates.ts: no Deno APIs and no imports, so it runs under plain
 * `node sponsor-templates.ts` and the wording can be checked before it is
 * deployed — see test-sponsor-templates.ts.
 */

export interface SponsorInquiry {
  id?: string;
  created_at?: string;
  business?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  tier?: string | null;
  message?: string | null;
  consent?: boolean | null;
}

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

export const SITE = 'https://www.battleonimperial.com';
export const SPONSOR_PAGE = SITE + '/sponsors.html';
export const EVENT = 'Saturday, March 13, 2027';

/* EDIT: who answers sponsor inquiries. Also on sponsors.html. */
export const SPONSOR_CONTACT_NAME = 'Lydie Gutfeld';
export const SPONSOR_CONTACT_ROLE = 'Event Organizer';
export const SPONSOR_CONTACT_PHONE = '714-747-4770';

/* EDIT: the packages, as on sponsors.html and in supabase/sponsors.sql. */
export const PACKAGES: Record<string, string> = {
  'Presenting Partner': '$2,500',
  'Field Partner': '$1,250',
  'Player Experience Partner': '$1,000',
  'Athletic Trainer Partner': '$750',
  'Coaches Zone Partner': '$500',
  'Game Sponsor': '$250'
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

function firstName(r: SponsorInquiry): string {
  return (r.contact_name || '').trim().split(/\s+/)[0] || '';
}

/* "Field Partner ($1,250)", "not sure yet", "in-kind or something else". */
export function tierLabel(r: SponsorInquiry): string {
  const t = (r.tier || '').trim();
  if (!t) return 'package not chosen';
  const price = PACKAGES[t];
  return price ? `${t} (${price})` : t.charAt(0).toLowerCase() + t.slice(1);
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

/* ------------------------------------------------------- to the organisers -- */
export function sponsorOrganiserEmail(r: SponsorInquiry, adminUrl: string): Mail {
  const business = val(r.business);
  const subject = `Sponsor inquiry: ${business} — ${tierLabel(r)}`;

  const text = [
    `New sponsor inquiry from the website.`,
    ``,
    `Business:  ${business}`,
    `Package:   ${tierLabel(r)}`,
    `Contact:   ${val(r.contact_name)}`,
    `Email:     ${val(r.email)}`,
    `Phone:     ${val(r.phone)}`,
    `Website:   ${val(r.website)}`,
    `OK to contact: ${r.consent ? 'yes' : 'NO — they did not tick the box'}`,
    ``,
    `Message:`,
    val(r.message),
    ``,
    `Reply to this email to answer them directly.`,
    `Work the list: ${adminUrl}`
  ].join('\n');

  const html = wrapHtml('New sponsor inquiry', `
    <p style="margin:0 0 14px;"><b>${esc(business)}</b> asked about sponsoring the tournament.</p>
    <table style="border-collapse:collapse;font-size:15px;">${rows([
      ['Package', tierLabel(r)],
      ['Contact', r.contact_name],
      ['Email', r.email],
      ['Phone', r.phone],
      ['Website', r.website],
      ['OK to contact', r.consent ? 'Yes' : 'No — they did not tick the box']
    ])}</table>
    <p style="margin:18px 0 6px;color:#76767e;">Message</p>
    <p style="margin:0;white-space:pre-wrap;">${esc(val(r.message))}</p>
    <p style="margin:22px 0 0;">Reply to this email to answer them directly, or
      <a href="${esc(adminUrl)}" style="color:#8a6a10;">open Tournament Control</a> to work the list.</p>
  `);

  return { subject, text, html };
}

/* ------------------------------------------------------- to the business -- */
export function sponsorConfirmEmail(r: SponsorInquiry): Mail {
  const name = firstName(r);
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const business = val(r.business);
  const subject = `Thanks for your interest in sponsoring Battle on Imperial`;

  const text = [
    greeting,
    ``,
    `Thank you for asking about sponsoring Battle on Imperial — the girls high school`,
    `lacrosse tournament at Canyon High School in Anaheim Hills on ${EVENT}.`,
    ``,
    `We have your inquiry for ${business} (${tierLabel(r)}). ${SPONSOR_CONTACT_NAME},`,
    `our ${SPONSOR_CONTACT_ROLE.toLowerCase()}, will be in touch within a few days to talk through`,
    `the package and how to make it fit your business. Every package can be adjusted,`,
    `and in-kind support is welcome too.`,
    ``,
    `The packages are at ${SPONSOR_PAGE}`,
    `Questions in the meantime: reply to this email, or call ${SPONSOR_CONTACT_NAME} on ${SPONSOR_CONTACT_PHONE}.`,
    ``,
    `Thank you for supporting girls lacrosse in Orange County.`,
    ``,
    `${SPONSOR_CONTACT_NAME}`,
    `${SPONSOR_CONTACT_ROLE}, Battle on Imperial`,
    `Canyon High School Lacrosse Booster Club`
  ].join('\n');

  const html = wrapHtml('Thanks for your interest', `
    <p style="margin:0 0 14px;">${esc(greeting)}</p>
    <p style="margin:0 0 14px;">Thank you for asking about sponsoring <b>Battle on Imperial</b> — the girls
      high school lacrosse tournament at Canyon High School in Anaheim Hills on <b>${esc(EVENT)}</b>.</p>
    <p style="margin:0 0 14px;">We have your inquiry for <b>${esc(business)}</b> (${esc(tierLabel(r))}).
      ${esc(SPONSOR_CONTACT_NAME)}, our ${esc(SPONSOR_CONTACT_ROLE.toLowerCase())}, will be in touch within a few
      days to talk through the package and how to make it fit your business. Every package can be
      adjusted, and in-kind support is welcome too.</p>
    <p style="margin:0 0 14px;">The packages are on the
      <a href="${SPONSOR_PAGE}" style="color:#8a6a10;">sponsorship page</a>. Questions in the meantime:
      reply to this email, or call ${esc(SPONSOR_CONTACT_NAME)} on
      <a href="tel:${esc(SPONSOR_CONTACT_PHONE.replace(/-/g, ''))}" style="color:#8a6a10;">${esc(SPONSOR_CONTACT_PHONE)}</a>.</p>
    <p style="margin:0 0 18px;">Thank you for supporting girls lacrosse in Orange County.</p>
    <p style="margin:0;"><b>${esc(SPONSOR_CONTACT_NAME)}</b><br>
      ${esc(SPONSOR_CONTACT_ROLE)}, Battle on Imperial<br>
      <span style="color:#76767e;">Canyon High School Lacrosse Booster Club</span></p>
  `);

  return { subject, text, html };
}
