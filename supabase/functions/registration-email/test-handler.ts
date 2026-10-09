/*
 * Exercises the real request handler from index.ts without Deno and without
 * the network: the Deno global is stubbed to supply secrets and to capture
 * the handler, and fetch is stubbed to stand in for SMTP2GO.
 *
 *     node supabase/functions/registration-email/test-handler.ts
 *
 * This is the half that templates cannot cover — auth, payload handling, and
 * what counts as a failed send.
 */
const SECRETS: Record<string, string> = {
  WEBHOOK_SECRET: 'test-secret',
  SMTP2GO_API_KEY: 'api-test',
  MAIL_FROM: 'Battle on Imperial <noreply@battleonimperial.com>',
  MAIL_REPLY_TO: 'info@battleonimperial.com',
  MAIL_TO_ORGANISERS: 'lydie@example.com, mike@example.com',
  ADMIN_URL: 'https://www.battleonimperial.com/admin.html'
};

let handler: (req: Request) => Promise<Response>;
(globalThis as Record<string, unknown>).Deno = {
  env: { get: (k: string) => SECRETS[k] },
  serve: (h: (req: Request) => Promise<Response>) => { handler = h; }
};

let sent: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
let smtpReply: { status: number; body: unknown } = { status: 200, body: { data: { succeeded: 1, failed: 0 } } };

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, opts: RequestInit = {}) => {
  if (!String(url).includes('smtp2go')) return realFetch(url as string, opts);
  sent.push({
    body: JSON.parse(String(opts.body)),
    headers: opts.headers as Record<string, string>
  });
  return new Response(JSON.stringify(smtpReply.body), {
    status: smtpReply.status,
    headers: { 'content-type': 'application/json' }
  });
}) as typeof fetch;

await import('./index.ts');

const RECORD = {
  school: 'Northwood High School Timberwolves',
  cif_division: 'Division 2',
  contact_first: 'Dana', contact_last: 'Reyes', role: 'Head coach',
  email: 'dana@example.com', phone: '714-555-0100',
  coach1_first: 'Dana', coach1_last: 'Reyes', coach1_email: 'dana@example.com',
  team1_level: 'Varsity', team2_level: 'JV',
  payment_ack: true, consent: true
};

function post(body: unknown, secret: string | null = 'test-secret', method = 'POST'): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) headers['x-boi-secret'] = secret;
  return handler(new Request('https://example.test/', {
    method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined
  }));
}

