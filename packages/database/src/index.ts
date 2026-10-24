import { LEGACY_TABLE } from "@rentmate/types";

/** Live table names. Prefer these constants over string literals in new code. */
export const tables = {
  organizations: LEGACY_TABLE.organizations,
  users: "users",
  memberships: "memberships",
  vehicles: LEGACY_TABLE.vehicles,
  marks: "marks",
  parts: "parts",
  trips: "trips",
  tripUnits: "trip_units",
  botPending: "bot_pending",
} as const;

export const tenantColumn = LEGACY_TABLE.organizationId;

export const migrationsDir = new URL("../migrations/", import.meta.url);
