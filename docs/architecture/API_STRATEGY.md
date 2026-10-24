# API strategy

## Current model

One Edge Function, one `POST`, dispatcher on `action` string.

Problems:

- No resource URLs, no HTTP semantics except 401/402/403/404/500.
- No OpenAPI / generated clients.
- Easy to desync Mini App strings vs server (`staff_rename`, `service_set_all`).
- Payload field names drift (`mh` vs `engine_hours`, `out_id` vs `trip_id`).
- Auth mixed with 800-line handler.
- Snapshot is a god-read; cache invalidation is “fetch everything again”.
- CORS `*` and service role inside the same file as business rules.

Keep this function **running** until web and Mini App speak REST. Map old
actions in `api/src/legacy-action-map.ts`.

## Target REST (additive)

All tenant routes require auth and an organization context.

```
/api/health

/api/organizations
/api/organizations/:orgId
/api/organizations/:orgId/members

/api/organizations/:orgId/vehicles
/api/organizations/:orgId/vehicles/:vehicleId

/api/organizations/:orgId/trips
/api/organizations/:orgId/trips/:tripId

/api/organizations/:orgId/vehicles/:vehicleId/marks
/api/organizations/:orgId/vehicles/:vehicleId/parts
/api/organizations/:orgId/vehicles/:vehicleId/maintenance

# PLANNED
/api/organizations/:orgId/customers
/api/organizations/:orgId/bookings
/api/organizations/:orgId/employees
/api/organizations/:orgId/routes
/api/organizations/:orgId/expenses
/api/organizations/:orgId/revenue
```

Aliases: `vehicles` = current `units`; `trips` = current group routes;
`members` = memberships.

## Incremental migration

1. Extract domain functions behind the action switch (same behavior).
2. Add REST in `api/` that calls those functions.
3. Point `apps/web` at REST only.
4. Mini App: change `api()` helper from action POST to REST, screen by screen.
5. Deprecate unknown actions; delete the dispatcher last.

Do not dual-implement rules in HTML and SQL.

## Contracts

Shared request/response types live in `@rentmate/types`. Validation later
(Zod) in `api/` only — not in the Mini App HTML.

## Compatibility

`legacy-action-map.ts` lists each action and the REST target. Missing
actions are documented as bugs, not silently invented.
