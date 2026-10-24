# Prisma (deferred)

Prisma is **not** wired and must not be used to push schema to production.

When the live database is dumped and `packages/database/migrations` has a
baseline, we can add `schema.prisma` here and generate a client for `api/`.

Until then the SQL migration folder is the only schema source of truth.
See `docs/architecture/DATABASE_STRATEGY.md`.
