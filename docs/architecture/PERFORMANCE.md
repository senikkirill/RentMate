# Performance and scale

Based on current `snapshot` + service-role queries, not on load tests
(none exist).

## What the code does today

- `snapshot`: `units *`, `marks *` ordered by `at`, `parts *`, open trips,
  memberships, all members of those garages.
- Many actions: mutate then client immediately `snapshot` again.
- `meterCheck` / busy detection may load marks ordered by `at` for a unit
  or garage without a limit.
- Photos: full-resolution public files on every dashboard card.

## Scale table

| Orgs | Likely first problem |
| --- | --- |
| 10 | Large single fleet still hurts if marks are unbounded |
| 100 | JSON snapshot size; Edge CPU on HMAC + JSON; photo egress |
| 500 | Missing tenant indexes if seq scans start; notify loops |
| 1,000 | Storage orphans; backup window; function timeouts on fat snapshots |
| 5,000 | Platform-wide jobs (`daily` scans all parts with ETA); analytics |

Empty organizations are cheap. **One busy org with years of marks** is more
dangerous than 500 empty ones.

## Mitigations (in order)

1. Paginate marks/history; dashboard uses derived vehicle state, not full log.
2. Indexes on `(garage_id/organization_id, …)` — `DATABASE_STRATEGY.md`.
3. Compress/limit photos; stop leaving old objects forever.
4. Cron queries must be tenant-index-friendly (`eta` range, not full parts).
5. Notify from memberships, batched.
6. Only then: read replicas / rollup tables.

## Background jobs

`daily` and `late` currently load broad sets. At 5,000 orgs they must be
SQL-filtered (due in next 3 days; open trips with `late_notified = false`)
not scanned in JS more than necessary.
