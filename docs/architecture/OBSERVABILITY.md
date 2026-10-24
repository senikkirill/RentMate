# Observability

Philosophy: **minimum infrastructure, maximum reliability.**

## CURRENT

- `console.error("bot:", e)` on webhook failures.
- Mini App toasts and a window `error` handler writing into `#app`.
- No request ids, no metrics, no job failure store.
- Telegram send failures are swallowed (`catch { /* ignore */ }`).

## TARGET (cheap)

1. **Structured logs** (JSON) on API and bot: timestamp, level, route/action,
   `organization_id`, `user_id` (not tokens), duration_ms, error code.
2. **Request id** header generated per call; echo to clients.
3. **Job results**: daily/late cron log line with counts (notified, failed).
   Persist failures in a small `job_runs` table only if logs are not enough.
4. **Telegram**: log HTTP status from Bot API; do not retry storms.
5. **Error tracking**: none until production traffic; then one tool, not three.
6. **DB**: Supabase dashboard / `pg_stat_statements` when something is slow.
   No APM suite on day one.
7. **Uptime**: one health GET `/api/health` for the future API.

Avoid log-shipping SaaS until the noise is known. Stdout on Edge Functions
is enough for the first tenants.
