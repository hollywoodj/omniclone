import assert from "node:assert/strict";
import test from "node:test";
import { findTypeSelectMatch, nextTypeSelectQuery } from "./typeSelect.ts";

const items = [
  { id: "a", title: "Buy milk" },
  { id: "b", title: "Call Alex" },
  { id: "c", title: "Book flights" },
];
const order = ["a", "b", "c"];

test("type-to-select prefers a prefix match from the next row", () => {
  assert.equal(findTypeSelectMatch(items, "b", order, 1), "c");
  assert.equal(findTypeSelectMatch(items, "call", order, 0), "b");
  assert.equal(findTypeSelectMatch(items, "fl", order, 0), "c");
});

test("type-to-select wraps and falls back to a contains match", () => {
  assert.equal(findTypeSelectMatch(items, "milk", order, 1), "a");
  assert.equal(findTypeSelectMatch(items, "zzz", order, 0), null);
});

test("type-select buffer resets after the timeout", () => {
  const first = nextTypeSelectQuery({ query: "", at: 0 }, "b", 1000);
  const continued = nextTypeSelectQuery(first, "o", 1400);
  const reset = nextTypeSelectQuery(continued, "c", 3000);
  assert.equal(continued.query, "bo");
  assert.equal(reset.query, "c");
});
