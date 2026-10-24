# Target architecture

Goal: one SaaS for hundreds → thousands of rental organizations, without a
rewrite of operational truth (vehicles, trips, meters, parts, maintenance).

Principle: **cheap → fast → reliable → scalable → easy to develop with AI.**
Prefer one shared app and one shared Postgres.

## Shape

```
           Web (Next.js)          Mini App            Bot / jobs
                  │                    │                    │
                  └────────────┬───────┴────────────────────┘
                               │
                    HTTP API (TypeScript)
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         PostgreSQL        Storage         Notifications
         (Supabase)        (photos)        (Telegram first)
```

Telegram Mini App is **a client**, not the system core.

## Clients

1. **Web** (`apps/web`) — primary operator UI (Next.js, React, TypeScript).
2. **Mini App** (`apps/miniapp`) — same API, Telegram shell, eventually not a
   900-line HTML file.
3. **Bot** — onboarding, alerts; keep Edge Function or move into `api` workers
   later (one process is enough for a long time).
4. **Public/partner API** — same authZ, API keys later; not now.

## Backend

- TypeScript, modular packages, **versioned REST** (see `API_STRATEGY.md`).
- One deployable API (`api/`). NestJS is optional later if modules and DI
  help; do **not** add Nest until the REST surface exists and hurts as a
  single folder. Start with a small HTTP server (or keep Edge Functions and
  put domain code in `packages/`).
- Domain modules: organizations, members, vehicles, trips, parts, maintenance;
  then customers, bookings, money.

## Database

- Stay on **Supabase PostgreSQL**.
- Shared database, shared schema, **`organization_id` on every tenant table**.
- No database-per-customer, no project-per-customer.
- SQL migrations in `packages/database/migrations` are the source of truth
  until a full schema dump exists. Prisma is deferred (see
  `DATABASE_STRATEGY.md`).

### Garage → Organization (no data loss)

1. Keep physical table `garages` until a planned migration.
2. In code and API, call it Organization; map `garage_id` → `organization_id`.
3. When ready, non-destructive SQL:
   - `ALTER TABLE garages RENAME TO organizations;` **or**
   - add `organizations` as a view on `garages`, then later rename.
4. Rename column `garage_id` → `organization_id` in child tables in a
   follow-up migration with views or dual-write if Edge Functions still run.
5. Expand `users`: add `id` UUID, optional `email`; keep `tg_id` unique
   nullable for Telegram-linked accounts.
6. Memberships already are the right many-to-many; change PK to
   `(organization_id, user_id)` after User gets a real id.

Do this in named migrations, never by editing production by hand without a
file in git.

## Multi-tenancy

```
Platform
  └── Organization (n)
        ├── Memberships / Users
        ├── Vehicles
        ├── (PLANNED) Customers, Bookings, Expenses, Revenue
        └── existing ops: trips, marks, parts
```

Isolation: **RLS + application filters**. Service role only in trusted
workers, never as the Mini App’s data path forever.

Active organization: chosen membership, sent as header or URL prefix
`/api/organizations/:id/...`, not a hidden pointer on `users` (keep the
pointer only as a default for Telegram).

## Auth (target)

- Web: email/magic-link or password via Supabase Auth **or** a thin session
  in our API. Telegram remains a **linked identity**.
- Mini App: keep initData verification, then issue a short-lived session
  bound to `user_id` + `organization_id`.
- Bot: unchanged webhook secret; resolve Telegram id → user.

## Frontend target

- Next.js App Router, React, TypeScript, shared types from `@rentmate/types`.
- Mini App later: same design tokens / queries, Telegram viewport constraints.

## Jobs

Stay with scheduled HTTP into the bot (or `api`) for daily/late checks until
volume requires a queue. Do not add Redis/Kafka for this.

## Performance (order of magnitude)

| Organizations | What breaks first with **current** query shape |
| --- | --- |
| 10 | Nothing structural; snapshot size is per-garage |
| 100 | Large fleets: `snapshot` of all marks is slow; photos bandwidth |
| 500 | Need indexes on `(organization_id, …)`; paginated history |
| 1,000 | Notification fan-out; storage; connection count if naive pooling |
| 5,000 | Analytics on marks; backup size; must not scan marks globally |

Shared DB is correct at 5,000 orgs if every hot query is tenant-scoped and
indexed. See `INFRASTRUCTURE_COST_MODEL.md`.

## Observability (minimum)

Structured logs (JSON) with `organization_id`, `action`/`route`, latency, error.
Optional later: one error tracker (e.g. self-hosted or a cheap SaaS) only after
we have production traffic. See `OBSERVABILITY.md`.

## What we explicitly will not do now

- Microservices, Kubernetes, Kafka, Redis-by-default.
- One Supabase project per tenant.
- Full Mini App rewrite in the same change as this foundation.
- Prisma generate/push against production.
