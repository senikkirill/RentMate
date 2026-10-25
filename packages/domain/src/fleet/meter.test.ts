import assert from "node:assert/strict";
import test from "node:test";
import { validateMeterMonotonicity } from "./meter.js";

test("allows first mileage reading when current is null", () => {
  assert.equal(
    validateMeterMonotonicity({ current: { km: null, mh: null }, mileage: 100 }),
    null,
  );
});

test("rejects mileage below current", () => {
  const err = validateMeterMonotonicity({
    current: { km: 500, mh: 10 },
    mileage: 499,
  });
  assert.match(err ?? "", /пробег.*500/);
});

test("accepts engine_hours alias and rejects decreasing mh", () => {
  assert.equal(
    validateMeterMonotonicity({
      current: { km: null, mh: 20 },
      engineHours: 21,
    }),
    null,
  );
  const err = validateMeterMonotonicity({
    current: { km: null, mh: 20 },
    mh: 19,
  });
  assert.match(err ?? "", /моточасы.*20/);
});

test("joins multiple errors", () => {
  const err = validateMeterMonotonicity({
    current: { km: 100, mh: 50 },
    mileage: 90,
    mh: 40,
    prefix: "unit 1 · ",
  });
  assert.match(err ?? "", /пробег/);
  assert.match(err ?? "", /моточасы/);
});