let failures = 0;
function check(name: string, ok: boolean, extra = '') {
  if (ok) console.log('  pass  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (extra ? '  — ' + extra : '')); }
}

console.log('\nauth');
check('GET is refused', (await post(null, 'test-secret', 'GET')).status === 405);
check('no secret header is refused', (await post({ record: RECORD }, null)).status === 403);
check('wrong secret is refused', (await post({ record: RECORD }, 'nope')).status === 403);
sent = [];
check('nothing was sent while refusing', sent.length === 0);

console.log('\npayload');
check('non-JSON body is a 400', (await handler(new Request('https://example.test/', {
  method: 'POST', headers: { 'x-boi-secret': 'test-secret' }, body: 'not json'
}))).status === 400);
check('no record is a 400', (await post({ type: 'INSERT' })).status === 400);
{
  sent = [];
  const res = await post({ type: 'UPDATE', record: RECORD });
  const body = await res.json();
  check('UPDATE is skipped, not mailed', body.skipped !== undefined && sent.length === 0);
}

console.log('\nhappy path');
{
  sent = [];
  const res = await post({ type: 'INSERT', record: RECORD });
  const body = await res.json();
  check('responds 200', res.status === 200);
  check('sends exactly two emails', sent.length === 2, String(sent.length));
  check('organiser mail goes to both addresses',
    JSON.stringify(sent[0].body.to) === JSON.stringify(['lydie@example.com', 'mike@example.com']),
    JSON.stringify(sent[0].body.to));
  check('coach mail goes to the submitter',
    JSON.stringify(sent[1].body.to) === JSON.stringify(['dana@example.com']));
  check('api key travels as a header, not in the body',
    sent[0].headers['X-Smtp2go-Api-Key'] === 'api-test' && !('api_key' in sent[0].body));
  check('sender is the configured from address', sent[0].body.sender === SECRETS.MAIL_FROM);
  check('organiser reply-to is the coach',
    JSON.stringify(sent[0].body.custom_headers) ===
      JSON.stringify([{ header: 'Reply-To', value: 'dana@example.com' }]));
  check('coach reply-to is the tournament',
    JSON.stringify(sent[1].body.custom_headers) ===
      JSON.stringify([{ header: 'Reply-To', value: 'info@battleonimperial.com' }]));
  check('both parts are present on both mails',
    sent.every((s) => typeof s.body.text_body === 'string' && typeof s.body.html_body === 'string'));
  check('both reported ok', body.results.organisers.ok && body.results.coach.ok);
}

console.log('\nno submitter email');
{
  sent = [];
  const { email, ...noEmail } = RECORD;
  const body = await (await post({ type: 'INSERT', record: noEmail })).json();
  check('organisers are still alerted', sent.length === 1);
  check('no coach mail is invented', typeof body.results.coach === 'string', JSON.stringify(body.results.coach));
}

console.log('\nsmtp2go failures');
{
  // The one that matters: 200 OK, zero sent. An unverified sending domain
  // does exactly this, and calling it success hides the problem for weeks.
  smtpReply = { status: 200, body: { data: { succeeded: 0, failed: 1, failures: ['sender not verified'] } } };
  const body = await (await post({ type: 'INSERT', record: RECORD })).json();
  check('succeeded:0 is reported as a failure', body.results.organisers.ok === false);
  check('the SMTP2GO detail is kept for the logs',
    JSON.stringify(body.results.organisers.detail).includes('sender not verified'));

  smtpReply = { status: 401, body: { error: 'bad api key' } };
  const body2 = await (await post({ type: 'INSERT', record: RECORD })).json();
  check('an HTTP error is reported as a failure', body2.results.organisers.ok === false);
  check('still answers 200 so the webhook does not retry and double-send',
    (await post({ type: 'INSERT', record: RECORD })).status === 200);

  smtpReply = { status: 200, body: { data: { succeeded: 1 } } };
}

console.log('\nsponsor inquiries');
{
  sent = [];
  const inquiry = {
    business: 'Anaheim Hills Orthodontics', contact_name: 'Priya Natarajan',
    email: 'priya@example.com', tier: 'Field Partner', consent: true
  };
  const res = await post({ type: 'INSERT', table: 'sponsor_inquiries', record: inquiry });
  const body = await res.json();
  check('responds 200', res.status === 200);
  check('sends exactly two emails', sent.length === 2, String(sent.length));
  check('organiser alert is the sponsor one',
    String(sent[0].body.subject).startsWith('Sponsor inquiry: Anaheim Hills Orthodontics'), String(sent[0].body.subject));
  check('organiser reply-to is the business',
    JSON.stringify(sent[0].body.custom_headers) ===
      JSON.stringify([{ header: 'Reply-To', value: 'priya@example.com' }]));
  check('confirmation goes to the business',
    JSON.stringify(sent[1].body.to) === JSON.stringify(['priya@example.com']));
  check('response names the business, not a school', body.business === 'Anaheim Hills Orthodontics' && !('school' in body));

  sent = [];
  const { email, ...noEmail } = inquiry;
  const body2 = await (await post({ type: 'INSERT', table: 'sponsor_inquiries', record: noEmail })).json();
  check('without an email only the organisers are mailed', sent.length === 1 && typeof body2.results.business === 'string');

  sent = [];
  await post({ type: 'INSERT', table: 'registrations', record: RECORD });
  check('a registration still takes the registration path',
    sent.length === 2 && !String(sent[0].body.subject).startsWith('Sponsor inquiry'));
}

console.log(failures ? `\n${failures} failing check(s)\n` : '\nall checks pass\n');
process.exit(failures ? 1 : 0);
