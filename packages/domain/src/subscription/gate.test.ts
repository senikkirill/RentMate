import assert from "node:assert/strict";
import test from "node:test";
import {
  isSubscriptionActive,
  isSubscriptionGateClosed,
  requiresActiveSubscription,
} from "./gate.js";

const fixedNow = new Date("2026-10-25T12:00:00.000Z");

test("isSubscriptionActive: null or empty means active", () => {
  assert.equal(isSubscriptionActive(null, fixedNow), true);
  assert.equal(isSubscriptionActive(undefined, fixedNow), true);
  assert.equal(isSubscriptionActive("", fixedNow), true);
});

test("isSubscriptionActive: future active, past inactive", () => {
  assert.equal(isSubscriptionActive("2026-10-26T00:00:00.000Z", fixedNow), true);
  assert.equal(isSubscriptionActive("2026-10-24T00:00:00.000Z", fixedNow), false);
});

test("isSubscriptionActive: expiry must be strictly after now", () => {
  assert.equal(isSubscriptionActive("2026-10-25T12:00:00.000Z", fixedNow), false);
});

test("requiresActiveSubscription: snapshot exempt", () => {
  assert.equal(requiresActiveSubscription("snapshot"), false);
  assert.equal(requiresActiveSubscription("trip_open"), true);
});

test("isSubscriptionGateClosed blocks mutations when expired", () => {
  assert.equal(isSubscriptionGateClosed("snapshot", "2020-01-01T00:00:00.000Z", fixedNow), false);
  assert.equal(isSubscriptionGateClosed("mark", "2020-01-01T00:00:00.000Z", fixedNow), true);
  assert.equal(isSubscriptionGateClosed("mark", null, fixedNow), false);
});
