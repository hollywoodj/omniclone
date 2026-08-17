import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { HotkeyAction } from "./hotkeys";
import {
  perspectives,
  type ActivePerspective,
  type AppSettings,
  type CustomPerspective,
} from "./model";
import { formatShortcut } from "./shortcuts";

export type MenuCommand = HotkeyAction | { type: "importOmniFocus" } | { type: "toggleTitles" };

type MenuEntry = {
  id: string;
  label?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  command?: MenuCommand;
};

type MenuDef = {
  id: string;
  label: string;
  items: MenuEntry[];
};

function shortcutLabel(settings: AppSettings, id: string, fallback: string) {
  return formatShortcut(settings.perspectiveShortcuts[id] ?? fallback);
}

export function buildAppMenus(options: {
  settings: AppSettings;
  customPerspectives: CustomPerspective[];
  perspectiveBarVisible: boolean;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  viewOptionsOpen: boolean;
}): MenuDef[] {
  const { settings, customPerspectives } = options;
  const customItems: MenuEntry[] = customPerspectives.map((item) => ({
    id: `custom:${item.id}`,
    label: item.name,
    shortcut: shortcutLabel(settings, `custom:${item.id}`, ""),
    command: { type: "perspective", id: `custom:${item.id}` as ActivePerspective },
  }));

  return [
    {
      id: "app",
      label: "OmniClone",
      items: [
        { id: "about", label: "About OmniClone", disabled: true },
        { id: "sep-app", separator: true },
        { id: "settings", label: "Settings…", shortcut: "⌘,", command: { type: "openSettings" } },
      ],
    },
    {
      id: "file",
      label: "File",
      items: [
        { id: "new-action", label: "New Action", shortcut: "⌘N", command: { type: "newAction" } },
        { id: "new-project", label: "New Project", shortcut: "⇧⌘N", command: { type: "newProject" } },
        { id: "quick-entry", label: "Quick Entry", shortcut: "⌃⌥Space", command: { type: "quickEntry" } },
        { id: "sep-file", separator: true },
        { id: "quick-open", label: "Quick Open…", shortcut: "⌘O", command: { type: "quickOpen" } },
        { id: "import", label: "Import from OmniFocus…", command: { type: "importOmniFocus" } },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        { id: "find", label: "Find", shortcut: "⌘F", command: { type: "toggleSearch" } },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        { id: "view-options", label: options.viewOptionsOpen ? "Hide View Options" : "Show View Options", shortcut: "⇧⌘V", command: { type: "toggleViewMenu" } },
        { id: "sep-view-1", separator: true },
        { id: "sidebar", label: options.sidebarOpen ? "Hide Sidebar" : "Show Sidebar", shortcut: "⌥⌘S", command: { type: "toggleSidebar" } },
        { id: "inspector", label: options.inspectorOpen ? "Hide Inspector" : "Show Inspector", shortcut: "⌥⌘I", command: { type: "toggleInspector" } },
        { id: "bar", label: options.perspectiveBarVisible ? "Hide Perspectives Bar" : "Show Perspectives Bar", shortcut: "⌥⌘P", command: { type: "togglePerspectivesBar" } },
        { id: "titles", label: settings.perspectiveBarShowsTitles ? "Perspectives Bar Hides Titles" : "Perspectives Bar Shows Titles", command: { type: "toggleTitles" } },
      ],
    },
    {
      id: "perspectives",
      label: "Perspectives",
      items: [
        { id: "list", label: "Show Perspectives List", shortcut: "⌃⌘P", command: { type: "showPerspectivesList" } },
        { id: "add", label: "Add Perspective…", command: { type: "addPerspective" } },
        { id: "sep-p-1", separator: true },
        ...perspectives.map((item) => ({
          id: item.id,
          label: item.label,
          shortcut: shortcutLabel(settings, item.id, defaultShortcut(item.id)),
          command: { type: "perspective" as const, id: item.id },
        })),
        ...(customItems.length ? [{ id: "sep-p-2", separator: true }, ...customItems] : []),
      ],
    },
  ];
}

