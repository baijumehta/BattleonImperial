/*
 * Renders both emails from sample records and checks the things that are easy
 * to get wrong and invisible once deployed. Node runs TypeScript directly:
 *
 *     node supabase/functions/registration-email/test-templates.ts
 *     node supabase/functions/registration-email/test-templates.ts --print
 *
 * Nothing here touches Deno or the network, so it can run anywhere.
 */
import { coachEmail, organiserEmail, reviewFlags, teamSummary, type Registration } from './templates.ts';

const ADMIN = 'https://www.battleonimperial.com/admin.html';

const full: Registration = {
  school: 'Northwood High School Timberwolves',
  cif_division: 'Division 2',
  contact_first: 'Dana', contact_last: 'Reyes', role: 'Head coach',
  email: 'dana@example.com', phone: '714-555-0100',
  coach1_first: 'Dana', coach1_last: 'Reyes',
  coach1_email: 'dana@example.com', coach1_phone: '714-555-0100',
  coach2_first: 'Sam', coach2_last: 'Ortiz',
  coach2_email: 'sam@example.com', coach2_phone: '714-555-0101',
  team1_level: 'Varsity', team1_strength: 'Upper half of our division last season.',
  team2_level: 'JV', team2_strength: 'Mostly sophomores.',
  notes: 'We would prefer a later first game if possible.',
  payment_ack: true, consent: true
};

/* One team, no second coach, and the fields the short form never asked. */
const sparse: Registration = {
  school: 'Rosary Academy',
  cif_division: 'Not sure',
  contact: 'Pat Lee',
  email: 'pat@example.com',
  team1_level: 'JV',
  payment_ack: false, consent: false
};

/* A coach who types HTML into a free-text box must not break the email. */
const hostile: Registration = {
  school: '<script>alert(1)</script> & Sons HS',
  cif_division: 'Another division',
  contact_first: 'Chris', contact_last: "O'Brien", role: 'AD & parent',
  email: 'chris@example.com',
  team1_level: 'Varsity',
  team1_strength: 'We are "good" <b>sometimes</b>',
  payment_ack: true
};

let failures = 0;
function check(name: string, condition: boolean, extra = '') {
  if (condition) {
    console.log('  pass  ' + name);
  } else {
    failures++;
    console.log('  FAIL  ' + name + (extra ? '  — ' + extra : ''));
  }
}

console.log('\nteamSummary');
check('two different levels read naturally', teamSummary(full) === 'Varsity and JV', teamSummary(full));
check('one team', teamSummary(sparse) === 'JV', teamSummary(sparse));
check('no team at all falls back', teamSummary({}) === 'a team');
check('two of the same level', teamSummary({ team1_level: 'JV', team2_level: 'JV' }) === 'two JV teams');

console.log('\nreviewFlags');
check('a clean entry raises nothing', reviewFlags(full).length === 0, JSON.stringify(reviewFlags(full)));
check('"Not sure" is flagged', reviewFlags(sparse).some((f) => /not sure/i.test(f)));
check('unacknowledged deposit is flagged', reviewFlags(sparse).some((f) => /NOT acknowledged/.test(f)));
check('outside D2/D3 is flagged', reviewFlags(hostile).some((f) => /outside the D2\/D3/.test(f)));
check('missing division is flagged', reviewFlags({}).some((f) => /No CIF division/.test(f)));

console.log('\norganiser email');
{
  const clean = organiserEmail(full, ADMIN);
  const dirty = organiserEmail(sparse, ADMIN);
  check('clean subject says "New entry"', clean.subject.startsWith('New entry:'), clean.subject);
  check('flagged subject says "needs a look"', dirty.subject.startsWith('Entry needs a look:'), dirty.subject);
  check('subject names the school', clean.subject.includes('Northwood'));
  check('both coaches appear', clean.text.includes('Sam Ortiz') && clean.text.includes('Dana Reyes'));
  check('second team appears', clean.text.includes('Team 2'));
  check('one-team entry omits Team 2', !dirty.text.includes('Team 2'));
  check('admin link is present', clean.html.includes(ADMIN) && clean.text.includes(ADMIN));
  check('flag block only when flagged',
    !clean.html.includes('Needs a look') && dirty.html.includes('Needs a look'));
  check('falls back to the old single contact field', dirty.text.includes('Pat Lee'));
  // Regression: a filter that dropped every empty string once collapsed the
  // whole plain-text mail into one unreadable block.
  check('sections are separated by blank lines', /Cell: .*\n\nCoach 1:/.test(clean.text));
  check('flagged mail keeps its blank lines too', /\n\nSchool:/.test(dirty.text));
}

console.log('\ncoach email');
{
  const m = coachEmail(full);
  const s = coachEmail(sparse);
  check('greets by first name', m.text.startsWith('Hi Dana,'), m.text.slice(0, 20));
  check('greets safely with no first name', s.text.startsWith('Hi,'), s.text.slice(0, 20));
  check('subject carries the date', m.subject.includes('March 13, 2027'), m.subject);
  check('says it is not yet a place', /not yet a place in the field/.test(m.text));
  check('states the deposit and the balance',
    m.text.includes('$250') && m.text.includes('balance is due'));
  check('quotes all four prices',
    ['$850', '$750', '$650', '$550'].every((p) => m.text.includes(p) && m.html.includes(p)));
  check('names the early bird deadline', /November 30/.test(m.text));
  check('never quotes the old flat price', !m.text.includes('$1,000') && !m.html.includes('$1,000'));
  check('leaves the total to the invoice', /invoice will show the exact amount/.test(m.text));
  check('says there is nothing to pay today', /nothing to pay today/.test(m.text));
  check('echoes back what they sent', m.text.includes('Northwood'));
  check('invites a correction', /reply to this email/i.test(m.text));
}

console.log('\nescaping');
{
  const o = organiserEmail(hostile, ADMIN);
  const c = coachEmail(hostile);
  for (const [label, mail] of [['organiser', o], ['coach', c]] as const) {
    check(label + ' html has no raw <script>', !mail.html.includes('<script>'));
    check(label + ' html escaped the angle brackets', mail.html.includes('&lt;script&gt;'));
    check(label + ' html escaped the quotes in free text',
      !/We are "good"/.test(mail.html) || !mail.html.includes('<b>sometimes</b>'));
  }
  check('the apostrophe survives in the text part', o.text.includes("O'Brien"));
  check('text part is left unescaped', o.text.includes('<script>'));
}

if (process.argv.includes('--print')) {
  console.log('\n' + '='.repeat(72));
  console.log(organiserEmail(full, ADMIN).text);
  console.log('\n' + '='.repeat(72));
  console.log(coachEmail(full).text);
}

console.log(failures ? `\n${failures} failing check(s)\n` : '\nall checks pass\n');
process.exit(failures ? 1 : 0);
