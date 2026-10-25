import assert from "node:assert/strict";
import test from "node:test";
import { isOwner, isOwnerOrAdmin, isStaffOnly } from "./roles.js";

test("isOwnerOrAdmin", () => {
  assert.equal(isOwnerOrAdmin("owner"), true);
  assert.equal(isOwnerOrAdmin("admin"), true);
  assert.equal(isOwnerOrAdmin("staff"), false);
});

test("isStaffOnly matches legacy owner() helper", () => {
  assert.equal(isStaffOnly("staff"), true);
  assert.equal(isStaffOnly("admin"), false);
  assert.equal(isOwner("owner"), true);
});
