# Database strategy

## Source of truth (decision)

**SQL files in `packages/database/migrations/`** are the source of truth for
future schema changes.

Reasons:

- Production already is Postgres on Supabase, evolved by hand.
- The repo only contains an incremental script
  (`legacy/sql/001_multitenant.sql`), not a complete schema.
- Prisma (or any ORM) cannot be generated honestly until we introspect live
  DB or write a complete `CREATE TABLE` set.

**Prisma is deferred.** Useful later for: typed queries in `api/`, migration
diffing, and AI-assisted model edits. Introduce Prisma when:

1. We have a complete schema file that matches production (pg_dump or
   reconstructed `CREATE TABLE`), and
2. The API (not only Edge Functions) is the primary writer.

Until then, do **not** `prisma db push` against production.

`prisma/README.md` records this deferral so the folder is not a second
competing schema.

## Layout

```
packages/database/
  migrations/     numbered SQL, applied forward-only
  schema/         documented inferred current schema (not auto-applied)
  src/            TypeScript names + helpers (no runtime DB client required)

legacy/sql/       historical scripts as they shipped
```

New work: add `packages/database/migrations/00x_*.sql`. Never rewrite
already-applied numbers.

## Current inferred model (do not apply blindly)

See `packages/database/schema/inferred-current.sql` for comments describing
tables the Edge Functions use. That file is **documentation**. Applying it
on a populated project can fail or duplicate objects.

## Tenant isolation

- Today: `garage_id` on operational tables; RLS enabled without policies in
  git; service role bypass.
- Target: `organization_id NOT NULL` on tenant tables, FK to organizations,
  **RLS policies** using `auth.uid()` or a `request.jwt` claim, **and**
  the same filter in application queries (defense in depth).

Every new table: `organization_id`, index leading with it, FK, RLS.

## Constraints and indexes (target)

Minimum for scale:

- PK on all tables.
- FK `organization_id` → organizations.
- Unique `(organization_id, board_no)` on vehicles (already implied).
- Unique membership `(user_id, organization_id)`.
- Index `marks (organization_id, unit_id, at DESC)`.
- Index `trips (organization_id, end_at)` for open trips (`end_at IS NULL`).
- Index `parts (organization_id, unit_id)`.
- Index `memberships (tg_id)` / future `user_id`.

## Timestamps

Keep `created_at` / event `at` as timestamptz. Add `updated_at` on entities
that are edited (units, parts, organizations) in a later migration.

## Soft delete

Not used today (hard deletes for units, garages, marks). For SaaS billing
and audit, prefer **soft delete on organizations and users** later
(`deleted_at`). Operational marks can stay hard-deleted until compliance
requires otherwise.

## Audit

Today: `who` on marks, `created_by` on trips. Target: `created_by` /
`updated_by` UUID on mutable entities; optional `audit_events` only if we
need a trail beyond logs.

## Pagination

All list endpoints: `limit` + `cursor` (preferred) or `offset` for small
admin lists. Never return unbounded `marks` in a snapshot.

## Query performance

Tenant-scope every query. No `select * from marks` without
`organization_id`. Analytics: daily rollups later, not live scans of marks
across the platform.

## Migration safety

- Forward-only SQL.
- No `DROP TABLE` of operational data in this foundation.
- Rename garage → organization in a dedicated, reversible migration
  (column rename + function deploy in the same release window).
- Test migrations on a copy, not on production first.
