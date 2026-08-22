import assert from "node:assert/strict";
import test from "node:test";
import { dispatchAppCommand, type AppCommandHandlers } from "./dispatch.ts";

function handlers(overrides: Partial<AppCommandHandlers> = {}): AppCommandHandlers & { calls: string[] } {
  const calls: string[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push(args.length ? `${name}:${JSON.stringify(args)}` : name);
  };
  return {
    calls,
    selectPerspective: record("selectPerspective") as AppCommandHandlers["selectPerspective"],
    canShowSidebar: true,
    canShowInspector: true,
    setSidebarOpen: record("setSidebarOpen") as AppCommandHandlers["setSidebarOpen"],
    setInspectorOpen: record("setInspectorOpen") as AppCommandHandlers["setInspectorOpen"],
    setSearchOpen: record("setSearchOpen") as AppCommandHandlers["setSearchOpen"],
    setSettingsOpen: record("setSettingsOpen") as AppCommandHandlers["setSettingsOpen"],
    setViewMenuOpen: record("setViewMenuOpen") as AppCommandHandlers["setViewMenuOpen"],
    addCustomPerspective: record("addCustomPerspective"),
    setPerspectivesListOpen: record("setPerspectivesListOpen") as AppCommandHandlers["setPerspectivesListOpen"],
    togglePerspectivesBar: record("togglePerspectivesBar"),
    setQuickOpenOpen: record("setQuickOpenOpen") as AppCommandHandlers["setQuickOpenOpen"],
    openOmniFocusImport: record("openOmniFocusImport"),
    toggleTitles: record("toggleTitles"),
    insertAction: record("insertAction"),
    setQuickKind: record("setQuickKind") as AppCommandHandlers["setQuickKind"],
    selectedTaskIds: ["a"],
    toggleTasks: record("toggleTasks") as AppCommandHandlers["toggleTasks"],
    toggleTaskFlags: record("toggleTaskFlags") as AppCommandHandlers["toggleTaskFlags"],
    deleteTasks: record("deleteTasks") as AppCommandHandlers["deleteTasks"],
    projectFilter: "p1",
    deleteProject: record("deleteProject") as AppCommandHandlers["deleteProject"],
    sidebarProjectIds: [],
    sidebarFolderPaths: [],
    deleteSidebarSelection: record("deleteSidebarSelection"),
    focusSelected: record("focusSelected"),
    goBack: record("goBack"),
    goForward: record("goForward"),
    markSelectedReviewed: record("markSelectedReviewed"),
    selectAdjacentTask: record("selectAdjacentTask") as AppCommandHandlers["selectAdjacentTask"],
    selectAllVisible: record("selectAllVisible"),
    cleanUp: record("cleanUp"),
    duplicateSelected: record("duplicateSelected"),
    startEditTitle: record("startEditTitle"),
    expandAll: record("expandAll"),
    collapseAll: record("collapseAll"),
    indentSelected: record("indentSelected"),
    outdentSelected: record("outdentSelected"),
    moveSelected: record("moveSelected") as AppCommandHandlers["moveSelected"],
    undo: record("undo"),
    redo: record("redo"),
    copySelectedTaskPaper: record("copySelectedTaskPaper"),
    pasteTaskPaper: record("pasteTaskPaper"),
    convertSelectedToProject: record("convertSelectedToProject"),
    revealInProjects: record("revealInProjects"),
    awaitReply: record("awaitReply"),
    findNext: record("findNext"),
    findPrevious: record("findPrevious"),
    typeSelect: record("typeSelect") as AppCommandHandlers["typeSelect"],
    customizeToolbar: record("customizeToolbar"),
    exportTaskPaper: record("exportTaskPaper"),
    print: record("print"),
    duplicateProject: record("duplicateProject"),
    confirmPendingDelete: record("confirmPendingDelete"),
    cancelTopOverlay: record("cancelTopOverlay"),
    ...overrides,
  };
}

test("menu and hotkey commands reach the matching handler", () => {
  const next = handlers();
  dispatchAppCommand({ type: "perspective", id: "inbox" }, next);
  dispatchAppCommand({ type: "newAction" }, next);
  dispatchAppCommand({ type: "toggleComplete" }, next);
  dispatchAppCommand({ type: "moveRow", direction: "up" }, next);
  dispatchAppCommand({ type: "importOmniFocus" }, next);
  dispatchAppCommand({ type: "exportTaskPaper" }, next);
  dispatchAppCommand({ type: "print" }, next);
  dispatchAppCommand({ type: "duplicateProject" }, next);
  assert.deepEqual(next.calls, [
    "selectPerspective:[\"inbox\"]",
    "insertAction",
    "toggleTasks:[[\"a\"]]",
    "moveSelected:[-1]",
    "openOmniFocusImport",
    "exportTaskPaper",
    "print",
    "duplicateProject",
  ]);
});

test("delete falls back to the selected project when no actions are selected", () => {
  const next = handlers({ selectedTaskIds: [] });
  dispatchAppCommand({ type: "delete", direction: "menu" }, next);
  assert.deepEqual(next.calls, ["deleteProject:[\"p1\"]"]);
});

test("delete removes sidebar multi-selection before the filtered project", () => {
  const next = handlers({
    selectedTaskIds: [],
    sidebarProjectIds: ["p1", "p2"],
    sidebarFolderPaths: ["Home"],
  });
  dispatchAppCommand({ type: "delete", direction: "menu" }, next);
  assert.deepEqual(next.calls, ["deleteSidebarSelection"]);
});

test("sidebar and inspector toggles respect layout availability", () => {
  const next = handlers({ canShowSidebar: false, canShowInspector: false });
  dispatchAppCommand({ type: "toggleSidebar" }, next);
  dispatchAppCommand({ type: "toggleInspector" }, next);
  assert.deepEqual(next.calls, []);
});
