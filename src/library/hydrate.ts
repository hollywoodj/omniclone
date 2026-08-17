import { defaultSettings, type AppSettings, type CustomPerspective } from "../model.ts";

export function settingsWithCustomBarItems(settings: AppSettings, customPerspectives: CustomPerspective[]): AppSettings {
  const extraBarIds = customPerspectives
    .map((item) => `custom:${item.id}`)
    .filter((id) => !settings.perspectiveBarIds.includes(id));
  if (extraBarIds.length && settings.perspectiveBarIds.join() === defaultSettings.perspectiveBarIds.join()) {
    return { ...settings, perspectiveBarIds: [...settings.perspectiveBarIds, ...extraBarIds] };
  }
  return settings;
}
