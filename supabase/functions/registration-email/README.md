# Registration email

Sends two emails when a team submits the entry form: an **alert** to the
organisers and a **confirmation** to the person who filled it in.

```
form  →  public.registrations (INSERT)  →  database webhook  →  this function  →  SMTP2GO
```

Nothing here blocks the insert. If the email fails the row is still saved, so a
broken mail setup never costs you an entry — it only costs you the notification.

---

## 1. SMTP2GO

Create the account, then **add `battleonimperial.com` as a verified sender
domain** and publish the DNS records it gives you (a CNAME pair for DKIM, and a
return-path CNAME). Do this before anything else.

Until the domain verifies, SMTP2GO answers `200` with `data.succeeded: 0` — it
accepts the request and sends nothing. The function treats that as a failure
rather than a success, deliberately, because the silent version of this bug is
one you would not find until a coach told you they never heard back.

Then create an **API key** with the *send email* permission.

## 2. Secrets

Dashboard → **Project Settings → Edge Functions → Secrets**, six rows:

| Name | Value |
|---|---|
| `SMTP2GO_API_KEY` | the send key from step 1 |
| `MAIL_FROM` | `Battle on Imperial <noreply@battleonimperial.com>` |
| `MAIL_REPLY_TO` | `info@battleonimperial.com` |
| `MAIL_TO_ORGANISERS` | comma-separated; who gets the alert |
| `WEBHOOK_SECRET` | a long random string — step 4 needs the same one |
| `ADMIN_URL` | `https://www.battleonimperial.com/admin.html` |

Generate the secret locally rather than reusing one from anywhere else:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Keep that value somewhere.** Supabase stores secrets write-only: `secrets
list` and the dashboard both show a hash, never the value. Lose the webhook
secret and the only fix is to set a new one and edit the webhook to match.

`MAIL_REPLY_TO` has to be a mailbox someone reads. A coach replying to the
confirmation is the most likely way you will hear about a mistake in an entry.

With the CLI instead: `supabase secrets set NAME=value NAME2=value2`.

## 3. Deploy

Dashboard → **Edge Functions → Deploy a new function → via editor**. Name it
`registration-email` and create both files, `index.ts` and `templates.ts`, with
the contents from this directory. Turn **Verify JWT off**.

With the CLI instead:

```bash
supabase functions deploy registration-email --no-verify-jwt
```

Verify-JWT-off is deliberate. A database webhook cannot mint a user JWT, so
`WEBHOOK_SECRET` is the gate instead. **Without the secret set, the function
refuses every request** rather than running unauthenticated — an open endpoint
that sends email on demand is a spam relay.

> On a machine where ThreatLocker or similar blocks the CLI binary, the
> dashboard route above does every step. Do not allowlist the npx copy of the
> CLI: it lives under a hashed npm cache path that changes on upgrade, so the
> rule goes stale and you are left with a permanent exception that no longer
> matches anything.

## 4. The webhook

Dashboard → **Database → Webhooks → Create a new hook**:

| Field | Value |
|---|---|
| Name | `registration-email` |
| Table | `public.registrations` |
| Events | **Insert** only |
| Type | HTTP Request |
| Method | `POST` |
| URL | `https://<project-ref>.supabase.co/functions/v1/registration-email` |
| HTTP header | `x-boi-secret` : the `WEBHOOK_SECRET` from step 2 |

Insert only. On `UPDATE` the function returns `skipped`, but there is no reason
to fire it every time someone moves a team from New to Contacted.

## 5. Check it

Submit the form on the site with a real address you can read. Both emails
should arrive within a few seconds.

If they do not, **Edge Functions → registration-email → Logs** holds the full
SMTP2GO response. The usual answers:

| What you see | What it means |
|---|---|
| `403 forbidden` | header name or secret does not match step 2 |
| `500 SMTP2GO_API_KEY is not set` | secrets were not set, or not since the last deploy |
| `succeeded: 0` with no error | sending domain is not verified yet — step 1 |
| nothing in the logs at all | the webhook is not firing; check it is on INSERT |

---

## Changing the wording

The email bodies are in `templates.ts`, kept free of Deno APIs so they run
under plain Node. After any edit:

```bash
node supabase/functions/registration-email/test-templates.ts
node supabase/functions/registration-email/test-templates.ts --print
```

The checks cover the things that are invisible once deployed — that a coach
with no first name is not greeted "Hi ," that an entry outside D2/D3 is flagged
in the subject line, that free text typed by a coach cannot inject HTML, and
that the plain-text part keeps its blank lines.

`--print` renders both emails so you can read them before anyone else does.
