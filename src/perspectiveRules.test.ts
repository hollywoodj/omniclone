import assert from "node:assert/strict";
import test from "node:test";
import type { CustomPerspective, Project, Task } from "./model.ts";
import { taskMatchesCustomPerspective } from "./perspectiveRules.ts";

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

function project(partial: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Site",
    color: "#000",
    note: "",
    reviewIntervalDays: 7,
    ...partial,
  };
}

function perspective(rules: CustomPerspective["rules"]): CustomPerspective {
  return {
    id: "custom",
    name: "Custom",
    icon: "star-four-points-outline",
    color: "#000",
    combinator: "all",
    rules,
    structure: "flexible",
    organizeBy: "actions",
    groupBy: "none",
    sortBy: "projects",
    keepSidebarHidden: false,
  };
}

test("contents rules match duration, flag, type, stalled, on hold, and dropped", () => {
  const sequential = project({ type: "sequential" });
  const held = project({ status: "onHold" });
  const dropped = project({ status: "dropped" });
  const stalled = project();
  const open = task({ id: "a", title: "Open", estimatedMinutes: 15, flagged: false });
  const flagged = task({ id: "b", title: "Flag", flagged: true });
  const seqTask = task({ id: "c", title: "Seq" });
  const holdTask = task({ id: "d", title: "Hold" });
  const dropTask = task({ id: "e", title: "Drop" });
  const stalledTask = task({ id: "f", title: "Stalled", completed: true });
  const context = {
    tasks: [open, flagged, seqTask, holdTask, dropTask, stalledTask],
    projects: [project(), sequential, held, dropped, stalled],
  };
  assert.equal(taskMatchesCustomPerspective(open, perspective([{ id: "r", kind: "hasDuration" }]), context), true);
  assert.equal(taskMatchesCustomPerspective(open, perspective([{ id: "r", kind: "noDuration" }]), context), false);
  assert.equal(taskMatchesCustomPerspective(open, perspective([{ id: "r", kind: "unflagged" }]), context), true);
  assert.equal(taskMatchesCustomPerspective(flagged, perspective([{ id: "r", kind: "unflagged" }]), context), false);
  assert.equal(taskMatchesCustomPerspective(seqTask, perspective([{ id: "r", kind: "projectType", projectType: "sequential" }]), { tasks: [seqTask], projects: [sequential] }), true);
  assert.equal(taskMatchesCustomPerspective(open, perspective([{ id: "r", kind: "projectType", projectType: "sequential" }]), context), false);
  assert.equal(taskMatchesCustomPerspective(stalledTask, perspective([{ id: "r", kind: "stalled" }]), { tasks: [stalledTask], projects: [stalled] }), true);
  assert.equal(taskMatchesCustomPerspective(holdTask, perspective([{ id: "r", kind: "onHold" }]), { tasks: [holdTask], projects: [held] }), true);
  assert.equal(taskMatchesCustomPerspective(dropTask, perspective([{ id: "r", kind: "dropped" }]), { tasks: [dropTask], projects: [dropped] }), true);
});
