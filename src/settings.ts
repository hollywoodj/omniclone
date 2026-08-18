import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  defaultOutlineColumns,
  defaultPerspectiveBarIds,
  defaultSettings,
  defaultToolbarButtons,
  legacyPerspectiveBarIds,
  outlineColumnOrder,
  type AppSettings,
  type OutlineColumnId,
  type ToolbarButtonId,
} from "./model";

const SETTINGS_STORAGE_KEY = "omniclone.settings.v1";

function migratePerspectiveBarIds(ids: string[] | undefined) {
  if (!ids?.length) return defaultPerspectiveBarIds;
  if (ids.join() === legacyPerspectiveBarIds.join()) return defaultPerspectiveBarIds;
  return ids;
}

function migrateOutlineColumns(columns: OutlineColumnId[] | undefined) {
  if (!columns?.length) return defaultOutlineColumns;
  const allowed = new Set(outlineColumnOrder);
  const next = columns.filter((column) => allowed.has(column));
  return next.length ? next : defaultOutlineColumns;
}

function migrateToolbarButtons(buttons: ToolbarButtonId[] | undefined) {
  if (!buttons?.length) return defaultToolbarButtons;
  const allowed = new Set(defaultToolbarButtons);
  const next = buttons.filter((button) => allowed.has(button));
  return next.length ? next : defaultToolbarButtons;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return defaultSettings;
    const parsed = JSON.parse(stored) as Partial<AppSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      version: 1,
      cleanUpImmediately: parsed.cleanUpImmediately ?? defaultSettings.cleanUpImmediately,
      showNotesInOutline: parsed.showNotesInOutline ?? defaultSettings.showNotesInOutline,
      extraFolders: parsed.extraFolders ?? defaultSettings.extraFolders,
      sidebarWidth: parsed.sidebarWidth ?? defaultSettings.sidebarWidth,
      inspectorWidth: parsed.inspectorWidth ?? defaultSettings.inspectorWidth,
      perspectiveBarIds: migratePerspectiveBarIds(parsed.perspectiveBarIds),
      perspectiveShortcuts: { ...defaultSettings.perspectiveShortcuts, ...parsed.perspectiveShortcuts },
      standardAvailability: { ...defaultSettings.standardAvailability, ...parsed.standardAvailability },
      outlineColumns: migrateOutlineColumns(parsed.outlineColumns),
      toolbarButtons: migrateToolbarButtons(parsed.toolbarButtons),
      appearance: parsed.appearance === "light" || parsed.appearance === "dark" || parsed.appearance === "system"
        ? parsed.appearance
        : defaultSettings.appearance,
      awaitReplyDays: typeof parsed.awaitReplyDays === "number" && parsed.awaitReplyDays > 0
        ? Math.round(parsed.awaitReplyDays)
        : defaultSettings.awaitReplyDays,
    };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
