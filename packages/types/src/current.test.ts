import assert from "node:assert/strict";
import test from "node:test";
import { isCurrent, isPlanned, LEGACY_TABLE, type Organization } from "./index.js";

test("legacy table mapping keeps garage as organization", () => {
  assert.equal(LEGACY_TABLE.organizations, "garages");
  assert.equal(LEGACY_TABLE.organizationId, "garage_id");
  assert.equal(LEGACY_TABLE.vehicles, "units");
});

test("entityStatus discriminates current vs planned", () => {
  const org: Organization = {
    entityStatus: "current",
    id: 1,
    name: "Test",
    inviteCode: null,
    expiresAt: null,
    createdAt: new Date(0).toISOString(),
  };
  assert.equal(isCurrent(org), true);
  assert.equal(isPlanned(org), false);
});
