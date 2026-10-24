# Current architecture

This document describes **what exists today** in this repository and in the
inferred live stack. It does not propose the target SaaS.

Source of truth for behavior: `legacy/`. Four original files, plus live
Supabase that is **not fully dumped in git**.

## Summary

RentMate is a Telegram-only garage operations tool for rental vehicles
(ATVs / quads in the current copy). Operators manage a fleet, start and close
trips (routes), record mileage and engine hours, flag damage, track spare
parts, and set service (ТО) intervals.

There is no web app, no REST router, no CI, and no Cloudflare config in git.

```
Telegram client
  ├─ Mini App (legacy/miniapp/index.html)
  │     POST { action, payload } + x-init-data
  │     → Supabase Edge Function `api` (legacy/functions/api/index.ts)
  │
  └─ Bot chat
        webhook + secret header
        → Supabase Edge Function `bot` (legacy/functions/bot/index.ts)

Both functions use the Supabase service role → PostgreSQL
Photos: Storage bucket `photos` (public URLs)
```

## Frontend

- **File:** `legacy/miniapp/index.html` (~920 lines).
- **Stack:** HTML, CSS, vanilla JavaScript. No bundler, no TypeScript, no React.
- **SDK:** `https://telegram.org/js/telegram-web-app.js`.
- **Fonts:** Google Fonts Montserrat.
- **State:** global object `S` (view, snapshot, trip wizard, etc.).
- **Rendering:** `innerHTML` string templates.
- **Events:** one document-level `click` handler keyed by `data-*` attributes.
- **Boot:** requires `Telegram.WebApp.initData`. Otherwise a gate screen.
- **Cache:** last `snapshot` in `localStorage` key `ga_snap`.
- **Config (hardcoded):** Supabase project URL, publishable key, Functions URL
  `…/functions/v1/api`.

Views: `dash`, `edit`, `garages`, `trip_new`, `trip_close`, `history`, `parts`.

## Backend

Two Deno Edge Functions, dependency `npm:@supabase/supabase-js@2`.

### `api`

- Single `POST` endpoint. CORS `Access-Control-Allow-Origin: *`.
- Body: `{ action: string, payload?: object }`.
- Auth on every request (Telegram `initData` HMAC).
- Mutations other than `snapshot` return HTTP 402 if `garages.expires_at` is
  in the past.
