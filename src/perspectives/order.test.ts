import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, type CustomPerspective } from "../model.ts";
import { perspectiveHidesSidebar } from "../perspectiveRules.ts";
import {
  applyPerspectiveMove,
  applyPerspectiveReorder,
  orderedPerspectiveIds,
  reorderIds,
  togglePerspectiveFavorite,
  withPerspectiveId,
  withoutPerspectiveId,
} from "./order.ts";

const custom: CustomPerspective[] = [{
  id: "c1",
  name: "Nearby",
  icon: "map-marker-outline",
  color: "#3cb371",
  combinator: "all",
  rules: [],
  structure: "flexible",
  organizeBy: "actions",
  groupBy: "none",
  sortBy: "projects",
  keepSidebarHidden: false,
}];

test("reorderIds moves an item to the target slot", () => {
  assert.deepEqual(reorderIds(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(reorderIds(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
  assert.deepEqual(reorderIds(["a", "b"], "missing", "a"), ["a", "b"]);
});

test("orderedPerspectiveIds keeps saved order and appends new custom perspectives", () => {
  const order = orderedPerspectiveIds(["review", "inbox", "custom:c1"], custom);
  assert.equal(order[0], "review");
  assert.equal(order[1], "inbox");
  assert.ok(order.includes("custom:c1"));
  assert.ok(order.includes("projects"));
});

test("reordering favorites updates bar order without dropping unstarred items", () => {
  const settings = {
    ...defaultSettings,
    perspectiveBarIds: ["inbox", "projects", "tags"],
    perspectiveOrderIds: ["inbox", "projects", "tags", "forecast"],
  };
  const next = applyPerspectiveReorder(settings, [], "tags", "inbox");
  assert.deepEqual(next.perspectiveBarIds, ["tags", "inbox", "projects"]);
  assert.equal(next.perspectiveOrderIds[0], "tags");
});

test("move up/down walks the full list order", () => {
  const settings = {
    ...defaultSettings,
    perspectiveBarIds: ["inbox", "projects"],
    perspectiveOrderIds: ["inbox", "forecast", "projects"],
  };
  const down = applyPerspectiveMove(settings, [], "inbox", 1);
  assert.deepEqual(down.perspectiveOrderIds.slice(0, 3), ["forecast", "inbox", "projects"]);
  assert.deepEqual(down.perspectiveBarIds, ["forecast", "inbox", "projects"].filter((id) => ["inbox", "projects"].includes(id)));
});

test("toggling a favorite keeps list order", () => {
  const settings = {
    ...defaultSettings,
    perspectiveBarIds: ["inbox", "projects"],
    perspectiveOrderIds: ["inbox", "forecast", "projects"],
  };
  const unstarred = togglePerspectiveFavorite(settings, [], "projects");
  assert.deepEqual(unstarred.perspectiveBarIds, ["inbox"]);
  const starred = togglePerspectiveFavorite({ ...settings, perspectiveBarIds: ["inbox"] }, [], "forecast");
  assert.deepEqual(starred.perspectiveBarIds, ["inbox", "forecast"]);
});

test("adding and removing custom perspectives keeps settings in sync", () => {
  const added = withPerspectiveId(defaultSettings, "custom:c1");
  assert.ok(added.perspectiveBarIds.includes("custom:c1"));
  assert.ok(added.perspectiveOrderIds.includes("custom:c1"));
  const removed = withoutPerspectiveId({ ...defaultSettings, ...added }, "custom:c1");
  assert.ok(!removed.perspectiveBarIds.includes("custom:c1"));
  assert.ok(!removed.perspectiveOrderIds.includes("custom:c1"));
});

test("inbox never reveals a content sidebar", () => {
  assert.equal(perspectiveHidesSidebar("inbox", null), true);
  assert.equal(perspectiveHidesSidebar("projects", null), false);
  assert.equal(perspectiveHidesSidebar("forecast", null), false);
  assert.equal(perspectiveHidesSidebar("tags", null), false);
});
