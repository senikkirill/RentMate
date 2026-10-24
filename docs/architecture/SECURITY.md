# Security

## CURRENT

| Area | Reality |
| --- | --- |
| Data plane | Edge Functions use **service role**; RLS is on but **policies are not in git** (likely ineffective for these functions). |
| Tenant isolation | Application `.eq("garage_id", ctx.garage_id)` after Telegram auth. Bugs here are full-table access. |
| Mini App auth | Telegram initData HMAC, 24h window. Correct algorithm. |
| Bot auth | Webhook secret header. Updates trusted after that. |
| CORS | `*` on `api`. |
| Browser keys | Publishable Supabase key and project URL **hardcoded** in HTML. Key is not service role, but pins environment. |
| Storage | Public `photos` URLs; anyone with the URL can read. Upload only after auth, owner/admin. |
| Invite codes | 6-char alphanumeric, stored in plaintext on `garages`. |
| Secrets | `BOT_TOKEN`, service role, webhook secret in Function env (good) — not in git except the public key. |
| SQL seed | Hardcoded Telegram id `359896904` as owner. |
| Admin | Role strings in DB; no platform super-admin. |
| Sessions | No server session; replay of initData possible within 24h. |

Additional issues:

- Staff can be added by Telegram id without proving they opened the bot.
- `notify` uses service role to read all `users` for a garage pointer.
- No rate limiting in the function code.
- Base64 photos inflate payload and CPU on the Edge Function.

## TARGET

- **RLS policies** for `authenticated` (and service role only for bot/jobs).
- JWT or signed session with `user_id` and `organization_id`.
- CORS allowlist of web origin + Telegram.
- Secrets only in env; Mini App gets a public anon key via build-time env,
  not a committed production URL if we multi-stage.
- Invite codes: higher entropy, hash at rest, expiry, rotation.
- Storage: private bucket + signed URLs, or public with unguessable paths
  **and** org-prefixed ACL.
- Authorization matrix in one module (not inverted `owner()` helper).
- Audit log for membership and billing changes.
- Rate limit auth failures and invite guesses.

## MIGRATION PATH

1. Stop committing secrets; `.env.example` only (this repo foundation).
2. Document and add RLS policies that match API filters; keep service role
   for bot until Mini App uses user-scoped client **or** API uses user JWT
   with RLS.
3. Replace initData-per-request with short-lived session after verify.
4. Move HTML config to env at build.
5. Hash invite codes; keep a grace period for existing 6-char codes.
6. Tighten CORS when `apps/web` has a known origin.
7. Signed photo URLs when web and Mini App both use the new API.
8. Do not switch off Telegram HMAC until the session issuer is in production.