function defaultShortcut(id: string): string {
  const map: Record<string, string> = {
    inbox: "meta+1",
    projects: "meta+2",
    tags: "meta+3",
    forecast: "meta+4",
    flagged: "meta+5",
    review: "meta+7",
  };
  return map[id] ?? "";
}

export function MenuBar({
  settings,
  customPerspectives,
  perspectiveBarVisible,
  sidebarOpen,
  inspectorOpen,
  viewOptionsOpen,
  nativeMenu,
  onCommand,
}: {
  settings: AppSettings;
  customPerspectives: CustomPerspective[];
  perspectiveBarVisible: boolean;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  viewOptionsOpen: boolean;
  nativeMenu?: boolean;
  onCommand: (command: MenuCommand) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const menus = useMemo(
    () => buildAppMenus({ settings, customPerspectives, perspectiveBarVisible, sidebarOpen, inspectorOpen, viewOptionsOpen }),
    [customPerspectives, inspectorOpen, perspectiveBarVisible, settings, sidebarOpen, viewOptionsOpen]
  );

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  if (nativeMenu) return null;

  return (
    <View style={styles.bar} pointerEvents="box-none">
      {menus.map((menu) => (
        <View key={menu.id} style={styles.menuWrap}>
          <Pressable
            onPress={() => setOpenId((current) => current === menu.id ? null : menu.id)}
            style={[styles.menuTitle, openId === menu.id && styles.menuTitleOpen]}
          >
            <Text style={[styles.menuTitleText, openId === menu.id && styles.menuTitleTextOpen]}>{menu.label}</Text>
          </Pressable>
          {openId === menu.id && (
            <View style={styles.dropdown}>
              {menu.items.map((item) => item.separator ? (
                <View key={item.id} style={styles.separator} />
              ) : (
                <Pressable
                  key={item.id}
                  disabled={item.disabled}
                  onPress={() => {
                    setOpenId(null);
                    if (item.command) onCommand(item.command);
                  }}
                  style={({ pressed }) => [styles.item, item.disabled && styles.itemDisabled, pressed && !item.disabled && styles.itemPressed]}
                >
                  <Text style={[styles.itemLabel, item.disabled && styles.itemDisabledText]}>{item.label}</Text>
                  {!!item.shortcut && <Text style={styles.itemShortcut}>{item.shortcut}</Text>}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ))}
      {openId && <Pressable accessibilityLabel="Close menu" onPress={() => setOpenId(null)} style={styles.dismiss} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 28,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecebed",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#c3c1c6",
    zIndex: 40,
  },
  menuWrap: {
    zIndex: 42,
  },
  menuTitle: {
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 4,
    justifyContent: "center",
  },
  menuTitleOpen: {
    backgroundColor: "#0a64d6",
  },
  menuTitleText: {
    fontSize: 13,
    color: "#1d1b1f",
  },
  menuTitleTextOpen: {
    color: "#fff",
  },
  dropdown: {
    position: "absolute",
    top: 24,
    left: 0,
    minWidth: 268,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#b7b4ba",
    backgroundColor: "#f6f5f7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 16,
    zIndex: 43,
  },
  item: {
    minHeight: 24,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
  },
  itemPressed: {
    backgroundColor: "#0a64d6",
  },
  itemDisabled: {
    opacity: 0.4,
  },
  itemLabel: {
    fontSize: 13,
    color: "#1d1b1f",
  },
  itemDisabledText: {
    color: "#6e6b72",
  },
  itemShortcut: {
    fontSize: 13,
    color: "#6e6b72",
    minWidth: 42,
    textAlign: "right",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 5,
    marginHorizontal: 8,
    backgroundColor: "#d0ced3",
  },
  dismiss: {
    position: "absolute",
    top: 28,
    left: -400,
    right: -400,
    height: 4000,
    zIndex: 41,
  },
});
