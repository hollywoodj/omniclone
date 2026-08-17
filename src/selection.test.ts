import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClick,
  applyMarquee,
  applyMove,
  applySelectAll,
  emptySelection,
  idsIntersectingRect,
  neighborAfterDelete,
  outlineTaskIds,
  pruneSelection,
  rangeIds,
  rectsIntersect,
  singleSelection,
} from "./selection.ts";
import type { Project, Task } from "./model.ts";

const ids = ["a", "b", "c", "d", "e"];

test("shift-click selects the inclusive range from the anchor", () => {
  const selected = applyClick(singleSelection("b"), ids, "d", { shift: true });
  assert.deepEqual(selected.ids, ["b", "c", "d"]);
  assert.equal(selected.anchorId, "b");
  assert.equal(selected.headId, "d");
});

test("shift-click backwards still keeps the original anchor", () => {
  const selected = applyClick(singleSelection("d"), ids, "b", { shift: true });
  assert.deepEqual(selected.ids, ["b", "c", "d"]);
  assert.equal(selected.anchorId, "d");
  assert.equal(selected.headId, "b");
});

test("cmd-click toggles a row without dropping the rest of the selection", () => {
  const withC = applyClick(singleSelection("a"), ids, "c", { toggle: true });
  assert.deepEqual(withC.ids, ["a", "c"]);
  const withoutA = applyClick(withC, ids, "a", { toggle: true });
  assert.deepEqual(withoutA.ids, ["c"]);
});

test("plain click replaces the selection", () => {
  const selected = applyClick({ ids: ["a", "b", "c"], anchorId: "a", headId: "c" }, ids, "e");
  assert.deepEqual(selected, singleSelection("e"));
});

test("select all uses the current outline order", () => {
  const selected = applySelectAll(ids);
  assert.deepEqual(selected.ids, ids);
  assert.equal(selected.anchorId, "a");
  assert.equal(selected.headId, "e");
});

test("shift-arrow extends from the anchor while moving the head", () => {
  const down = applyMove(singleSelection("b"), ids, "down", true);
  assert.deepEqual(down.ids, ["b", "c"]);
  const up = applyMove(down, ids, "up", true);
  assert.deepEqual(up.ids, ["b"]);
  assert.equal(up.anchorId, "b");
});

test("arrow without shift collapses to a single row", () => {
  const moved = applyMove({ ids: ["a", "b", "c"], anchorId: "a", headId: "c" }, ids, "down");
  assert.deepEqual(moved, singleSelection("d"));
});

test("marquee replace and additive union", () => {
  const replaced = applyMarquee(singleSelection("a"), ["c", "d"], false);
  assert.deepEqual(replaced.ids, ["c", "d"]);
  const added = applyMarquee(singleSelection("a"), ["c", "d"], true);
  assert.deepEqual(added.ids, ["a", "c", "d"]);
});

test("range helper is inclusive and ignores missing endpoints safely", () => {
  assert.deepEqual(rangeIds(ids, "b", "d"), ["b", "c", "d"]);
  assert.deepEqual(rangeIds(ids, "missing", "c"), ["c"]);
  assert.deepEqual(rangeIds(ids, "b", "missing"), ["b"]);
});

test("rects intersecting a drag box return covered row ids", () => {
  assert.equal(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 4, height: 4 }), true);
  const hits = idsIntersectingRect([
    { id: "a", rect: { x: 0, y: 0, width: 100, height: 20 } },
    { id: "b", rect: { x: 0, y: 20, width: 100, height: 20 } },
    { id: "c", rect: { x: 0, y: 40, width: 100, height: 20 } },
  ], { x: 10, y: 18, width: 30, height: 10 });
  assert.deepEqual(hits, ["a", "b"]);
});

test("pruning drops ids that left the current outline", () => {
  const pruned = pruneSelection({ ids: ["a", "gone", "c"], anchorId: "gone", headId: "c" }, ["a", "c"]);
  assert.deepEqual(pruned.ids, ["a", "c"]);
  assert.equal(pruned.anchorId, "a");
  assert.equal(pruned.headId, "c");
});

test("neighbor after delete follows previous and next directions", () => {
  assert.equal(neighborAfterDelete(ids, ["c"], "next"), "d");
  assert.equal(neighborAfterDelete(ids, ["c"], "previous"), "b");
  assert.equal(neighborAfterDelete(ids, ["a", "b"], "next"), "c");
  assert.equal(neighborAfterDelete(ids, ids, "menu"), null);
});

test("outline order follows project grouping used by the outline", () => {
  const projects: Project[] = [
    { id: "p2", name: "Later", color: "#000", note: "", reviewIntervalDays: 7 },
    { id: "p1", name: "First", color: "#000", note: "", reviewIntervalDays: 7 },
  ];
  const tasks: Task[] = [
    { id: "t-inbox", title: "Inbox", projectId: null, tags: [], flagged: false, completed: false, createdAt: "" },
    { id: "t2", title: "Second project", projectId: "p2", tags: [], flagged: false, completed: false, createdAt: "" },
    { id: "t1", title: "First project", projectId: "p1", tags: [], flagged: false, completed: false, createdAt: "" },
  ];
  assert.deepEqual(outlineTaskIds({
    tasks,
    projects,
    perspective: "projects",
    projectFilter: null,
  }), ["t2", "t1"]);
  assert.deepEqual(outlineTaskIds({
    tasks: tasks.filter((task) => task.projectId === null),
    projects,
    perspective: "inbox",
    projectFilter: null,
  }), ["t-inbox"]);
  assert.equal(emptySelection.ids.length, 0);
});
