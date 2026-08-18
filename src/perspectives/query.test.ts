import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, type CustomPerspective, type Project, type Task } from "../model.ts";
import { filterVisibleTasks, perspectiveTitle, sidebarPerspectiveFor } from "./query.ts";

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

const projects: Project[] = [
  { id: "p1", name: "Site", color: "#000", note: "", reviewIntervalDays: 7 },
  { id: "p2", name: "Home", folder: "Personal", color: "#000", note: "", reviewIntervalDays: 7 },
];

const baseQuery = {
  projects,
  projectFilter: null as string | null,
  tagFilter: null as string | null,
  folderFilter: null as string | null,
  forecastDay: "2026-08-17",
  focusedProjectId: null as string | null,
  query: "",
  settings: defaultSettings,
  customPerspective: null as CustomPerspective | null,
  pendingCleanupIds: [] as string[],
};

test("inbox hides assigned actions", () => {
  const tasks = [
    task({ id: "a", title: "Inbox", projectId: null }),
    task({ id: "b", title: "Site", projectId: "p1" }),
  ];
  const visible = filterVisibleTasks({ ...baseQuery, tasks, perspective: "inbox" });
  assert.deepEqual(visible.map((item) => item.id), ["a"]);
});

test("projects perspective can filter by project and folder", () => {
  const tasks = [
    task({ id: "a", title: "Site", projectId: "p1" }),
    task({ id: "b", title: "Home", projectId: "p2" }),
  ];
  const byProject = filterVisibleTasks({ ...baseQuery, tasks, perspective: "projects", projectFilter: "p2" });
  assert.deepEqual(byProject.map((item) => item.id), ["b"]);
  const byFolder = filterVisibleTasks({ ...baseQuery, tasks, perspective: "projects", folderFilter: "Personal" });
  assert.deepEqual(byFolder.map((item) => item.id), ["b"]);
});

test("completed perspective includes dropped actions", () => {
  const tasks = [
    task({ id: "a", title: "Done", completed: true }),
    task({ id: "b", title: "Dropped", status: "dropped" }),
    task({ id: "c", title: "Open" }),
  ];
  const visible = filterVisibleTasks({ ...baseQuery, tasks, perspective: "completed" });
  assert.deepEqual(visible.map((item) => item.id), ["a", "b"]);
});

test("search matches title, note, and tags", () => {
  const tasks = [
    task({ id: "a", title: "Write brief" }),
    task({ id: "b", title: "Call", note: "brief tomorrow" }),
    task({ id: "c", title: "Shop", tags: ["errand"] }),
  ];
  const visible = filterVisibleTasks({ ...baseQuery, tasks, perspective: "projects", query: "brief" });
  assert.deepEqual(visible.map((item) => item.id), ["a", "b"]);
});

test("lingering completed actions stay visible until clean up", () => {
  const tasks = [
    task({ id: "a", title: "Done", completed: true }),
    task({ id: "b", title: "Open" }),
  ];
  const visible = filterVisibleTasks({
    ...baseQuery,
    tasks,
    perspective: "projects",
    pendingCleanupIds: ["a"],
  });
  assert.deepEqual(visible.map((item) => item.id), ["a", "b"]);
});

test("perspective titles follow the current filter", () => {
  assert.equal(perspectiveTitle({
    perspective: "projects",
    customPerspective: null,
    projects,
    projectFilter: "p1",
    folderFilter: null,
    tagFilter: null,
  }), "Site");
  assert.equal(perspectiveTitle({
    perspective: "tags",
    customPerspective: null,
    projects,
    projectFilter: null,
    folderFilter: null,
    tagFilter: "home",
  }), "home");
});

test("custom perspectives grouped by tag use the Tags sidebar", () => {
  const custom: CustomPerspective = {
    id: "c1",
    name: "Errands",
    icon: "star",
    color: "#000",
    combinator: "all",
    rules: [],
    structure: "organized",
    organizeBy: "actions",
    groupBy: "tag",
    sortBy: "title",
    keepSidebarHidden: false,
  };
  assert.equal(sidebarPerspectiveFor("custom:c1", custom), "tags");
  assert.equal(sidebarPerspectiveFor("inbox", null), "inbox");
});

test("selecting a parent tag includes descendant-tagged actions", () => {
  const tasks = [
    task({ id: "a", title: "Reply", tags: ["Email"] }),
    task({ id: "b", title: "Shop", tags: ["Errand"] }),
  ];
  const visible = filterVisibleTasks({
    ...baseQuery,
    tasks,
    perspective: "tags",
    tagFilter: "Work",
    tagRecords: [{ name: "Work" }, { name: "Email", parent: "Work" }],
  });
  assert.deepEqual(visible.map((item) => item.id), ["a"]);
});
