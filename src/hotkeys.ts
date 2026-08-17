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
  | { type: "quickEntry" }
  | { type: "toggleComplete" }
  | { type: "toggleFlag" }
  | { type: "delete"; direction: "menu" | "previous" | "next" }
  | { type: "focusProject" }
  | { type: "markReviewed" }
  | { type: "selectRow"; direction: "up" | "down" }
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
  if (!target || typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
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
      "7": "review",
    };
    if (perspectives[key]) return { type: "perspective", id: perspectives[key] };
    if (key === "n" || key === "N") return { type: "newAction" };
    if (key === "f" || key === "F") return { type: "toggleSearch" };
    if (key === "o" || key === "O") return { type: "quickOpen" };
    if (key === ",") return { type: "openSettings" };
    if (key === "Delete" || key === "Backspace") return { type: "delete", direction: "menu" };
  }

  if (meta && ctrl && !alt && !shift && (key === "p" || key === "P")) return { type: "showPerspectivesList" };

  if (meta && alt && !ctrl && !shift) {
    if (key === "s" || key === "S") return { type: "toggleSidebar" };
    if (key === "i" || key === "I") return { type: "toggleInspector" };
    if (key === "f" || key === "F") return { type: "toggleSearch" };
    if (key === "p" || key === "P") return { type: "togglePerspectivesBar" };
  }

  if (meta && shift && !ctrl && !alt) {
    if (key === "n" || key === "N") return { type: "newProject" };
    if (key === "f" || key === "F") return { type: "focusProject" };
    if (key === "r" || key === "R") return { type: "markReviewed" };
    if (key === "v" || key === "V") return { type: "toggleViewMenu" };
    if (key === "l" || key === "L") return { type: "toggleFlag" };
  }

  if (ctrl && alt && !meta && shift && (key === "s" || key === "S")) return { type: "quickEntry" };
  if (ctrl && alt && !meta && !shift && key === " ") return { type: "quickEntry" };

  if (isBareKey(event)) {
    if (key === " ") {
      event.preventDefault();
      return { type: "toggleComplete" };
    }
    if (key === "f" || key === "F") return { type: "toggleFlag" };
    if (key === "ArrowUp") return { type: "selectRow", direction: "up" };
    if (key === "ArrowDown") return { type: "selectRow", direction: "down" };
    if (key === "Delete" || key === "Backspace") return { type: "delete", direction: "previous" };
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
