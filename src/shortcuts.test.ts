import assert from "node:assert/strict";
import test from "node:test";

import { shortcutLabel, modifierLabel } from "./shortcuts.ts";
import { matchOmniFocusHotkey } from "./hotkeys.ts";

// These run under Node, where navigator.platform is not a Mac string, so the
// helpers take their non-Mac branch — the same one the Windows build uses.

test("mac glyph chords render as Windows key names", () => {
  const cases: Array<[string, string]> = [
    ["⌘N", "Ctrl+N"],
    ["⇧⌘N", "Ctrl+Shift+N"],
    ["⌥⌘N", "Ctrl+Alt+N"],
    ["⇧⌘L", "Ctrl+Shift+L"],
    ["⌥⌘↑", "Ctrl+Alt+Up"],
    ["⌘,", "Ctrl+,"],
    ["⌘A", "Ctrl+A"],
  ];
  for (const [chord, expected] of cases) {
    assert.equal(shortcutLabel(chord), expected, `${chord} rendered as ${shortcutLabel(chord)}`);
  }
  assert.equal(modifierLabel(), "Ctrl");
});

test("chords needing a real Control modifier get a reachable Windows spelling", () => {
  // Ctrl already stands in for Command on Windows, so ⌃⌘P and ⌃⌥Space have no
  // direct spelling and are remapped rather than shown as unpressable.
  assert.equal(shortcutLabel("⌃⌘P"), "Ctrl+Shift+P");
  assert.equal(shortcutLabel("⌃⌥Space"), "Ctrl+Alt+Space");
});

function keyEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    preventDefault() {},
    ...init,
  } as unknown as KeyboardEvent;
}

const noDialogs = { deleteDialogOpen: false };

test("Windows can reach Show Perspectives List and Quick Entry", () => {
  // Ctrl+Shift+P
  assert.deepEqual(
    matchOmniFocusHotkey(keyEvent({ key: "p", ctrlKey: true, shiftKey: true }), noDialogs),
    { type: "showPerspectivesList" }
  );
  // Ctrl+Alt+Space
  assert.deepEqual(
    matchOmniFocusHotkey(keyEvent({ key: " ", ctrlKey: true, altKey: true }), noDialogs),
    { type: "quickEntry" }
  );
});

test("plain Command chords still match on Windows", () => {
  assert.deepEqual(
    matchOmniFocusHotkey(keyEvent({ key: "n", ctrlKey: true }), noDialogs),
    { type: "newAction" }
  );
  assert.deepEqual(
    matchOmniFocusHotkey(keyEvent({ key: "N", ctrlKey: true, shiftKey: true }), noDialogs),
    { type: "newProject" }
  );
});
