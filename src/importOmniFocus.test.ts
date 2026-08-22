import assert from "node:assert/strict";
import test from "node:test";
import { applyOmniFocusImport, formatOmniFocusDate, parseOmniFocusFile } from "./importOmniFocus.ts";

const now = new Date("2026-08-17T15:00:00-04:00");

function bytes(value: string, encoding: BufferEncoding = "utf8") {
  return new Uint8Array(Buffer.from(value, encoding));
}

test("formats OmniFocus timestamps into OmniClone due labels", () => {
  assert.equal(formatOmniFocusDate("2026-08-17 00:00:00 -0400", now), "Today");
  assert.equal(formatOmniFocusDate("2026-08-17 17:00:00 -0400", now), "Today, 5:00 PM");
  assert.equal(formatOmniFocusDate("2026-08-18 00:00:00 -0400", now), "Tomorrow");
  assert.equal(formatOmniFocusDate("2026-08-16 00:00:00 -0400", now), "Yesterday");
  assert.equal(formatOmniFocusDate("2026-06-12 12:30:00 -0400", now), "Jun 12, 12:30 PM");
  assert.equal(formatOmniFocusDate("2017-06-12 00:00:00 +0000", now), "Jun 12, 2017");
});

test("imports a realistic OmniFocus CSV with folders, inbox, tags, and status", () => {
  const csv = [
    "Task ID,Type,Name,Status,Project,Context,Start Date,Due Date,Completion Date,Duration,Flagged,Notes,Tags",
    'a1,Folder,Work,active,,,,,,,,,',
    'p1,Project,Website,active,Work,,,,,,,Kickoff the public site.,',
    't1,Action,Write homepage copy,active,Website,Mac,2026-08-17 09:00:00 -0400,2026-08-18 17:00:00 -0400,,45,1,"Draft in Pages","Writing, Website"',
    "t2,Action Group,Launch checklist,active,Website,,,,,,,,",
    "t3,Action,Buy domain,completed,Website,,,2026-06-01 00:00:00 -0400,2026-06-02 00:00:00 -0400,,0,Paid.",
    "t4,Action,Old idea,dropped,Website,,,,,,,,",
    "t5,Action,Hold for legal,on hold,Website,,,,,,,,",
    "i1,Inbox,Book dentist,active,,,,2026-08-22 00:00:00 -0400,,,0,,Phone",
    "c1,Context,Mac,active,,,,,,,,,",
  ].join("\n");

  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  assert.equal(imported.format, "OmniFocus CSV");
  assert.equal(imported.projects.length, 1);
  assert.equal(imported.projects[0]?.name, "Website");
  assert.equal(imported.projects[0]?.folder, "Work");
  assert.deepEqual(imported.extraFolders, ["Work"]);
  assert.equal(imported.projects[0]?.note, "Kickoff the public site.");
  assert.equal(imported.tasks.length, 6);

  const copy = imported.tasks.find((task) => task.title === "Write homepage copy");
  assert.ok(copy);
  assert.equal(copy.projectId, imported.projects[0]?.id);
  assert.equal(copy.due, "Tomorrow, 5:00 PM");
  assert.equal(copy.defer, "Today, 9:00 AM");
  assert.equal(copy.flagged, true);
  assert.deepEqual(copy.tags, ["Writing", "Website", "Mac"]);
  assert.match(copy.note ?? "", /Estimated duration: 45 minutes/);

  const inbox = imported.tasks.find((task) => task.title === "Book dentist");
  assert.equal(inbox?.projectId, null);
  assert.equal(inbox?.due, "Aug 22");
  assert.deepEqual(inbox?.tags, ["Phone"]);

  const dropped = imported.tasks.find((task) => task.title === "Old idea");
  assert.equal(dropped?.completed, false);
  assert.equal(dropped?.status, "dropped");

  const held = imported.tasks.find((task) => task.title === "Hold for legal");
  assert.equal(held?.completed, false);
  assert.equal(held?.status, "onHold");

  assert.equal(imported.skipped, 1);
  assert.ok(imported.warnings.some((warning) => warning.includes("folder")));
});

