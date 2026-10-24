# RentMate

SaaS for rental operations (ATV, enduro, snowmobile, buggy, and later other
fleets). Operators track vehicles, trips, meters, maintenance, and parts.

This repository is in **incremental migration**: the live Telegram Mini App
still runs from `legacy/`. The rest of the tree is the TypeScript monorepo
foundation for web + API + shared types.

## Layout

```
apps/web          Next.js skeleton (not the production UI yet)
apps/miniapp      Pointers to the live Mini App; future TS client
api               REST skeleton + legacy action map + /api/health
packages/types    Shared CURRENT + PLANNED domain types
packages/database SQL migrations + inferred schema notes
packages/ui       Future shared UI
packages/config   Shared tsconfig
legacy/           Production Mini App, Edge Functions, SQL
docs/architecture Architecture, security, cost, API, DB strategy
prisma/           Deferred (see DATABASE_STRATEGY.md)
scripts/          Legacy integrity check
```

## Develop

Requires **Node.js 20+** (see `engines` in root `package.json`).

```bash
cp .env.example .env   # do not commit secrets
npm ci                 # or npm install locally
npm run typecheck
npm run build
npm test
```

CI (`.github/workflows/ci.yml`) runs the same verify steps on push/PR to `main`.

```bash
npm run dev:web    # http://localhost:3000
npm run dev:api    # http://127.0.0.1:4000/api/health
```

Production Telegram deploy is unchanged: host `legacy/miniapp/index.html`,
deploy `legacy/functions/*` to Supabase Edge Functions.

## Docs

Start at [`docs/architecture/CURRENT_ARCHITECTURE.md`](docs/architecture/CURRENT_ARCHITECTURE.md).
