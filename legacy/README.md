# Legacy RentMate (Telegram Mini App)

This directory is the **current production application**. It was moved here so the
repository can grow a SaaS monorepo around it without deleting working business
logic.

Do not rewrite these files as part of scaffolding. Migrate behavior into
`apps/`, `api/`, and `packages/` incrementally.

| Path | Role |
| --- | --- |
| `miniapp/index.html` | Telegram Mini App UI (vanilla JS) |
| `functions/api/index.ts` | Supabase Edge Function `api` — action-based JSON API |
| `functions/bot/index.ts` | Supabase Edge Function `bot` — Telegram webhook + cron payloads |
| `sql/001_multitenant.sql` | Incremental multi-tenant SQL (not a full schema dump) |

Deploy paths are unchanged until we document a new one: upload the HTML to
`APP_URL`, deploy the two Edge Functions, apply SQL manually on the existing
Supabase Postgres.

Before deploying the `api` Edge Function, sync shared domain code:

```bash
npm run prepare:edge-domain
cp -R legacy/functions/api supabase/functions/api
```

See `docs/architecture/` for how this maps to the target SaaS.
