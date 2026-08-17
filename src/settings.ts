import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultPerspectiveBarIds, defaultSettings, legacyPerspectiveBarIds, type AppSettings } from "./model";

const SETTINGS_STORAGE_KEY = "omniclone.settings.v1";

function migratePerspectiveBarIds(ids: string[] | undefined) {
  if (!ids?.length) return defaultPerspectiveBarIds;
  if (ids.join() === legacyPerspectiveBarIds.join()) return defaultPerspectiveBarIds;
  return ids;
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
    };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
