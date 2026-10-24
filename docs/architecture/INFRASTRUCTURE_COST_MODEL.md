# Infrastructure cost model

Prices are **not** taken from this repository (none are recorded). This is a
**driver model**: what grows the bill as organizations grow.

Target topology (cheap and sufficient):

```
Many organizations
        ↓
Shared application (web + api + 2 edge functions for a while)
        ↓
Shared PostgreSQL (one Supabase project)
        ↓
organization_id isolation
```

Anti-pattern (rejected):

```
1 customer = 1 database
1 customer = 1 Supabase project
1 customer = 1 backend
```

That multiplies idle compute, backups, dashboards, and human time. It does
not buy isolation if RLS is done properly.

## Unit cost mental model

Treat these as **relative units** (U), not currency.

| Unit | What consumes it | Scales with |
| --- | --- | --- |
| Cost per organization | DB row overhead, one garage/org, invite metadata, membership rows | Org count (tiny) |
| Cost per active user | Auth, bot chats, notification sends | DAU / Telegram messages |
| Cost per vehicle | `units` row + photos + marks over time | Fleet size × age |
| Cost per booking/trip | `trips` + `trip_units` + 2+ `marks` | Operational volume |
| Cost per 1,000 API requests | Edge Function / API invocations, egress | Client chatter (today: snapshot + mutate + snapshot) |
| Cost per GB storage | Postgres + object photos | Photos dominate objects; marks dominate DB growth |
| Cost per GB bandwidth | HTML, API JSON, public photo URLs | Snapshots + images |

Dominant **current** pattern: each mutation refetches **full snapshot**
(all units, all marks, all parts). That makes **API request count × payload
size** the first cost cliff, not org count.

## Resource drivers

### PostgreSQL storage

- Grows with `marks` (every out/in/mileage) and `parts`.
- Per-org size ≈ fleet × trips × marks per trip.
- Mitigation: pagination, archive old marks, do not duplicate snapshot caches
  in DB.

### Database CPU / RAM

- Hot path: unindexed filters and `snapshot` sorting all marks.
- Shared instance: noisy neighbor is one huge org, not 1,000 empty ones.
- Mitigation: `(organization_id, at)` indexes; cap snapshot; connection
  pooling already typical on Supabase.

### Supabase platform

Typical bill buckets (conceptually): DB size, egress, Edge Function
invocations, Storage, Auth MAU (when added), backups.

Foundation choice: **one project**. Upgrade compute only when CPU/IO is
measured, not at 10 customers.

### Storage (photos)

- Public bucket, one object per upload (no overwrite of old files in current
  code — **orphans accumulate**).
- Cost ≈ number of uploads × average image size (client allows 5 MB).
- Mitigation: compress on upload, overwrite or delete previous photo, CDN
  cache, size limits.

### Edge Functions / API

- Two functions today. Invocations ≈ bot updates + Mini App actions × 2
  (write + snapshot).
- Moving to a long-running `api` process can be cheaper at high RPS; Edge
  is cheaper at low RPS. Decide with traffic, not ideology.

### Bandwidth

- JSON snapshots of full mark history.
- Public photo downloads in the Mini App list.

### Backups / logs

- Backup cost tracks DB size.
- Verbose `console.error` is cheap; shipping all logs to a SaaS is not.
- Keep logs sampled until needed.

### Telegram API

- Free at low volume; rate limits, not invoices, are the constraint.
- Fan-out `notify()` per user row is N messages per event.

### Email / future integrations

- Zero today. Add transactional email only for web login/billing.
- Lead channels: pay per provider; isolate behind one `Booking` ingest.

## Architectural decisions that move cost the most

1. **Shared DB vs DB-per-tenant** — largest cost fork. Shared wins.
2. **Snapshot-everything vs incremental queries** — largest *current* waste.
3. **Public uncompressed photos vs processed images**.
4. **Notify-all via Telegram vs in-app feed** (message volume).
5. **Edge per request vs one API instance** — crossover with RPS.
6. **Keeping marks forever vs retention/archive**.

## Guidance by stage

- **1–10 orgs:** current Supabase project is enough. Measure snapshot size.
- **100 orgs:** paginate history; index tenant columns; photo budget.
- **500–1,000:** watch Storage + egress; consider CDN; job batching.
- **5,000:** still one DB if tenant indexes hold; split **read models**
  (analytics) before splitting OLTP.

Do not optimize infrastructure by adding systems. Optimize **payloads,
indexes, and retention** first.
