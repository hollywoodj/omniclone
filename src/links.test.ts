import assert from "node:assert/strict";
import test from "node:test";
import {
  addDraftFromUrl,
  applyOmniCloneAdd,
  applyOmniClonePaste,
  attachmentLabelFromUrl,
  buildXSuccessUrl,
  documentTitle,
  formatUrlDate,
  normalizeAttachmentUrl,
  parseOmniCloneUrl,
  parsePasteTarget,
  resolveOmniCloneOpen,
  taskUrl,
} from "./links.ts";
import type { Project, Task } from "./model.ts";

function project(partial: Partial<Project> & { id: string; name: string }): Project {
  return { color: "#000", note: "", reviewIntervalDays: 7, ...partial };
}

function task(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    projectId: null,
    tags: [],
    flagged: false,
    completed: false,
    createdAt: partial.id,
    ...partial,
  };
}

test("parses omniclone task and perspective URLs", () => {
  assert.deepEqual(parseOmniCloneUrl("omniclone://task/abc"), { kind: "task", id: "abc" });
  assert.deepEqual(parseOmniCloneUrl("omniclone:///task/abc"), { kind: "task", id: "abc" });
  assert.deepEqual(parseOmniCloneUrl("omniclone://perspective/inbox"), { kind: "perspective", id: "inbox" });
  assert.deepEqual(parseOmniCloneUrl("#/task/hello%20world"), { kind: "task", id: "hello world" });
  assert.equal(parseOmniCloneUrl("https://example.com"), null);
});

test("resolves open-url targets against the current library", () => {
  assert.deepEqual(resolveOmniCloneOpen("omniclone://perspective/flagged", []), { kind: "perspective", id: "flagged" });
  assert.deepEqual(
    resolveOmniCloneOpen("omniclone://task/a1", [{ id: "a1", projectId: "p1" }]),
    { kind: "task", id: "a1", projectId: "p1" },
  );
  assert.equal(resolveOmniCloneOpen("omniclone://task/missing", [{ id: "a1", projectId: "p1" }]), null);
  assert.equal(resolveOmniCloneOpen("omniclone:///add?name=Milk&autosave=true", []), null);
});

test("parses hash add URLs used in the web preview", () => {
  const parsed = parseOmniCloneUrl("#/add?name=Milk&autosave=true");
  assert.equal(parsed?.kind, "add");
  if (parsed?.kind !== "add") return;
  assert.equal(parsed.name, "Milk");
  assert.equal(parsed.autosave, true);
});

test("parses Notebook-style add and paste URLs", () => {
  assert.deepEqual(parseOmniCloneUrl("omniclone:///add?name=&note=&due=&autosave=true"), {
    kind: "add",
    name: "",
    note: undefined,
    due: undefined,
    defer: undefined,
    flag: false,
    project: undefined,
    context: undefined,
    estimate: undefined,
    autosave: true,
    xSuccess: undefined,
  });
  assert.deepEqual(parseOmniCloneUrl("omniclone:///paste?target=inbox&content="), {
    kind: "paste",
    target: { type: "inbox" },
    content: "",
    index: undefined,
  });
});

test("parses OmniFocus add parameters including x-callback-url", () => {
  const parsed = parseOmniCloneUrl(
    "omniclone://x-callback-url/add?name=My%20shiny%20new%20task&note=From%20Notebook&due=2026-08-19%205pm&defer=jun%2025%208am&flag=true&project=Website&context=errands&estimate=30m&autosave=true&x-success=notebook:///",
  );
  assert.equal(parsed?.kind, "add");
  if (parsed?.kind !== "add") return;
  assert.equal(parsed.name, "My shiny new task");
  assert.equal(parsed.note, "From Notebook");
  assert.equal(parsed.due, "2026-08-19 5pm");
  assert.equal(parsed.defer, "jun 25 8am");
  assert.equal(parsed.flag, true);
  assert.equal(parsed.project, "Website");
  assert.equal(parsed.context, "errands");
  assert.equal(parsed.estimate, "30m");
  assert.equal(parsed.autosave, true);
  assert.equal(parsed.xSuccess, "notebook:///");
});

test("parses paste targets for inbox, projects, tasks, and folders", () => {
  assert.deepEqual(parsePasteTarget("inbox"), { type: "inbox" });
  assert.deepEqual(parsePasteTarget("projects"), { type: "projects" });
  assert.deepEqual(parsePasteTarget("/task/abc"), { type: "task", value: "abc" });
  assert.deepEqual(parsePasteTarget("task/Website"), { type: "task", value: "Website" });
  assert.deepEqual(parsePasteTarget("/folder/Personal"), { type: "folder", value: "Personal" });
  const parsed = parseOmniCloneUrl("omniclone:///paste?target=%2Ftask%2FWebsite&content=-%20Launch&index=-1");
  assert.equal(parsed?.kind, "paste");
  if (parsed?.kind !== "paste") return;
  assert.deepEqual(parsed.target, { type: "task", value: "Website" });
  assert.equal(parsed.content, "- Launch");
  assert.equal(parsed.index, -1);
});

