import { test } from "node:test";
import assert from "node:assert/strict";
import { toAtomic, fromAtomic, mulUsd } from "./index.ts";

test("toAtomic / fromAtomic sin floats", () => {
  assert.equal(toAtomic("1.000137", 6), 1000137n);
  assert.equal(toAtomic("0.01", 6), 10000n);
  assert.equal(toAtomic("2100", 18), 2100n * 10n ** 18n);
  assert.equal(fromAtomic(1000137n, 6), "1.000137");
  assert.equal(fromAtomic(10000n, 6), "0.01");
  assert.equal(fromAtomic(5n, 6), "0.000005");
  assert.equal(mulUsd("0.25", 3), "0.75");
  assert.throws(() => toAtomic("1,5", 6));
});
