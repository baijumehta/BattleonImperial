/*
 * Email bodies for a new registration.
 *
 * Deliberately free of Deno APIs and of any import, so this file runs under
 * plain `node templates.ts` as well as in the edge function. The wording is
 * the part most likely to be wrong and the part hardest to check once it is
 * deployed, so it stays testable — see test-templates.ts next door.
 */

export interface Registration {
  id?: string;
  created_at?: string;
  school?: string | null;
  cif_division?: string | null;
  contact?: string | null;
  contact_first?: string | null;
  contact_last?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  coach1_first?: string | null;
  coach1_last?: string | null;
  coach1_email?: string | null;
  coach1_phone?: string | null;
  coach2_first?: string | null;
  coach2_last?: string | null;
  coach2_email?: string | null;
  coach2_phone?: string | null;
  team1_level?: string | null;
  team1_strength?: string | null;
  team2_level?: string | null;
  team2_strength?: string | null;
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
export const EVENT = 'Saturday, March 13, 2027';
export const VENUE = 'Canyon High School, 220 S Imperial Hwy, Anaheim, CA 92807';

/* A coach's own words end up inside the HTML part. Escape everything. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function val(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : v;
  return s === null || s === undefined || s === '' ? '—' : String(s);
}

function fullName(first?: string | null, last?: string | null, fallback?: string | null): string {
  const n = [first, last].filter(Boolean).join(' ').trim();
  return n || (fallback || '').trim();
}

/* "Varsity and JV", "Varsity", "a team" — used in subject lines and openers. */
export function teamSummary(r: Registration): string {
  const a = r.team1_level?.trim();
  const b = r.team2_level?.trim();
  if (a && b) return a === b ? `two ${a} teams` : `${a} and ${b}`;
  return a || 'a team';
}

/* Anything a person has to look at before this team is offered a place. */
export function reviewFlags(r: Registration): string[] {
  const flags: string[] = [];
  const div = r.cif_division?.trim();
  if (!div) flags.push('No CIF division given.');
  else if (div === 'Another division') flags.push(`CIF division is "${div}" — outside the D2/D3 field.`);
  else if (div === 'Not sure') flags.push('Coach is not sure of their CIF division — needs checking.');
  if (r.payment_ack === false) flags.push('Deposit terms were NOT acknowledged.');
  if (!r.coach1_email && !r.email) flags.push('No email address to reply to.');
  return flags;
}

function rows(pairs: [string, string][]): { text: string; html: string } {
  return {
    text: pairs.map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: pairs.map(([k, v]) =>
      `<tr><td style="padding:4px 14px 4px 0;color:#76767e;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
      `<td style="padding:4px 0;color:#121214;font-size:14px">${esc(v)}</td></tr>`).join('')
  };
}

function shell(heading: string, lead: string, blocks: string): string {
  return `<div style="margin:0;padding:24px 16px;background:#f8f6f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e4dc;border-radius:14px;overflow:hidden">
    <div style="background:#000000;padding:18px 24px">
      <div style="color:#e8b93a;font-size:17px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Battle on Imperial</div>
      <div style="color:#9c968a;font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin-top:3px">Girls Lacrosse Showcase &middot; Anaheim Hills, CA</div>
    </div>
    <div style="padding:24px">
      <h1 style="margin:0 0 10px;font-size:19px;color:#121214">${esc(heading)}</h1>
      <p style="margin:0 0 18px;font-size:14.5px;line-height:1.6;color:#44444c">${lead}</p>
      ${blocks}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #e7e4dc;background:#f8f6f1;color:#76767e;font-size:12px;line-height:1.6">
      Hosted by the Canyon High School Lacrosse Booster Club &middot; <a href="${SITE}" style="color:#8a6a10">battleonimperial.com</a>
    </div>
  </div>
</div>`;
}

function table(title: string, pairs: [string, string][]): string {
  const r = rows(pairs);
  return `<div style="margin:0 0 18px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#76767e;margin-bottom:8px">${esc(title)}</div>
    <table style="border-collapse:collapse;width:100%">${r.html}</table>
  </div>`;
}

/* ------------------------------------------------------------- organisers -- */

export function organiserEmail(r: Registration, adminUrl: string): Mail {
  const school = val(r.school);
  const flags = reviewFlags(r);
  const submitter = fullName(r.contact_first, r.contact_last, r.contact) || '—';
  const coach1 = fullName(r.coach1_first, r.coach1_last) || '—';
  const coach2 = fullName(r.coach2_first, r.coach2_last);

  const who: [string, string][] = [
    ['School', school],
    ['CIF division', val(r.cif_division)],
    ['Submitted by', `${submitter} (${val(r.role)})`],
    ['Email', val(r.email)],
    ['Cell', val(r.phone)]
  ];
  const coaches: [string, string][] = [
    ['Coach 1', `${coach1} · ${val(r.coach1_email)} · ${val(r.coach1_phone)}`]
  ];
  if (coach2) coaches.push(['Coach 2', `${coach2} · ${val(r.coach2_email)} · ${val(r.coach2_phone)}`]);

  const teams: [string, string][] = [
    ['Team 1', val(r.team1_level)],
    ['Team 1 notes', val(r.team1_strength)]
  ];
  if (r.team2_level) {
    teams.push(['Team 2', val(r.team2_level)]);
    teams.push(['Team 2 notes', val(r.team2_strength)]);
  }

  const entry: [string, string][] = [
    ['Deposit terms', r.payment_ack ? 'Acknowledged' : 'NOT acknowledged'],
    ['Updates opt-in', r.consent ? 'Yes' : 'No'],
    ['Notes', val(r.notes)]
  ];

  const subject = flags.length
    ? `Entry needs a look: ${school} (${teamSummary(r)})`
    : `New entry: ${school} (${teamSummary(r)})`;

  // null drops the line; '' is a deliberate blank one. Filtering on falsiness
  // here would collapse the whole mail into an unreadable block.
  const text = [
    `${school} has requested a spot — ${teamSummary(r)}.`,
    '',
    flags.length ? 'NEEDS A LOOK:\n' + flags.map((f) => `  • ${f}`).join('\n') : null,
    flags.length ? '' : null,
    rows(who).text, '',
    rows(coaches).text, '',
    rows(teams).text, '',
    rows(entry).text, '',
    `Open Tournament Control: ${adminUrl}`,
    '',
    'Reply to this email to answer the coach directly.'
  ].filter((l): l is string => l !== null).join('\n');

  const flagBlock = flags.length
    ? `<div style="margin:0 0 18px;padding:12px 14px;border-radius:10px;background:#fdf3f4;border:1px solid #f0d3d7">
         <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8d1d31;margin-bottom:6px">Needs a look</div>
         <ul style="margin:0;padding-left:18px;color:#8d1d31;font-size:13.5px;line-height:1.6">${flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
       </div>`
    : '';

  const html = shell(
    `${esc(school)} wants in`,
    `A new entry request just came in for <b>${esc(teamSummary(r))}</b>. Reply to this email to answer the coach directly.`,
    flagBlock +
      table('Program', who) +
      table('Coaches', coaches) +
      table('Teams', teams) +
      table('Entry', entry) +
      `<a href="${esc(adminUrl)}" style="display:inline-block;margin-top:4px;padding:12px 22px;border-radius:9px;background:#e8b93a;color:#0b0b0d;font-weight:700;text-decoration:none;font-size:14px">Open Tournament Control</a>`
  );

  return { subject, text, html };
}

/* ------------------------------------------------------------- the coach -- */

export function coachEmail(r: Registration): Mail {
  const school = val(r.school);
  const first = (r.contact_first || '').trim();
  const greeting = first ? `Hi ${first},` : 'Hi,';

  const summary: [string, string][] = [
    ['School', school],
    ['CIF division', val(r.cif_division)],
    ['Team 1', val(r.team1_level)]
  ];
  if (r.team2_level) summary.push(['Team 2', val(r.team2_level)]);
  summary.push(['Contact', val(r.email)]);
  if (r.phone) summary.push(['Cell', val(r.phone)]);

  const subject = `We have your request — Battle on Imperial, ${EVENT}`;

  const text = [
    greeting,
    '',
    `Thank you — we have your request to bring ${teamSummary(r)} to Battle on Imperial on ${EVENT} at ${VENUE}.`,
    '',
    'This is a confirmation that the form reached us. It is not yet a place in the field.',
    '',
    'WHAT HAPPENS NEXT',
    '  1. A coordinator reviews your request. Spots are offered in the order requests arrive.',
    '  2. If we can fit you in, you get the entry packet and an invoice for the $250 deposit.',
    '  3. The deposit holds your place. The balance of the $1,000 entry is due 30 days before the tournament.',
    '',
    'There is nothing to pay today and nothing to post.',
    '',
    'WHAT YOU SENT US',
    rows(summary).text,
    '',
    'If any of that is wrong, just reply to this email and we will fix it.',
    '',
    `More detail, including the format and refund terms: ${SITE}`,
    '',
    '— Battle on Imperial',
    'Hosted by the Canyon High School Lacrosse Booster Club'
  ].join('\n');

  const html = shell(
    'We have your request',
    `${esc(greeting)} thank you — we have your request to bring <b>${esc(teamSummary(r))}</b> to Battle on Imperial on <b>${esc(EVENT)}</b> at ${esc(VENUE)}.<br><br>
     This confirms the form reached us. It is not yet a place in the field.`,
    `<div style="margin:0 0 18px;padding:14px 16px;border-radius:10px;background:#f8f6f1;border:1px solid #e7e4dc">
       <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#76767e;margin-bottom:8px">What happens next</div>
       <ol style="margin:0;padding-left:18px;color:#44444c;font-size:14px;line-height:1.7">
         <li>A coordinator reviews your request. Spots are offered in the order requests arrive.</li>
         <li>If we can fit you in, you get the entry packet and an invoice for the <b>$250 deposit</b>.</li>
         <li>The deposit holds your place. The balance of the <b>$1,000</b> entry is due 30 days before the tournament.</li>
       </ol>
       <p style="margin:12px 0 0;font-size:13.5px;color:#76767e">There is nothing to pay today and nothing to post.</p>
     </div>` +
      table('What you sent us', summary) +
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#44444c">If any of that is wrong, just reply to this email and we will fix it.</p>`
  );

  return { subject, text, html };
}
