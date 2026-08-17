import assert from "node:assert/strict";
import test from "node:test";
import type { Project, Task } from "./model.ts";
import {
  applyRepeat,
  flattenTasks,
  indentTasks,
  isBlockedSequential,
  moveSiblings,
  outdentTasks,
  projectIsStalled,
  taskMatchesView,
  toTaskPaper,
} from "./outline.ts";

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

const project = (partial: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Site",
  color: "#000",
  note: "",
  reviewIntervalDays: 7,
  ...partial,
});

test("indent nests an action under the previous sibling", () => {
  const tasks = [task({ id: "a", title: "Parent" }), task({ id: "b", title: "Child" })];
  const nested = indentTasks(tasks, ["b"]);
  assert.equal(nested.find((item) => item.id === "b")?.parentId, "a");
  assert.deepEqual(flattenTasks(nested).map((item) => item.id), ["a", "b"]);
});

test("outdent returns a child to the parent level after its group", () => {
  const tasks = [
    task({ id: "a", title: "Parent", sortOrder: 0 }),
    task({ id: "b", title: "Child", parentId: "a", sortOrder: 0 }),
  ];
  const next = outdentTasks(tasks, ["b"]);
  const child = next.find((item) => item.id === "b");
  assert.equal(child?.parentId ?? null, null);
  assert.deepEqual(flattenTasks(next).map((item) => item.id), ["a", "b"]);
});

test("move siblings reorders within the same group", () => {
  const tasks = [task({ id: "a", title: "A", sortOrder: 0 }), task({ id: "b", title: "B", sortOrder: 1 })];
  const down = moveSiblings(tasks, ["a"], 1);
  assert.deepEqual(flattenTasks(down).map((item) => item.id), ["b", "a"]);
  const up = moveSiblings(down, ["a"], -1);
  assert.deepEqual(flattenTasks(up).map((item) => item.id), ["a", "b"]);
});

test("sequential projects hide later remaining actions from Available", () => {
  const tasks = [
    task({ id: "a", title: "First" }),
    task({ id: "b", title: "Second" }),
  ];
  const sequential = project({ type: "sequential" });
  assert.equal(isBlockedSequential(tasks[1]!, tasks, [sequential]), true);
  assert.equal(taskMatchesView(tasks[1]!, "available", { tasks, projects: [sequential] }), false);
  assert.equal(taskMatchesView(tasks[1]!, "remaining", { tasks, projects: [sequential] }), true);
  assert.equal(taskMatchesView(tasks[0]!, "available", { tasks, projects: [sequential] }), true);
});

test("on-hold and dropped projects leave Available", () => {
  const item = task({ id: "a", title: "Hold" });
  assert.equal(taskMatchesView(item, "available", { tasks: [item], projects: [project({ status: "onHold" })] }), false);
  assert.equal(taskMatchesView(item, "remaining", { tasks: [item], projects: [project({ status: "onHold" })] }), true);
  assert.equal(taskMatchesView(item, "remaining", { tasks: [item], projects: [project({ status: "dropped" })] }), false);
});

test("repeating a daily action bumps the due date instead of completing", () => {
  const now = new Date(2026, 7, 17, 15, 0, 0);
  const next = applyRepeat(task({ id: "a", title: "Water", due: "Today", repeat: "daily" }), now);
  assert.equal(next?.completed, false);
  assert.equal(next?.due, "Tomorrow");
});

test("copies nested actions as TaskPaper", () => {
  const tasks = [
    task({ id: "a", title: "Launch", flagged: true }),
    task({ id: "b", title: "Write copy", parentId: "a", due: "Today", tags: ["writing"] }),
  ];
  const paper = toTaskPaper(tasks, tasks, [project({ name: "Website" })]);
  assert.match(paper, /Website:/);
  assert.match(paper, /\t- Launch @flagged/);
  assert.match(paper, /\t\t- Write copy @due\(Today\) @tags\(writing\)/);
});

test("a project with no remaining actions is stalled", () => {
  assert.equal(projectIsStalled(project(), [task({ id: "a", title: "Done", completed: true })]), true);
  assert.equal(projectIsStalled(project(), [task({ id: "a", title: "Open" })]), false);
});

test("flatten still shows remaining children when the parent is filtered out", () => {
  const tasks = [task({ id: "child", title: "Open", parentId: "missing" })];
  assert.deepEqual(flattenTasks(tasks).map((item) => item.id), ["child"]);
});