test("imports nested CSV folders as sidebar folder paths", () => {
  const csv = [
    "Task ID,Type,Name,Status,Project",
    "f1,Folder,Home,active,",
    "f2,Folder,Personal,active,Home",
    "f3,Folder,Hollywood,active,Musician",
    "f4,Folder,Musician,active,",
    "p1,Project,Website,active,Home : Personal",
  ].join("\n");
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  assert.ok(imported.extraFolders.includes("Home"));
  assert.ok(imported.extraFolders.includes("Home : Personal"));
  assert.ok(imported.extraFolders.includes("Musician"));
  assert.ok(imported.extraFolders.includes("Musician : Hollywood"));
  assert.equal(imported.projects[0]?.folder, "Home : Personal");
});

test("imports empty CSV folders without projects", () => {
  const csv = [
    "Task ID,Type,Name,Status,Project",
    "f1,Folder,Archive,active,",
    "f2,Folder,Old Clients,active,Archive",
  ].join("\n");
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  assert.deepEqual(imported.extraFolders.sort(), ["Archive", "Archive : Old Clients"]);
  assert.equal(imported.projects.length, 0);
  assert.equal(imported.tasks.length, 0);
});

test("apply import merges sidebar folders in merge mode", () => {
  const csv = "Task ID,Type,Name,Status,Project\nf1,Folder,Work,active,\n";
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  const result = applyOmniFocusImport([], [], imported, "merge");
  assert.deepEqual(result.extraFolders, ["Work"]);
});

test("imports OmniFocus project types from CSV Type column", () => {
  const csv = [
    "Task ID,Type,Name,Status,Project",
    "p1,Parallel Project,Alpha,active,",
    "p2,Sequential Project,Beta,active,",
    "p3,Single Action List,Gamma,active,",
    "t1,Action,Task in Beta,active,Beta",
  ].join("\n");
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  const byName = new Map(imported.projects.map((project) => [project.name, project]));
  assert.equal(byName.get("Alpha")?.type, "parallel");
  assert.equal(byName.get("Beta")?.type, "sequential");
  assert.equal(byName.get("Gamma")?.type, "singleActions");
});

test("imports project types from CSV Notes TaskPaper tags", () => {
  const csv = [
    "Task ID,Type,Name,Status,Project,Notes",
    "p1,Project,Sequential One,active,,@parallel(false)",
    "p2,Project,Single List,active,,@singleton(true)",
    "t1,Action,Task,active,Sequential One,",
  ].join("\n");
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  const byName = new Map(imported.projects.map((project) => [project.name, project]));
  assert.equal(byName.get("Sequential One")?.type, "sequential");
  assert.equal(byName.get("Single List")?.type, "singleActions");
});

test("plain CSV Project rows without type hints stay untyped", () => {
  const csv = [
    "Task ID,Type,Name,Status,Project",
    "p1,Project,Website,active,",
    "t1,Action,Write copy,active,Website",
  ].join("\n");
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  assert.equal(imported.projects[0]?.type, undefined);
  assert.ok(imported.warnings.some((warning) => warning.includes("Plain Text")));
});

test("merge import updates project types on existing projects", () => {
  const csv = [
    "Task ID,Type,Name,Status,Project",
    "p1,Sequential Project,Website,active,",
  ].join("\n");
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  const first = applyOmniFocusImport([], [], imported, "replace");
  assert.equal(first.projects[0]?.type, "sequential");
  const parallelCsv = [
    "Task ID,Type,Name,Status,Project",
    "p1,Parallel Project,Website,active,",
  ].join("\n");
  const reimported = parseOmniFocusFile("OmniFocus.csv", bytes(parallelCsv), now);
  const merged = applyOmniFocusImport(first.projects, first.tasks, reimported, "merge");
  assert.equal(merged.projects[0]?.type, "parallel");
});

test("imports project types from TaskPaper parallel tags", () => {
  const taskpaper = [
    "Parallel @parallel(true):",
    "\t- One",
    "Sequential @parallel(false):",
    "\t- Two",
    "Single @singleton(true):",
    "\t- Three",
  ].join("\n");
  const imported = parseOmniFocusFile("library.taskpaper", bytes(taskpaper), now);
  const byName = new Map(imported.projects.map((project) => [project.name, project]));
  assert.equal(byName.get("Parallel")?.type, "parallel");
  assert.equal(byName.get("Sequential")?.type, "sequential");
  assert.equal(byName.get("Single")?.type, "singleActions");
});

