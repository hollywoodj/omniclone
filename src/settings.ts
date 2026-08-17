import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultSettings, type AppSettings } from "./model";

const SETTINGS_STORAGE_KEY = "omniclone.settings.v1";

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
      perspectiveBarIds: parsed.perspectiveBarIds?.length ? parsed.perspectiveBarIds : defaultSettings.perspectiveBarIds,
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
