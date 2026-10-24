import type { MembershipRole } from "@rentmate/types";

/** Future REST surface. Not implemented in the Edge Function yet. */
export const restRoutes = {
  health: "GET /api/health",
  organizations: "GET|POST /api/organizations",
  organization: "GET /api/organizations/:orgId",
  members: "GET /api/organizations/:orgId/members",
  vehicles: "GET|POST /api/organizations/:orgId/vehicles",
  vehicle: "GET|PATCH|DELETE /api/organizations/:orgId/vehicles/:vehicleId",
  trips: "GET|POST /api/organizations/:orgId/trips",
  trip: "GET /api/organizations/:orgId/trips/:tripId",
  marks: "GET|POST /api/organizations/:orgId/vehicles/:vehicleId/marks",
  parts: "GET|POST /api/organizations/:orgId/vehicles/:vehicleId/parts",
  maintenance: "GET /api/organizations/:orgId/vehicles/:vehicleId/maintenance",
  customers: "PLANNED GET|POST /api/organizations/:orgId/customers",
  bookings: "PLANNED GET|POST /api/organizations/:orgId/bookings",
  expenses: "PLANNED GET|POST /api/organizations/:orgId/expenses",
  revenue: "PLANNED GET /api/organizations/:orgId/revenue",
} as const;

export type RestRouteName = keyof typeof restRoutes;

export const ownerAdmin: MembershipRole[] = ["owner", "admin"];
