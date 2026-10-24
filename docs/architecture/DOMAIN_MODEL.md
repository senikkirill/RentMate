# Domain model

Legend:

- **CURRENT** — exists in live tables / Edge Functions / Mini App.
- **PLANNED** — needed for SaaS; not in the current database.

The live tenant is named **garage**. Target name is **Organization**. Same
entity; see `TARGET_ARCHITECTURE.md` for rename strategy.

All CURRENT operational rows are scoped by `garage_id` except `users`
(global by Telegram id + active garage pointer) and `bot_pending` (by `tg_id`).

---

## Organization (CURRENT: Garage)

- **Status:** CURRENT (table `garages`).
- **Purpose:** Tenant. One rental business location / fleet.
- **Fields (used):** `id`, `name`, `invite_code`, `expires_at`, `created_at`.
- **Relations:** has many memberships, units, marks, parts, trips, users
  pointing at it as active garage.
- **Ownership:** created by a Telegram user who becomes `owner`.
- **Scope:** platform-level row; data inside is tenant-scoped.

## User

- **Status:** CURRENT (table `users`) with a Telegram-shaped identity.
- **Purpose:** Person who can open the Mini App or receive bot messages.
- **Fields (used):** `tg_id` (PK), `garage_id` (active org), `role`, `name`,
  `created_at`.
- **Relations:** many memberships; current garage; appears on marks as `who`.
- **Ownership:** the person; not nested under one organization.
- **Scope:** platform. **PLANNED:** UUID user id, email, password/SSO, optional
  linked `telegram_id`.

## Membership

- **Status:** CURRENT (table `memberships`).
- **Purpose:** Access of a user to an organization, with a role.
- **Fields (used):** `tg_id`, `garage_id`, `role` (`owner` | `admin` | `staff`).
- **Relations:** user ↔ organization.
- **Ownership:** organization owner manages staff/admin.
- **Scope:** organization. Cap today: 3 memberships per Telegram user.

## Employee

- **Status:** CURRENT as a **role on membership/user**, not a separate table.
- **Purpose:** Staff who run trips and record meters.
- **Fields:** same as user + role.
- **PLANNED:** employment fields (schedule, contacts) if needed; do not invent
  a second user table without a reason.

## Vehicle (CURRENT: Unit)

- **Status:** CURRENT (table `units`).
- **Purpose:** Rentable machine (ATV, enduro, snowmobile, buggy, …).
- **Fields (used):** `id`, `garage_id`, `board` / `board_no`, `model`, `year`,
  `photo_url`, `purchase_price`, `purchase_date`, `track_km`, `track_mh`,
  `status_manual`, `service_interval_km/mh`, `service_base_km/mh`,
  `market_price`, `price_at`.
- **Relations:** organization; marks; parts; trip_units.
- **Ownership:** organization.
- **Scope:** `garage_id` / future `organization_id`.

## Customer

- **Status:** PLANNED.
- **Purpose:** Person or company who books a vehicle.
- **Expected fields:** `id`, `organization_id`, name, phone, notes, timestamps.
- **Relations:** organization; bookings.
- **Ownership:** organization.
- **Today:** no customer records; trips are operator-side only.

## Booking

- **Status:** PLANNED.
- **Purpose:** Reservation of one or more vehicles for a time window.
- **Expected fields:** `id`, `organization_id`, `customer_id`, status, start/end,
  source channel (web, telegram, partner).
- **Relations:** customer, vehicles, maybe a realized Route/Trip.
- **Ownership:** organization.
- **Today:** only ad-hoc trip start (`trip_open` / `mark` out).

## Route / Trip

- **Status:** CURRENT as `trips` + `trip_units` + paired `marks` (out/in).
  Also single-unit trips without a `trips` row (`mark` kind out/in).
- **Purpose:** Operating outing: vehicles left and returned, planned hours,
  meters, damage on return.
- **Fields (trips):** `id`, `garage_id`, `planned_hours`, `start_at`, `end_at`,
  `created_by`, `late_notified`.
- **Fields (trip_units):** `trip_id`, `unit_id`, `out_mark_id`, `in_mark_id`.
- **Ownership:** organization.
- **Scope:** `garage_id`.
- **PLANNED:** named routes / tracks as catalog (repeatable products), distinct
  from a single executed trip.

## Operating hours

- **Status:** PLANNED as a first-class entity.
- **Purpose:** When the rental is open; staffing windows.
- **Today:** implied only as `planned_hours` on a trip.

## Maintenance (CURRENT: service / ТО)

- **Status:** CURRENT as fields on `units` plus optional `marks.kind = service`
  and UI “ТО сделано” which only resets `service_base_*`.
- **Purpose:** Interval-based service by km or engine hours.
- **Ownership:** organization via vehicle.
- **PLANNED:** `maintenance_events` table (work done, cost, vendor) instead of
  only resetting bases.

## Part

- **Status:** CURRENT (table `parts`).
- **Purpose:** Spare part needed / in transit / installed for a vehicle.
- **Fields (used):** `id`, `garage_id`, `unit_id`, `title`, `node`, `status`,
  `urgency`, `eta`.
- **Ownership:** organization.
- **Scope:** `garage_id`. Status strings are Russian (`нужно`, `в пути`, …).

## Damage

- **Status:** CURRENT as flags on inbound `marks` (`damage`, `note`,
  `closed_at`, `dismissed_at`).
- **Purpose:** Record harm on return; show until closed/dismissed.
- **Ownership:** organization via mark/vehicle.
- **PLANNED:** optional `damages` table if photos, cost, and repair tickets
  are needed.

## Expense

- **Status:** PLANNED.
- **Purpose:** Money out (parts, fuel, repairs, wages).
- **Expected fields:** `id`, `organization_id`, amount, currency, category,
  linked vehicle/part/maintenance, timestamp.
- **Today:** `purchase_price` / `market_price` on units only.

## Revenue

- **Status:** PLANNED.
- **Purpose:** Money in (bookings, trips).
- **Expected fields:** `id`, `organization_id`, amount, currency, booking/trip
  link, timestamp.
- **Today:** none. Profit cannot be computed.

## Notification

- **Status:** CURRENT as **send-and-forget Telegram messages**, not a table.
- **Purpose:** Alert owners/staff (trip start/end, damage, late return, TO,
  parts ETA).
- **Ownership:** organization (intended); implementation uses users with
  matching active `garage_id`.
- **PLANNED:** `notifications` log (channel, status, error) for observability.

## Platform (PLANNED)

- Billing customer, plan, usage. Today: `garages.expires_at` only.
- Super-admin / platform operator UI: none.

## Mapping to the business chain

| Chain step | Current | Gap |
| --- | --- | --- |
| Customer / Lead | — | PLANNED |
| Booking | — | PLANNED |
| Vehicle | `units` | Rename in API; keep table or view |
| Employee | membership role | Enough for v1 SaaS |
| Route | `trips` | Catalog routes PLANNED |
| Operating hours | `planned_hours` | Calendar PLANNED |
| Maintenance | unit service fields | Event history thin |
| Parts | `parts` | OK for v1 |
| Expenses | — | PLANNED |
| Revenue | — | PLANNED |
| Profit | — | Needs expenses + revenue |
