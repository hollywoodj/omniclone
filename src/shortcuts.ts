export type ShortcutChord = {
  key: string;
  meta: boolean;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
};

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift", "OS"]);

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad/.test(navigator.platform) || /Mac OS X|iPhone|iPad/.test(navigator.userAgent);
}

export function commandPressed(event: KeyboardEvent): boolean {
  return isMacPlatform() ? event.metaKey : event.metaKey || event.ctrlKey;
}

export function parseShortcut(value: string | undefined | null): ShortcutChord | null {
  if (!value) return null;
  const parts = value.toLowerCase().split("+").filter(Boolean);
  if (!parts.length) return null;
  const chord: ShortcutChord = { key: "", meta: false, alt: false, ctrl: false, shift: false };
  for (const part of parts) {
    if (part === "meta" || part === "cmd" || part === "command") chord.meta = true;
    else if (part === "alt" || part === "option") chord.alt = true;
    else if (part === "ctrl" || part === "control") chord.ctrl = true;
    else if (part === "shift") chord.shift = true;
    else chord.key = part;
  }
  return chord.key ? chord : null;
}

export function serializeShortcut(chord: ShortcutChord): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push("ctrl");
  if (chord.alt) parts.push("alt");
  if (chord.shift) parts.push("shift");
  if (chord.meta) parts.push("meta");
  parts.push(chord.key.toLowerCase());
  return parts.join("+");
}

export function shortcutFromEvent(event: KeyboardEvent): ShortcutChord | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const meta = isMacPlatform() ? event.metaKey : event.metaKey || event.ctrlKey;
  const ctrl = isMacPlatform() ? event.ctrlKey : false;
  if (!meta && !event.altKey && !ctrl && !event.shiftKey) return null;
  return { key, meta, alt: event.altKey, ctrl, shift: event.shiftKey };
}

export function chordsEqual(a: ShortcutChord, b: ShortcutChord): boolean {
  return a.key.toLowerCase() === b.key.toLowerCase() && a.meta === b.meta && a.alt === b.alt && a.ctrl === b.ctrl && a.shift === b.shift;
}

export function eventMatchesShortcut(event: KeyboardEvent, value: string | undefined | null): boolean {
  const parsed = parseShortcut(value);
  if (!parsed) return false;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const meta = isMacPlatform() ? event.metaKey : event.metaKey || event.ctrlKey;
  const ctrl = isMacPlatform() ? event.ctrlKey : false;
  return key.toLowerCase() === parsed.key.toLowerCase() && meta === parsed.meta && event.altKey === parsed.alt && ctrl === parsed.ctrl && event.shiftKey === parsed.shift;
}

export function formatShortcut(value: string | undefined | null): string {
  const parsed = parseShortcut(value);
  if (!parsed) return "";
  const mac = isMacPlatform();
  const tokens: string[] = [];
  if (parsed.ctrl) tokens.push(mac ? "⌃" : "Ctrl");
  if (parsed.alt) tokens.push(mac ? "⌥" : "Alt");
  if (parsed.shift) tokens.push(mac ? "⇧" : "Shift");
  if (parsed.meta) tokens.push(mac ? "⌘" : "Ctrl");
  const keyLabel = parsed.key.length === 1 ? parsed.key.toUpperCase() : prettyKey(parsed.key);
  if (mac) return `${tokens.join("")}${keyLabel}`;
  return [...tokens, keyLabel].join("+");
}

function prettyKey(key: string): string {
  const labels: Record<string, string> = {
    backspace: "Delete",
    delete: "Fwd Del",
    escape: "Esc",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    " ": "Space",
    enter: "Return",
    comma: ",",
  };
  return labels[key.toLowerCase()] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function toElectronAccelerator(value: string | undefined | null): string | undefined {
  const parsed = parseShortcut(value);
  if (!parsed) return undefined;
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Control");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  if (parsed.meta) parts.push("CommandOrControl");
  const key = parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key;
  parts.push(key);
  return parts.join("+");
}