- Uses `SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS).

### `bot`

- Telegram Bot API (`BOT_TOKEN`).
- Webhook guard: header `X-Telegram-Bot-Api-Secret-Token` must equal
  `SECRET_TOKEN`.
- Onboarding: create garage, join by 6-character invite code, rename, switch,
  leave, delete.
- Mini App button: `web_app.url = APP_URL`.
- Cron-shaped JSON (not Telegram updates): `{ "cron": "daily" }` (parts ETA
  reminders) and `{ "cron": "late" }` (overdue trip alerts). Scheduler is not
  in this repository.

## Database

`legacy/sql/001_multitenant.sql` is **incremental**. It assumes `staff`,
`units`, `marks`, and `parts` already exist in the live database.

Tables the functions actually use:

| Table | Role |
| --- | --- |
| `garages` | Tenant. Columns used: `id`, `name`, `invite_code`, `expires_at`, `created_at` |
| `users` | `tg_id` primary key; current `garage_id`; `role`; display `name` |
| `memberships` | `(tg_id, garage_id, role)` — multi-garage access |
| `units` | Fleet assets |
| `marks` | Event log (out/in/service/mileage, damage, meters, `trip_id`) |
| `parts` | Spare parts |
| `trips` | Group outing (`planned_hours`, `start_at`, `end_at`, `late_notified`) |
| `trip_units` | Units on a trip (`out_mark_id`, `in_mark_id`) |
| `bot_pending` | Bot wizard state (`tg_id`, `action`) |
| `staff` | Legacy table copied into `users` by the migration |

The live unique constraint on board number per garage is inferred from API
error handling (`dupError`); it is not in `001_multitenant.sql`.

RLS is **enabled** on several tables in that SQL file. **No policies** are
committed. Isolation is application `eq("garage_id", ctx.garage_id)` plus
service role.

## Storage

- Bucket: `photos`.
- Upload path: `g{garage_id}_u{unit_id}_{timestamp}.{ext}`.
- Public URL stored on `units.photo_url`.
- Client sends base64 (max ~7e6 chars on the server; 5 MB on the client).

## Telegram

- Mini App is the only operator UI.
- Auth identity is Telegram user id.
- Bot keyboard (Russian): create garage, join by code, list garages.
- Commands: `/start`, `/myid`, `/rename`, `/garages`, `/leave`, `/delgarage`.
- Notifications: `sendMessage` to `users.tg_id` for the garage’s **current**
  pointer (`users.garage_id`), not all memberships.

## Authentication

Mini App (`api`):

1. Header `x-init-data` (Telegram WebApp initData).
2. HMAC-SHA256 per Telegram WebApp spec using `BOT_TOKEN`.
3. Reject if `auth_date` older than 24 hours.
4. Parse `user.id` → `users.tg_id`.
5. Load current `garage_id` / role; overlay `memberships` role.

Bot: Telegram `from.id` after webhook secret check. No initData.

There is no email, password, SSO, or JWT.

## Authorization

Roles: `owner`, `admin`, `staff`.

Helper `owner()` in the API is inverted naming: it returns true when the
caller is **not** owner and **not** admin (i.e. staff-only block).

- Owner + admin: catalog, photos, TO, damage close, history edits, most staff
  writes (`staff_save`).
- Owner only: `staff_role`, `staff_del`, garage delete.
- Any member: snapshot, trips, marks.

`staff_del` only deletes `users` rows with `role = 'staff'` (not admin).

## Tenant model

- Tenant = row in `garages` (`garage_id`).
- A Telegram user has **one** `users` row (PK `tg_id`) pointing at the
  **active** garage.
- Additional garages: `memberships`. Cap: 3 per Telegram user (`GARAGE_MAX`).
- Switching garage updates `users.garage_id` and `users.role`.

This is shared-database multi-tenancy, but the identity model is Telegram-first
and the active tenant is a mutable pointer, not a request header.

## Billing / expiration

- Column `garages.expires_at`.
- `null` means active.
- Expired: `snapshot` still works; other actions return 402
  `"подписка истекла"`.
- No Stripe, invoices, or plans in code.

## API actions (current)

Implemented in `legacy/functions/api/index.ts`:

`snapshot`, `garage_switch`, `garage_leave`, `garage_delete`, `staff_role`,
`trip_open`, `trip_close`, `mark`, `mileage_set`, `status_set`,
`damage_dismiss`, `damage_close`, `service_set`, `service_done`,
`market_price`, `part_save`, `part_clear`, `hist_clear`, `unit_save`,
`unit_delete`, `photo_upload`, `staff_save`, `staff_del`, `part_del_last`,
`trip_del_last`, `part_del`, `trip_del`, `mark_update`, `trip_remove`.

Called by the Mini App but **not** implemented (falls through to
`unknown action`): `staff_rename`, `service_set_all`.

Payload mismatches:

- UI `mark_update` sends `engine_hours`; API reads `payload.mh`.
- UI `trip_remove` sends `trip_id`; API expects `out_id`.

`market_price` has no UI in the HTML.

## Implicit business rules

- Meters must not decrease (`meterCheck`).
- A unit cannot be on two open trips; open `kind=out` mark also counts as busy.
- Single-unit out/in is blocked if the unit is on a group trip.
- Service remaining: `base + interval - current` (mh preferred over km).
- Service warning thresholds: 15 mh or 100 km; push when crossing the threshold.
- Status can be manual (`free`, `out`, `fuel`, `lowfuel`, `service`) or derived
  from marks (open out, overdue, 14-day service heuristic).
- Board numbers unique per garage (inferred).
- Display names and garage titles max 18 characters in the bot.
- Invite codes: 6 characters `A–Z0–9`.
- One owned garage per Telegram user in `createGarageNamed` (existing `users`
  row blocks creating another owned garage).

## Deployment

Not automated in git.

Inferred:

1. Host `index.html` at `APP_URL` (host unknown; no Cloudflare files).
2. `supabase functions deploy` for `api` and `bot`.
3. Env: `SUPABASE_URL`, `SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`,
   `BOT_TOKEN`, `APP_URL`, `SECRET_TOKEN`.
4. Telegram `setWebhook` with secret token.
5. Manual SQL on the project.

## Dependencies

| Surface | Dependencies |
| --- | --- |
| Mini App | Telegram WebApp JS, Google Fonts |
| Edge Functions | Deno runtime, `@supabase/supabase-js@2` |
| Data | PostgreSQL on Supabase, Storage |

No root `package.json` existed before the SaaS foundation work. No tests, lint,
or typecheck for the legacy app.

## Known defects (current system)

See `SECURITY.md` for security. Functional issues:

1. Missing API actions used by the UI (`staff_rename`, `service_set_all`).
2. `mark_update` / `trip_remove` payload field mismatches.
3. `snapshot` loads **all** marks for the garage (no pagination).
4. Notifications keyed off `users.garage_id`, not memberships.
5. Dual columns `board` and `board_no`; UI uses `board` for catalog and
   `board_no` for open trips.
6. Column `name` referenced via `["n","a","m","e"].join("")` in client and
   server (obfuscation, not a security control).
7. Full schema, indexes, and RLS policies are not in version control.