test("formats URL due strings into OmniClone labels", () => {
  const now = new Date(2026, 7, 19, 9, 0, 0);
  assert.equal(formatUrlDate("2026-08-19 5pm", now), "Today, 5:00 PM");
  assert.equal(formatUrlDate("jun 25 8am", now), "Jun 25, 8:00 AM");
});

test("creates an inbox action from /add with autosave", () => {
  const now = new Date(2026, 7, 19, 9, 0, 0);
  const parsed = parseOmniCloneUrl("omniclone:///add?name=Pick%20up%20milk&note=You%20gotta&due=2026-08-19%205pm&autosave=true");
  assert.equal(parsed?.kind, "add");
  if (parsed?.kind !== "add") return;
  const result = applyOmniCloneAdd([], [], parsed, [], { idFactory: (prefix) => `${prefix}-1`, now });
  assert.equal(result.task.title, "Pick up milk");
  assert.equal(result.task.note, "You gotta");
  assert.equal(result.task.due, "Today, 5:00 PM");
  assert.equal(result.task.projectId, null);
  assert.equal(result.task.flagged, false);
});

test("matches project, context, flag, and estimate on add", () => {
  const now = new Date(2026, 7, 19, 9, 0, 0);
  const parsed = parseOmniCloneUrl("omniclone:///add?name=Ship&flag=true&project=website&context=Phone&estimate=1h&defer=jun%2025%208am&autosave=true");
  assert.equal(parsed?.kind, "add");
  if (parsed?.kind !== "add") return;
  const projects = [project({ id: "p1", name: "Website" })];
  const draft = addDraftFromUrl(parsed, projects, [{ name: "phone" }], now);
  assert.equal(draft.projectId, "p1");
  assert.deepEqual(draft.tags, ["phone"]);
  assert.equal(draft.flagged, true);
  assert.equal(draft.estimatedMinutes, 60);
  assert.equal(draft.defer, "Jun 25, 8:00 AM");
});

test("x-success callback appends omniclone:///task/{id}", () => {
  assert.equal(taskUrl("mbp0SlWkvqq"), "omniclone:///task/mbp0SlWkvqq");
  const url = buildXSuccessUrl("notebook:///", "mbp0SlWkvqq");
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "notebook:");
  assert.equal(parsed.searchParams.get("result"), "omniclone:///task/mbp0SlWkvqq");
});

test("pastes TaskPaper into inbox, a named project, a folder, or a parent task", () => {
  const now = new Date(2026, 7, 19, 9, 0, 0);
  const projects = [
    project({ id: "p1", name: "Website" }),
    project({ id: "p2", name: "Garden", folder: "Personal" }),
  ];
  const existing = [task({ id: "parent", title: "Launch", projectId: "p1" })];
  const idFactory = (prefix: string) => `${prefix}-x`;

  const inbox = applyOmniClonePaste([], projects, {
    kind: "paste",
    target: { type: "inbox" },
    content: "- Buy milk",
  }, { idFactory, now });
  assert.equal(inbox.created[0]?.title, "Buy milk");
  assert.equal(inbox.created[0]?.projectId, null);

  const intoProject = applyOmniClonePaste([], projects, {
    kind: "paste",
    target: { type: "task", value: "Website" },
    content: "- Write copy",
  }, { idFactory, now });
  assert.equal(intoProject.created[0]?.projectId, "p1");
  assert.equal(intoProject.created[0]?.parentId, null);

  const intoFolder = applyOmniClonePaste([], projects, {
    kind: "paste",
    target: { type: "folder", value: "Personal" },
    content: "- Water tomatoes",
  }, { idFactory, now });
  assert.equal(intoFolder.created[0]?.projectId, "p2");

  const intoTask = applyOmniClonePaste(existing, projects, {
    kind: "paste",
    target: { type: "task", value: "parent" },
    content: "- Draft homepage",
  }, { idFactory, now });
  assert.equal(intoTask.created[0]?.parentId, "parent");
  assert.equal(intoTask.created[0]?.projectId, "p1");
});

test("paste without content uses the clipboard", () => {
  const result = applyOmniClonePaste([], [], {
    kind: "paste",
    target: { type: "inbox" },
  }, { clipboard: "- From clipboard", idFactory: (prefix) => `${prefix}-c` });
  assert.equal(result.created[0]?.title, "From clipboard");
});

test("window title uses the perspective or focused name", () => {
  assert.equal(documentTitle("Projects"), "Projects — OmniClone");
  assert.equal(documentTitle("Projects", "Website"), "Website — OmniClone");
});

test("attachment URLs gain a scheme and a host label", () => {
  assert.equal(normalizeAttachmentUrl("example.com/file"), "https://example.com/file");
  assert.equal(normalizeAttachmentUrl("https://notes.example/a"), "https://notes.example/a");
  assert.equal(attachmentLabelFromUrl("https://www.example.com/path"), "example.com");
});
