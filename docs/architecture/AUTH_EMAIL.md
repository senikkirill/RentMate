# Email / password auth (Mate OS web)

Legacy Mini App keeps **Telegram initData**. Web owners use **Supabase Auth** (email + password).

## Database

Migration: `packages/database/migrations/003_auth_email_identity.sql`

- Adds `users.auth_user_id` → `auth.users.id`
- Adds `users.email` (unique when set)
- Does **not** drop `users.tg_id` or change Telegram flows

Apply manually on Supabase SQL editor or CLI after staging verification.

## Supabase Dashboard (once per project)

1. **Authentication → Providers → Email** — enable.
2. **Authentication → Settings** — set site URL to web origin (e.g. `http://localhost:3000`, later production URL).
3. Redirect URLs: add `http://localhost:3000/**` and production web URL.
4. For closed signup: disable “Allow new users to sign up” when invite-only flow exists (later).

## Environment (local web)

Copy from `.env.example` to `apps/web/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Never put service role key in the web app.

## Identity model (v1)

| Channel | Identity | Notes |
| --- | --- | --- |
| Telegram Mini App | `users.tg_id` | unchanged |
| Web owner | `auth.users` + row in `users` with `auth_user_id` / `email` | link step after first login |
| Staff (later) | email issued by owner or Telegram | product decision |

Linking Telegram ↔ email (same person) is a **later migration**; do not duplicate `users` rows.

## API (not in 3A)

JWT verification and `organization_id` context land in `api/` (step 3B). Edge Function `api` stays on initData until REST migration.
