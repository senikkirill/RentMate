/**
 * Maps the live Edge Function `action` strings to target REST.
 * Keep this in sync with legacy/functions/api/index.ts.
 */
export type LegacyActionStatus = "mapped" | "bug-missing" | "bug-payload" | "dead-ui";

export interface LegacyActionMap {
  action: string;
  rest: string;
  status: LegacyActionStatus;
  note?: string;
}

export const legacyActions: LegacyActionMap[] = [
  { action: "snapshot", rest: "GET /api/organizations/:orgId (composed dashboard later)", status: "mapped" },
  { action: "garage_switch", rest: "POST /api/organizations/:orgId/switch", status: "mapped" },
  { action: "garage_leave", rest: "DELETE /api/organizations/:orgId/members/me", status: "mapped" },
  { action: "garage_delete", rest: "DELETE /api/organizations/:orgId", status: "mapped" },
  { action: "staff_role", rest: "PATCH /api/organizations/:orgId/members/:userId", status: "mapped" },
  { action: "staff_save", rest: "POST /api/organizations/:orgId/members", status: "mapped" },
  { action: "staff_del", rest: "DELETE /api/organizations/:orgId/members/:userId", status: "mapped" },
  { action: "staff_rename", rest: "PATCH /api/organizations/:orgId/members/:userId", status: "bug-missing", note: "Mini App calls it; Edge Function has no case" },
  { action: "unit_save", rest: "POST|PATCH /api/organizations/:orgId/vehicles", status: "mapped" },
  { action: "unit_delete", rest: "DELETE /api/organizations/:orgId/vehicles/:vehicleId", status: "mapped" },
  { action: "photo_upload", rest: "POST /api/organizations/:orgId/vehicles/:vehicleId/photo", status: "mapped" },
  { action: "trip_open", rest: "POST /api/organizations/:orgId/trips", status: "mapped" },
  { action: "trip_close", rest: "POST /api/organizations/:orgId/trips/:tripId/close", status: "mapped" },
  { action: "mark", rest: "POST /api/organizations/:orgId/vehicles/:vehicleId/marks", status: "mapped" },
  { action: "mileage_set", rest: "POST /api/organizations/:orgId/vehicles/:vehicleId/marks", status: "mapped" },
  { action: "status_set", rest: "PATCH /api/organizations/:orgId/vehicles/:vehicleId", status: "mapped" },
  { action: "damage_dismiss", rest: "POST /api/organizations/:orgId/vehicles/:vehicleId/damages/dismiss", status: "mapped" },
  { action: "damage_close", rest: "POST /api/organizations/:orgId/vehicles/:vehicleId/damages/close", status: "mapped" },
  { action: "service_set", rest: "PATCH /api/organizations/:orgId/vehicles/:vehicleId/maintenance", status: "mapped" },
  { action: "service_set_all", rest: "POST /api/organizations/:orgId/maintenance/interval", status: "bug-missing", note: "Mini App calls it; Edge Function has no case" },
  { action: "service_done", rest: "POST /api/organizations/:orgId/vehicles/:vehicleId/maintenance/done", status: "mapped" },
  { action: "market_price", rest: "PATCH /api/organizations/:orgId/vehicles/:vehicleId", status: "dead-ui", note: "API exists; Mini App has no control" },
  { action: "part_save", rest: "POST|PATCH /api/organizations/:orgId/vehicles/:vehicleId/parts", status: "mapped" },
  { action: "part_clear", rest: "DELETE /api/organizations/:orgId/vehicles/:vehicleId/parts", status: "mapped" },
  { action: "part_del", rest: "DELETE /api/organizations/:orgId/parts/:partId", status: "mapped" },
  { action: "part_del_last", rest: "DELETE /api/organizations/:orgId/vehicles/:vehicleId/parts/last", status: "mapped" },
  { action: "hist_clear", rest: "DELETE /api/organizations/:orgId/vehicles/:vehicleId/marks", status: "mapped" },
  { action: "trip_del_last", rest: "DELETE /api/organizations/:orgId/vehicles/:vehicleId/trips/last", status: "mapped" },
  { action: "trip_del", rest: "DELETE /api/organizations/:orgId/marks/:outId", status: "mapped" },
  { action: "trip_remove", rest: "DELETE /api/organizations/:orgId/trips/:tripId", status: "bug-payload", note: "UI sends trip_id; API expects out_id" },
  { action: "mark_update", rest: "PATCH /api/organizations/:orgId/marks/:markId", status: "bug-payload", note: "UI sends engine_hours; API reads mh" },
];
