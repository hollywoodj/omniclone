import type { HotkeyAction } from "../hotkeys.ts";
import { isTextInputTarget } from "../hotkeys.ts";
import type { MenuCommand } from "../menuBar.tsx";
import type { ActivePerspective } from "../model.ts";

export type AppCommand = HotkeyAction | MenuCommand;

export const nativeMenuCommandTypes = new Set<AppCommand["type"]>([
  "perspective",
  "toggleSidebar",
  "toggleInspector",
  "toggleSearch",
  "openSettings",
  "toggleViewMenu",
  "addPerspective",
  "showPerspectivesList",
  "togglePerspectivesBar",
  "quickOpen",
  "newAction",
  "newProject",
  "newFolder",
  "selectAll",
  "goBack",
  "goForward",
  "cleanUp",
  "duplicate",
  "expandAll",
  "collapseAll",
  "moveRow",
  "undo",
  "redo",
  "copyTaskPaper",
  "pasteTaskPaper",
  "convertToProject",
  "revealInProjects",
  "awaitReply",
  "findNext",
  "findPrevious",
  "customizeToolbar",
  "exportTaskPaper",
  "print",
  "duplicateProject",
]);

export type AppCommandHandlers = {
  selectPerspective: (id: ActivePerspective) => void;
  canShowSidebar: boolean;
  canShowInspector: boolean;
  setSidebarOpen: (update: (value: boolean) => boolean) => void;
  setInspectorOpen: (update: boolean | ((value: boolean) => boolean)) => void;
  setSearchOpen: (update: boolean | ((value: boolean) => boolean)) => void;
  setSettingsOpen: (open: boolean) => void;
  setViewMenuOpen: (update: boolean | ((value: boolean) => boolean)) => void;
  addCustomPerspective: () => void;
  setPerspectivesListOpen: (update: boolean | ((value: boolean) => boolean)) => void;
  togglePerspectivesBar: () => void;
  setQuickOpenOpen: (open: boolean) => void;
  openOmniFocusImport: () => void;
  toggleTitles: () => void;
  insertAction: () => void;
  setQuickKind: (kind: "task" | "project" | "folder" | null) => void;
  selectedTaskIds: string[];
  toggleTasks: (ids: string[]) => void;
  toggleTaskFlags: (ids: string[]) => void;
  deleteTasks: (ids: string[], direction?: "menu" | "previous" | "next") => void;
  projectFilter: string | null;
  deleteProject: (id: string) => void;
  sidebarProjectIds: string[];
  sidebarFolderPaths: string[];
  deleteSidebarSelection: () => void;
  focusSelected: () => void;
  goBack: () => void;
  goForward: () => void;
  markSelectedReviewed: () => void;
  selectAdjacentTask: (direction: "up" | "down", extend?: boolean) => void;
  selectAllVisible: () => void;
  cleanUp: () => void;
  duplicateSelected: () => void;
  startEditTitle: () => void;
  expandAll: () => void;
  collapseAll: () => void;
  indentSelected: () => void;
  outdentSelected: () => void;
  moveSelected: (direction: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
  copySelectedTaskPaper: () => void;
  pasteTaskPaper: () => void;
  convertSelectedToProject: () => void;
  revealInProjects: () => void;
  awaitReply: () => void;
  findNext: () => void;
  findPrevious: () => void;
  typeSelect: (key: string) => void;
  customizeToolbar: () => void;
  exportTaskPaper: () => void;
  print: () => void;
  duplicateProject: () => void;
  confirmPendingDelete: () => void;
  cancelTopOverlay: () => void;
};

function selectAllInFocusedField() {
  if (typeof document === "undefined" || !isTextInputTarget(document.activeElement)) return false;
  const field = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
  if (typeof field.select === "function") field.select();
  else document.execCommand("selectAll");
  return true;
}

function execInFocusedField(command: "undo" | "redo") {
  if (typeof document === "undefined" || !isTextInputTarget(document.activeElement)) return false;
  document.execCommand(command);
  return true;
}

export function dispatchAppCommand(action: AppCommand, handlers: AppCommandHandlers) {
  switch (action.type) {
    case "perspective":
      handlers.selectPerspective(action.id);
      break;
    case "toggleSidebar":
      if (handlers.canShowSidebar) handlers.setSidebarOpen((value) => !value);
      break;
    case "toggleInspector":
      if (handlers.canShowInspector) handlers.setInspectorOpen((value) => !value);
      break;
    case "toggleSearch":
      handlers.setSearchOpen((value) => !value);
      break;
    case "openSettings":
      handlers.setSettingsOpen(true);
      break;
    case "toggleViewMenu":
      handlers.setViewMenuOpen((value) => !value);
      break;
    case "addPerspective":
      handlers.addCustomPerspective();
      break;
    case "showPerspectivesList":
      handlers.setPerspectivesListOpen((value) => !value);
      break;
    case "togglePerspectivesBar":
      handlers.togglePerspectivesBar();
      break;
    case "quickOpen":
      handlers.setQuickOpenOpen(true);
      break;
    case "importOmniFocus":
      handlers.openOmniFocusImport();
      break;
    case "toggleTitles":
      handlers.toggleTitles();
      break;
    case "newAction":
      handlers.insertAction();
      break;
    case "newProject":
      handlers.setQuickKind("project");
      break;
    case "newFolder":
      handlers.setQuickKind("folder");
      break;
    case "quickEntry":
      handlers.setQuickKind("task");
      break;
    case "toggleComplete":
      if (handlers.selectedTaskIds.length) handlers.toggleTasks(handlers.selectedTaskIds);
      break;
    case "toggleFlag":
      if (handlers.selectedTaskIds.length) handlers.toggleTaskFlags(handlers.selectedTaskIds);
      break;
    case "delete":
      if (handlers.selectedTaskIds.length) handlers.deleteTasks(handlers.selectedTaskIds, action.direction);
      else if (handlers.sidebarProjectIds.length || handlers.sidebarFolderPaths.length) handlers.deleteSidebarSelection();
      else if (handlers.projectFilter) handlers.deleteProject(handlers.projectFilter);
      break;
    case "focusProject":
      handlers.focusSelected();
      break;
    case "goBack":
      handlers.goBack();
      break;
    case "goForward":
      handlers.goForward();
      break;
    case "markReviewed":
      handlers.markSelectedReviewed();
      break;
    case "selectRow":
      handlers.selectAdjacentTask(action.direction);
      break;
    case "extendRow":
      handlers.selectAdjacentTask(action.direction, true);
      break;
    case "selectAll":
      if (selectAllInFocusedField()) break;
      handlers.selectAllVisible();
      break;
    case "cleanUp":
      handlers.cleanUp();
      break;
    case "duplicate":
      handlers.duplicateSelected();
      break;
    case "editTitle":
      handlers.startEditTitle();
      break;
    case "expandAll":
      handlers.expandAll();
      break;
    case "collapseAll":
      handlers.collapseAll();
      break;
    case "indent":
      handlers.indentSelected();
      break;
    case "outdent":
      handlers.outdentSelected();
      break;
    case "moveRow":
      handlers.moveSelected(action.direction === "up" ? -1 : 1);
      break;
    case "undo":
      if (execInFocusedField("undo")) break;
      handlers.undo();
      break;
    case "redo":
      if (execInFocusedField("redo")) break;
      handlers.redo();
      break;
    case "copyTaskPaper":
      handlers.copySelectedTaskPaper();
      break;
    case "pasteTaskPaper":
      handlers.pasteTaskPaper();
      break;
    case "convertToProject":
      handlers.convertSelectedToProject();
      break;
    case "revealInProjects":
      handlers.revealInProjects();
      break;
    case "awaitReply":
      handlers.awaitReply();
      break;
    case "findNext":
      handlers.findNext();
      break;
    case "findPrevious":
      handlers.findPrevious();
      break;
    case "typeSelect":
      handlers.typeSelect(action.key);
      break;
    case "customizeToolbar":
      handlers.customizeToolbar();
      break;
    case "exportTaskPaper":
      handlers.exportTaskPaper();
      break;
    case "print":
      handlers.print();
      break;
    case "duplicateProject":
      handlers.duplicateProject();
      break;
    case "confirmDelete":
      handlers.confirmPendingDelete();
      break;
    case "cancel":
      handlers.cancelTopOverlay();
      break;
  }
}
