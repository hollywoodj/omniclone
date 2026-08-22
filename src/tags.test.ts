import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "./model.ts";
import { buildTagTree, mergeTagRecords, remainingCountForTagTree, remainingCountsForTagTree, renameTagRecord, tagKey, taskHasOnHoldTag, taskHasTag } from "./tags.ts";

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    projectId: "p1",
    tags: [],
    flagged: false,
    completed: false,
    createdAt: partial.id,
    ...partial,
  };
}

test("nested tags include descendant actions", () => {
  const records = mergeTagRecords([
    { name: "Work", color: "#5b6cdb" },
    { name: "Email", parent: "Work", status: "active" },
  ], [
    task({ id: "a", title: "Reply", tags: ["Email"] }),
    task({ id: "b", title: "Plan", tags: ["Work"] }),
  ]);
  const tree = buildTagTree(records);
  assert.equal(tree[0]?.name, "Work");
  assert.equal(tree[0]?.children[0]?.name, "Email");
  assert.equal(taskHasTag(task({ id: "a", title: "Reply", tags: ["Email"] }), "Work", records), true);
  assert.equal(remainingCountForTagTree([
    task({ id: "a", title: "Reply", tags: ["Email"] }),
    task({ id: "b", title: "Done", tags: ["Email"], completed: true }),
  ], "Work", records), 1);
  const rolled = remainingCountsForTagTree([
    task({ id: "a", title: "Reply", tags: ["Email"] }),
    task({ id: "b", title: "Plan", tags: ["Work"] }),
    task({ id: "c", title: "Both", tags: ["Work", "Email"] }),
    task({ id: "d", title: "Done", tags: ["Email"], completed: true }),
  ], records);
  assert.equal(rolled.get(tagKey("Email")), 2);
  assert.equal(rolled.get(tagKey("Work")), 3);
});

test("on-hold tags mark tagged actions unavailable", () => {
  const records = [{ name: "Waiting", status: "onHold" as const }];
  assert.equal(taskHasOnHoldTag(task({ id: "a", title: "Hold", tags: ["Waiting"] }), records), true);
  assert.equal(taskHasOnHoldTag(task({ id: "b", title: "Open", tags: ["Errand"] }), records), false);
});

test("cyclical tag parents do not crash the sidebar tree", () => {
  const tree = buildTagTree([
    { name: "A", parent: "B", status: "active" },
    { name: "B", parent: "A", status: "active" },
  ]);
  assert.equal(tree.length, 2);
});

test("renaming a parent tag keeps children nested", () => {
  const next = renameTagRecord([
    { name: "Work" },
    { name: "Email", parent: "Work" },
  ], "Work", "Office");
  assert.equal(next.find((item) => item.name === "Office")?.name, "Office");
  assert.equal(next.find((item) => item.name === "Email")?.parent, "Office");
});
