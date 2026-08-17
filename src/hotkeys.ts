import type { ActivePerspective, PerspectiveId } from "./model";
import { commandPressed, eventMatchesShortcut, isMacPlatform } from "./shortcuts";

export type HotkeyAction =
  | { type: "perspective"; id: ActivePerspective }
  | { type: "toggleSidebar" }
  | { type: "toggleInspector" }
  | { type: "toggleSearch" }
  | { type: "openSettings" }
  | { type: "toggleViewMenu" }
  | { type: "addPerspective" }
  | { type: "showPerspectivesList" }
  | { type: "togglePerspectivesBar" }
  | { type: "quickOpen" }
  | { type: "newAction" }
  | { type: "newProject" }
  | { type: "newFolder" }
  | { type: "quickEntry" }
  | { type: "toggleComplete" }
  | { type: "toggleFlag" }
  | { type: "delete"; direction: "menu" | "previous" | "next" }
  | { type: "focusProject" }
  | { type: "goBack" }
  | { type: "goForward" }
  | { type: "markReviewed" }
  | { type: "selectRow"; direction: "up" | "down" }
  | { type: "extendRow"; direction: "up" | "down" }
  | { type: "selectAll" }
  | { type: "cleanUp" }
  | { type: "duplicate" }
  | { type: "editTitle" }
  | { type: "expandAll" }
  | { type: "collapseAll" }
  | { type: "indent" }
  | { type: "outdent" }
  | { type: "moveRow"; direction: "up" | "down" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "copyTaskPaper" }
  | { type: "convertToProject" }
  | { type: "confirmDelete" }
  | { type: "cancel" };

type ModifierState = {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

function readModifiers(event: KeyboardEvent): ModifierState {
  const command = commandPressed(event);
  return {
    meta: command,
    ctrl: isMacPlatform() ? event.ctrlKey : false,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

function isBareKey(event: KeyboardEvent): boolean {
  const { meta, ctrl, alt, shift } = readModifiers(event);
  return !meta && !ctrl && !alt && !shift;
}

export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: string; isContentEditable?: boolean };
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** OmniFocus 4 default shortcuts (Mac). Meta = Command, Alt = Option. */
export function matchOmniFocusHotkey(event: KeyboardEvent, options: {
  deleteDialogOpen: boolean;
  perspectiveShortcuts?: Record<string, string>;
  shortcutCapture?: boolean;
}): HotkeyAction | null {
  if (options.deleteDialogOpen) {
    if (event.key === "Enter") return { type: "confirmDelete" };
    if (event.key === "Escape") return { type: "cancel" };
    return null;
  }

  if (options.shortcutCapture) {
    if (event.key === "Escape") return { type: "cancel" };
    return null;
  }

  if (isTextInputTarget(event.target)) return null;

  const { meta, ctrl, alt, shift } = readModifiers(event);
  const key = event.key;

  if (options.perspectiveShortcuts) {
    const entries = Object.entries(options.perspectiveShortcuts).sort(([a], [b]) => Number(b.startsWith("custom:")) - Number(a.startsWith("custom:")));
    for (const [id, shortcut] of entries) {
      if (shortcut && eventMatchesShortcut(event, shortcut)) {
        return { type: "perspective", id: id as ActivePerspective };
      }
    }
  }

  if (meta && !ctrl && !alt && !shift) {
    const perspectives: Record<string, PerspectiveId> = {
      "1": "inbox",
      "2": "projects",
      "3": "tags",
      "4": "forecast",
      "5": "flagged",
      "6": "completed",
      "7": "review",
    };
    if (perspectives[key]) return { type: "perspective", id: perspectives[key] };
    if (key === "n" || key === "N") return { type: "newAction" };
    if (key === "a" || key === "A") return { type: "selectAll" };
    if (key === "f" || key === "F") return { type: "toggleSearch" };
    if (key === "o" || key === "O") return { type: "quickOpen" };
    if (key === ",") return { type: "openSettings" };
    if (key === "Delete" || key === "Backspace") return { type: "delete", direction: "menu" };
    if (key === "[") return { type: "goBack" };
    if (key === "]") return { type: "goForward" };
    if (key === "k" || key === "K") return { type: "cleanUp" };
    if (key === "d" || key === "D") return { type: "duplicate" };
    if (key === "z" || key === "Z") return { type: "undo" };
  }

  if (meta && ctrl && !alt && !shift && (key === "p" || key === "P")) return { type: "showPerspectivesList" };

  if (meta && alt && !ctrl && !shift) {
    if (key === "n" || key === "N") return { type: "newFolder" };
    if (key === "s" || key === "S") return { type: "toggleSidebar" };
    if (key === "i" || key === "I") return { type: "toggleInspector" };
    if (key === "f" || key === "F") return { type: "toggleSearch" };
    if (key === "p" || key === "P") return { type: "togglePerspectivesBar" };
    if (key === "9") return { type: "expandAll" };
    if (key === "0") return { type: "collapseAll" };
    if (key === "ArrowUp") return { type: "moveRow", direction: "up" };
    if (key === "ArrowDown") return { type: "moveRow", direction: "down" };
  }

  if (meta && shift && !ctrl && !alt) {
    if (key === "n" || key === "N") return { type: "newProject" };
    if (key === "f" || key === "F") return { type: "focusProject" };
    if (key === "r" || key === "R") return { type: "markReviewed" };
    if (key === "v" || key === "V") return { type: "toggleViewMenu" };
    if (key === "l" || key === "L") return { type: "toggleFlag" };
    if (key === "c" || key === "C") return { type: "copyTaskPaper" };
    if (key === "z" || key === "Z") return { type: "redo" };
  }

  if (ctrl && alt && !meta && shift && (key === "s" || key === "S")) return { type: "quickEntry" };
  if (ctrl && alt && !meta && !shift && key === " ") return { type: "quickEntry" };

  if (isBareKey(event)) {
    if (key === " ") {
      event.preventDefault();
      return { type: "toggleComplete" };
    }
    if (key === "Enter") return { type: "editTitle" };
    if (key === "f" || key === "F") return { type: "toggleFlag" };
    if (key === "Tab") {
      event.preventDefault();
      return { type: "indent" };
    }
    if (key === "ArrowUp") return { type: "selectRow", direction: "up" };
    if (key === "ArrowDown") return { type: "selectRow", direction: "down" };
    if (key === "Delete" || key === "Backspace") return { type: "delete", direction: "previous" };
  }

  if (!meta && !ctrl && !alt && shift) {
    if (key === "Tab") {
      event.preventDefault();
      return { type: "outdent" };
    }
    if (key === "ArrowUp") return { type: "extendRow", direction: "up" };
    if (key === "ArrowDown") return { type: "extendRow", direction: "down" };
  }

  if (event.code === "Delete" && !meta && !ctrl && !alt && !shift) {
    return { type: "delete", direction: "next" };
  }

  if (key === "Escape") return { type: "cancel" };

  return null;
}

export function perspectiveFromHotkey(id: PerspectiveId): ActivePerspective {
  return id;
}
