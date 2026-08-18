import assert from "node:assert/strict";
import test from "node:test";
import type { CustomPerspective, Project, Task } from "../model.ts";
import {
  applyCompleteToggle,
  applyFlagToggle,
  applySidebarDrop,
  applyTaskPatch,
  deleteTaskIds,
  duplicateTasksByIds,
  pendingDeleteCopy,
  pruneProjectFromPerspectives,
  removeProjectFromLibrary,
} from "./mutations.ts";

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

test("completing a parent also completes remaining children", () => {
  const tasks = [
    task({ id: "a", title: "Parent" }),
    task({ id: "b", title: "Child", parentId: "a" }),
  ];
  const now = new Date("2026-08-17T15:00:00");
  const next = applyCompleteToggle(tasks, ["a"], now);
  assert.equal(next.find((item) => item.id === "a")?.completed, true);
  assert.equal(next.find((item) => item.id === "b")?.completed, true);
  assert.equal(next.find((item) => item.id === "a")?.completedAt, now.toISOString());
});

test("completing a repeating action advances dates instead of checking it off", () => {
  const tasks = [task({ id: "a", title: "Daily", repeat: "daily", due: "Today" })];
  const now = new Date(2026, 7, 17, 15, 0, 0);
  const next = applyCompleteToggle(tasks, ["a"], now);
  const updated = next.find((item) => item.id === "a");
  assert.equal(updated?.completed, false);
  assert.equal(updated?.due, "Tomorrow");
});

test("patching completion stamps or clears completedAt", () => {
  const tasks = [task({ id: "a", title: "Open" })];
  const now = new Date("2026-08-17T15:00:00");
  const done = applyTaskPatch(tasks, "a", { completed: true }, now);
  assert.equal(done[0]?.completedAt, now.toISOString());
  const undone = applyTaskPatch(done, "a", { completed: false }, now);
  assert.equal(undone[0]?.completedAt, undefined);
});

test("flag toggle uses the mixed-selection majority rule", () => {
  const tasks = [
    task({ id: "a", title: "A", flagged: true }),
    task({ id: "b", title: "B", flagged: false }),
  ];
  const next = applyFlagToggle(tasks, ["a", "b"]);
  assert.equal(next.every((item) => item.flagged), true);
});

test("duplicate inserts copies after each original and clears completion", () => {
  const tasks = [
    task({ id: "a", title: "A", completed: true, completedAt: "stamp", importKey: "old" }),
    task({ id: "b", title: "B" }),
  ];
  const now = new Date("2026-08-17T15:00:00");
  const result = duplicateTasksByIds(tasks, ["a"], () => "copy", now);
  assert.deepEqual(result.tasks.map((item) => item.id), ["a", "copy", "b"]);
  assert.equal(result.copies[0]?.completed, false);
  assert.equal(result.copies[0]?.importKey, undefined);
  assert.equal(result.copies[0]?.createdAt, now.toISOString());
});

test("deleting a project removes its actions and contained-in rules", () => {
  const projects: Project[] = [
    { id: "p1", name: "Site", color: "#000", note: "", reviewIntervalDays: 7 },
    { id: "p2", name: "Home", color: "#000", note: "", reviewIntervalDays: 7 },
  ];
  const tasks = [task({ id: "a", title: "Site" }), task({ id: "b", title: "Home", projectId: "p2" })];
  const custom: CustomPerspective[] = [{
    id: "c1",
    name: "Work",
    icon: "star",
    color: "#000",
    combinator: "all",
    rules: [{ id: "r1", kind: "containedIn", projectIds: ["p1", "p2"] }],
    structure: "flexible",
    organizeBy: "actions",
    groupBy: "none",
    sortBy: "projects",
    keepSidebarHidden: false,
  }];
  const next = removeProjectFromLibrary(projects, tasks, custom, "p1");
  assert.deepEqual(next.projects.map((item) => item.id), ["p2"]);
  assert.deepEqual(next.tasks.map((item) => item.id), ["b"]);
  assert.deepEqual(next.customPerspectives[0]?.rules[0]?.projectIds, ["p2"]);
});

test("deleting an action also removes descendants", () => {
  const tasks = [
    task({ id: "a", title: "Parent" }),
    task({ id: "b", title: "Child", parentId: "a" }),
    task({ id: "c", title: "Other" }),
  ];
  const result = deleteTaskIds(tasks, ["a"]);
  assert.deepEqual(result.removed.sort(), ["a", "b"]);
  assert.deepEqual(result.remaining.map((item) => item.id), ["c"]);
});

test("pending delete copy describes projects and multi-select", () => {
  assert.equal(pendingDeleteCopy({
    projectName: "Site",
    projectActionCount: 2,
    taskCount: 0,
    deletingProject: true,
  }).message, "This project and 2 actions will be permanently removed from your local database.");
  const multi = pendingDeleteCopy({
    projectActionCount: 0,
    taskCount: 2,
    taskTitle: "A",
    deletingProject: false,
  });
  assert.equal(multi.title, "2 actions");
});

test("dropping on a tag assigns it and folders take the first project", () => {
  const tasks = [task({ id: "a", title: "Inbox", projectId: null })];
  const tagged = applySidebarDrop(tasks, [ { id: "p1", name: "Site", color: "#000", note: "", reviewIntervalDays: 7 } ], ["a"], { kind: "tag", tag: "errand" });
  assert.deepEqual(tagged[0]?.tags, ["errand"]);
  const moved = applySidebarDrop(tagged, [
    { id: "p2", name: "Home", folder: "Personal", color: "#000", note: "", reviewIntervalDays: 7 },
    { id: "p1", name: "Site", color: "#000", note: "", reviewIntervalDays: 7 },
  ], ["a"], { kind: "folder", folder: "Personal" });
  assert.equal(moved[0]?.projectId, "p2");
  const inbox = applySidebarDrop(moved, [], ["a"], { kind: "inbox" });
  assert.equal(inbox[0]?.projectId, null);
});

test("pruning a missing project is a no-op for unrelated rules", () => {
  const custom: CustomPerspective[] = [{
    id: "c1",
    name: "Flagged",
    icon: "star",
    color: "#000",
    combinator: "all",
    rules: [{ id: "r1", kind: "flagged" }],
    structure: "flexible",
    organizeBy: "actions",
    groupBy: "none",
    sortBy: "projects",
    keepSidebarHidden: false,
  }];
  const next = pruneProjectFromPerspectives(custom, "p1");
  assert.equal(next[0]?.rules[0]?.kind, "flagged");
});
