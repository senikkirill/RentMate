-- INFERRED CURRENT SCHEMA (DOCUMENTATION ONLY)
-- Reconstructed from Edge Function queries and 001_multitenant.sql.
-- Do NOT run this on production. Types may be incomplete or wrong.
-- Obtain a pg_dump before the first real baseline migration.

-- garages (Organization)
--   id bigint PK identity
--   name text not null
--   invite_code text
--   expires_at timestamptz
--   created_at timestamptz not null default now()

-- users
--   tg_id text PK
--   garage_id bigint not null references garages(id)
--   role text not null check (role in ('owner','staff','admin'))  -- admin used in code
--   name text not null
--   created_at timestamptz not null default now()

-- memberships
--   tg_id text
--   garage_id bigint
--   role text
--   (unique pair inferred)

-- units (Vehicle)
--   id, garage_id not null, board, board_no, model, year, photo_url,
--   purchase_price, purchase_date, track_km, track_mh, status_manual,
--   service_interval_km, service_base_km, service_interval_mh, service_base_mh,
--   market_price, price_at
--   unique (garage_id, board_no) inferred from API dupError

-- marks
--   id, garage_id, unit_id, kind, at, who, mileage, engine_hours, fuel,
--   due_at, damage, note, closed_at, dismissed_at, trip_id

-- parts
--   id, garage_id, unit_id, title, node, status, urgency, eta

-- trips
--   id, garage_id, planned_hours, start_at, end_at, created_by, late_notified

-- trip_units
--   id, trip_id, unit_id, out_mark_id, in_mark_id

-- bot_pending
--   tg_id PK, action text

-- Indexes present in 001: units_garage_idx, marks_garage_idx, parts_garage_idx
-- RLS enabled on garages, users, staff, units, marks, parts — policies not in repo
