# WhatsApp Campaign Dashboard

React/Vite dashboard for sending WhatsApp Official template campaigns to contacts read live from Google Sheets.

## Architecture

- **React + Vite** — team dashboard
- **Supabase Auth** — team login
- **Supabase Postgres** — campaign/recipient history and delivery state
- **Google Sheets API** — live contact source
- **Vercel Functions** — secure backend endpoints
- **Meta WhatsApp Cloud API** — approved templates, sends, status webhooks
- **Vercel Cron** — drains scheduled/large campaign queues in batches

The WhatsApp implementation is isolated in `server/whatsapp.ts`. When the current third-party WhatsApp Official provider API documentation is available, its adapter can replace the Meta adapter without rebuilding the UI.

## Security model

The browser never receives Google service-account credentials, Supabase service-role keys, or WhatsApp access tokens. Every team API endpoint validates the Supabase access token. The send endpoint also reloads the Google Sheet and re-checks `Opt-In` and `Active` status before a number can be queued.

Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, or `WHATSAPP_ACCESS_TOKEN` in a `VITE_` variable.

## Google Sheet

Recommended headings:

```text
Name | Mobile Number | Category | WhatsApp Opt-In | Status
```

Header aliases are detected automatically. Share the Sheet with the configured Google service-account email as **Viewer**.

Accepted opt-in examples include `Yes`, `True`, `1`, `Opted In`, and `Allowed`.

## Dynamic WhatsApp variables

In the UI, body variables can use fixed text or these per-contact tokens:

```text
{{name}}
{{phone}}
{{category}}
```

Example: if template `{{1}}` is a customer name, set variable 1 to `{{name}}`.

Media-header templates (image/video/document) accept a public HTTPS media URL.

## Local setup

1. Copy `.env.example` to `.env.local` and fill the values.
2. Install dependencies:

```bash
npm install
```

3. Apply `supabase/migrations/001_whatsapp_campaigns.sql` to your Supabase project.
4. Create team users in Supabase Auth. Disable public signup if this is team-only.
5. Run locally:

```bash
npm run dev
```

For local-only UI/API development, `DISABLE_AUTH=true` can bypass server auth, but it is ignored as a production recommendation and must never be used on a production deployment.

## Vercel environment variables

Copy every relevant server variable from `.env.example` into the Vercel project. Frontend auth also needs:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The scheduled worker calls `/api/cron/send-scheduled` and requires `CRON_SECRET`.

## WhatsApp webhook

Point Meta webhook callbacks to:

```text
https://YOUR_DOMAIN/api/whatsapp/webhook
```

Use `WHATSAPP_VERIFY_TOKEN` as the verification token. The webhook updates recipient states such as Sent, Delivered, Read, and Failed.

## Main API routes

- `GET /api/contacts` — current contacts from Google Sheets
- `GET /api/whatsapp/templates` — approved templates
- `POST /api/whatsapp/send` — validate and create/send a campaign
- `GET /api/campaign-status?id=...` — recipient delivery status
- `GET /api/campaigns` — campaign history
- `GET|POST /api/whatsapp/webhook` — Meta verification/status callbacks
- `GET /api/cron/send-scheduled` — queue worker invoked by Vercel Cron

## Current scale behavior

A campaign can contain up to 1,000 selected contacts. For an immediate campaign, the API sends the first small batch during the request and leaves the remainder queued. Vercel Cron drains queued rows in later batches. This avoids trying to send hundreds of WhatsApp requests inside one serverless request.

For materially larger sending volume, move queue execution to a dedicated job/queue system rather than increasing the per-request batch size.
