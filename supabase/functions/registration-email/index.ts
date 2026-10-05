/*
 * Battle on Imperial — new registration notifier
 *
 * Fired by a Supabase database webhook on INSERT into public.registrations.
 * Sends two emails through SMTP2GO: an alert to the organisers and a
 * confirmation to whoever filled in the form.
 *
 * Deploy:
 *   supabase functions deploy registration-email --no-verify-jwt
 *
 * Secrets (supabase secrets set NAME=value):
 *   SMTP2GO_API_KEY     from the SMTP2GO dashboard
 *   MAIL_FROM           Battle on Imperial <noreply@battleonimperial.com>
 *   MAIL_REPLY_TO       info@battleonimperial.com
 *   MAIL_TO_ORGANISERS  comma-separated; who gets the alert
 *   WEBHOOK_SECRET      any long random string, also set on the webhook
 *   ADMIN_URL           optional, defaults to the Vercel admin page
 *
 * --no-verify-jwt is deliberate: the database webhook cannot mint a user JWT,
 * so WEBHOOK_SECRET is the gate instead. Without one of the two this endpoint
 * is an open relay for anyone who finds the URL.
 */
import { coachEmail, organiserEmail, type Registration } from './templates.ts';

const SMTP2GO_ENDPOINT = 'https://api.smtp2go.com/v3/email/send';

interface WebhookPayload {
  type?: string;
  table?: string;
  schema?: string;
  record?: Registration;
}

function env(name: string, fallback = ''): string {
  return Deno.env.get(name)?.trim() || fallback;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface SendResult {
  to: string[];
  ok: boolean;
  status: number;
  detail?: unknown;
}

async function send(
  apiKey: string,
  from: string,
  to: string[],
  replyTo: string,
  mail: { subject: string; text: string; html: string }
): Promise<SendResult> {
  const body: Record<string, unknown> = {
    sender: from,
    to,
    subject: mail.subject,
    text_body: mail.text,
    html_body: mail.html
  };
  if (replyTo) body.custom_headers = [{ header: 'Reply-To', value: replyTo }];

  const res = await fetch(SMTP2GO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // SMTP2GO accepts the key as a header or as api_key in the body. The
      // header keeps it out of anything that logs request bodies.
      'X-Smtp2go-Api-Key': apiKey,
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });

  let detail: unknown = null;
  try {
    detail = await res.json();
  } catch {
    detail = await res.text().catch(() => null);
  }

  // SMTP2GO answers 200 with data.succeeded = 0 when it accepts the request
  // but sends nothing — an unverified sender does exactly this. Treat that as
  // a failure, or a broken sending domain looks like success forever.
  const succeeded = (detail as { data?: { succeeded?: number } })?.data?.succeeded;
  const ok = res.ok && (succeeded === undefined || succeeded > 0);

  return { to, ok, status: res.status, detail };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = env('WEBHOOK_SECRET');
  if (!secret) return json({ error: 'WEBHOOK_SECRET is not set' }, 500);
  if (req.headers.get('x-boi-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const apiKey = env('SMTP2GO_API_KEY');
  const from = env('MAIL_FROM', 'Battle on Imperial <noreply@battleonimperial.com>');
  const replyTo = env('MAIL_REPLY_TO', 'info@battleonimperial.com');
  const organisers = env('MAIL_TO_ORGANISERS').split(',').map((s) => s.trim()).filter(Boolean);
  const adminUrl = env('ADMIN_URL', 'https://www.battleonimperial.com/admin.html');
  if (!apiKey) return json({ error: 'SMTP2GO_API_KEY is not set' }, 500);

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'body was not JSON' }, 400);
  }

  const record = payload.record;
  if (!record) return json({ error: 'no record in payload' }, 400);
  if (payload.type && payload.type !== 'INSERT') {
    return json({ skipped: `type ${payload.type}` });
  }

  const results: Record<string, SendResult | string> = {};

  if (organisers.length) {
    // Reply-To the coach, so answering the alert answers them.
    const coachAddress = record.email || record.coach1_email || replyTo;
    results.organisers = await send(
      apiKey, from, organisers, coachAddress, organiserEmail(record, adminUrl)
    );
  } else {
    results.organisers = 'MAIL_TO_ORGANISERS is empty — nobody was alerted';
  }

  // Confirmation goes to the person who filled the form in. Never invent an
  // address: if there is none, say so rather than mailing a coach who did not
  // give one.
  if (record.email) {
    results.coach = await send(apiKey, from, [record.email], replyTo, coachEmail(record));
  } else {
    results.coach = 'no submitter email on the record';
  }

  // Always 200. A webhook that retries on a partial failure would re-send the
  // email that already worked; the detail is in the body and in the logs.
  return json({ ok: true, school: record.school ?? null, results });
});