test("imports project headers from hyphen TaskPaper lines", () => {
  const taskpaper = [
    "- Sequential @parallel(false):",
    "\t- One",
    "- Parallel:",
    "\t- Two",
  ].join("\n");
  const imported = parseOmniFocusFile("library.taskpaper", bytes(taskpaper), now);
  const byName = new Map(imported.projects.map((project) => [project.name, project]));
  assert.equal(byName.get("Sequential")?.type, "sequential");
  assert.equal(byName.get("Parallel")?.type, undefined);
});

test("creates folder-prefixed projects even when actions appear before project rows", () => {
  const csv = [
    "Task ID,Type,Name,Status,Project",
    "t1,Action,Write copy,active,Website",
    "p1,Project,Website,active,Work",
  ].join("\n");
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  assert.equal(imported.projects.length, 1);
  assert.equal(imported.projects[0]?.name, "Website");
  assert.equal(imported.projects[0]?.folder, "Work");
  assert.equal(imported.tasks[0]?.projectId, imported.projects[0]?.id);
});

test("reads UTF-16 OmniFocus CSV exports", () => {
  const csv = "Task ID,Type,Name,Status,Project,Context,Start Date,Due Date,Completion Date,Duration,Flagged,Notes,Tags\n1,Action,Café,active,,,,,,,,,,\n";
  const imported = parseOmniFocusFile("export.csv", bytes(`\ufeff${csv}`, "utf16le"), now);
  assert.equal(imported.tasks[0]?.title, "Café");
});

test("imports nested TaskPaper projects and due tags", () => {
  const taskpaper = [
    "Work:",
    "\tWebsite:",
    "\t\t- Write homepage copy @due(2026-08-18 17:00) @flagged @tags(Writing) @context(Mac)",
    "\t\t  Draft in Pages",
    "\t\t- Buy domain @done",
    "- Inbox call @due(2026-08-17)",
  ].join("\n");

  const imported = parseOmniFocusFile("library.taskpaper", bytes(taskpaper), now);
  assert.equal(imported.format, "OmniFocus TaskPaper");
  assert.equal(imported.projects.map((project) => `${project.folder ? `${project.folder} : ` : ""}${project.name}`).join("|"), "Work : Website");
  const copy = imported.tasks.find((task) => task.title === "Write homepage copy");
  assert.equal(copy?.due, "Tomorrow, 5:00 PM");
  assert.equal(copy?.flagged, true);
  assert.equal(copy?.note, "Draft in Pages");
  assert.equal(imported.tasks.find((task) => task.title === "Inbox call")?.projectId, null);
});

test("imports three-level nested TaskPaper folders without dropping ancestors", () => {
  const taskpaper = [
    "Work:",
    "\tClients:",
    "\t\tAcme Corp:",
    "\t\t\t- Kickoff call",
    "\tClients:",
    "\t\tOther Co:",
    "\t\t\t- Send proposal",
  ].join("\n");

  const imported = parseOmniFocusFile("library.taskpaper", bytes(taskpaper), now);
  const paths = imported.projects.map((project) => `${project.folder ? `${project.folder} : ` : ""}${project.name}`);
  assert.deepEqual(paths, ["Work : Clients", "Work : Clients : Acme Corp", "Work : Clients : Other Co"]);
  assert.equal(new Set(imported.projects.map((project) => project.id)).size, imported.projects.length);
});

test("merge ignores duplicate OmniFocus task IDs", () => {
  const csv = "Task ID,Type,Name,Status,Project\np1,Project,Website,active,\nt1,Action,Write copy,active,Website\n";
  const imported = parseOmniFocusFile("OmniFocus.csv", bytes(csv), now);
  const first = applyOmniFocusImport([], [], imported, "replace");
  const second = applyOmniFocusImport(first.projects, first.tasks, imported, "merge");
  assert.equal(second.addedTasks, 0);
  assert.equal(second.duplicateTasks, 1);
  assert.equal(second.tasks.length, 1);
});

test("rejects native OmniFocus backup packages", () => {
  assert.throws(
    () => parseOmniFocusFile("OmniFocus.ofocus-backup", bytes("PK\u0003\u0004backup")),
    /backup packages cannot be imported directly/,
  );
});
