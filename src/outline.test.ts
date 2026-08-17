import assert from "node:assert/strict";
import test from "node:test";
import type { Project, Task } from "./model.ts";
import { projectDueForReview } from "./dates.ts";
import {
  applyRepeat,
  buildFolderTree,
  convertActionToProject,
  flattenTasks,
  hydrateProjectFolder,
  indentTasks,
  isBlockedSequential,
  moveSiblings,
  outdentTasks,
  projectDisplayName,
  projectIsStalled,
  skipReviewTimestamp,
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

test("First Available keeps only the next action in a parallel group", () => {
  const tasks = [task({ id: "a", title: "First" }), task({ id: "b", title: "Second" })];
  const parallel = project({ type: "parallel" });
  assert.equal(taskMatchesView(tasks[0]!, "firstAvailable", { tasks, projects: [parallel] }), true);
  assert.equal(taskMatchesView(tasks[1]!, "firstAvailable", { tasks, projects: [parallel] }), false);
  assert.equal(taskMatchesView(tasks[1]!, "available", { tasks, projects: [parallel] }), true);
});

test("on-hold and dropped actions leave Available", () => {
  const held = task({ id: "a", title: "Hold", status: "onHold" });
  const dropped = task({ id: "b", title: "Drop", status: "dropped" });
  const projects = [project()];
  assert.equal(taskMatchesView(held, "available", { tasks: [held], projects }), false);
  assert.equal(taskMatchesView(held, "remaining", { tasks: [held], projects }), true);
  assert.equal(taskMatchesView(dropped, "remaining", { tasks: [dropped], projects }), false);
  assert.equal(taskMatchesView(dropped, "completed", { tasks: [dropped], projects }), true);
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
  assert.equal(projectIsStalled(project(), [task({ id: "a", title: "Dropped", status: "dropped" })]), true);
});

test("flatten still shows remaining children when the parent is filtered out", () => {
  const tasks = [task({ id: "child", title: "Open", parentId: "missing" })];
  assert.deepEqual(flattenTasks(tasks).map((item) => item.id), ["child"]);
});

test("hydrates OmniFocus folder prefixes into sidebar folders", () => {
  const nested = hydrateProjectFolder(project({ name: "Work : Website" }));
  assert.equal(nested.folder, "Work");
  assert.equal(projectDisplayName(nested), "Website");
  const tree = buildFolderTree([nested], ["Personal"]);
  assert.equal(tree.roots.map((node) => node.name).join("|"), "Personal|Work");
  assert.equal(tree.roots.find((node) => node.path === "Work")?.projects[0]?.name, "Website");
});

test("converting an action group turns it into a project", () => {
  const tasks = [
    task({ id: "a", title: "Launch site", note: "Ship it" }),
    task({ id: "b", title: "Write copy", parentId: "a" }),
  ];
  const result = convertActionToProject(tasks, [project()], "a", "#8f57c8");
  assert.ok(result);
  assert.equal(result.project.name, "Launch site");
  assert.equal(result.tasks.find((item) => item.id === "a"), undefined);
  assert.equal(result.tasks.find((item) => item.id === "b")?.projectId, result.project.id);
  assert.equal(result.tasks.find((item) => item.id === "b")?.parentId ?? null, null);
});

test("skip review postpones until tomorrow", () => {
  const now = new Date(2026, 7, 17, 15, 0, 0);
  const skipped = { ...project({ reviewIntervalDays: 7 }), lastReviewedAt: skipReviewTimestamp(project({ reviewIntervalDays: 7 }), now) };
  assert.equal(projectDueForReview(skipped, now), false);
  assert.equal(projectDueForReview(skipped, new Date(2026, 7, 18, 9, 0, 0)), true);
});
