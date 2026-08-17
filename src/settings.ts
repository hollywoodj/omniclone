import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultSettings, type AppSettings } from "./model";

const SETTINGS_STORAGE_KEY = "omniclone.settings.v1";

export async function loadSettings(): Promise<AppSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return defaultSettings;
    return { ...defaultSettings, ...(JSON.parse(stored) as Partial<AppSettings>), version: 1 };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
