import { defaultSettings, type AppSettings, type CustomPerspective } from "../model.ts";

export function settingsWithCustomBarItems(settings: AppSettings, customPerspectives: CustomPerspective[]): AppSettings {
  const extraBarIds = customPerspectives
    .map((item) => `custom:${item.id}`)
    .filter((id) => !settings.perspectiveBarIds.includes(id));
  if (extraBarIds.length && settings.perspectiveBarIds.join() === defaultSettings.perspectiveBarIds.join()) {
    const order = settings.perspectiveOrderIds ?? settings.perspectiveBarIds;
    const extraOrderIds = extraBarIds.filter((id) => !order.includes(id));
    return {
      ...settings,
      perspectiveBarIds: [...settings.perspectiveBarIds, ...extraBarIds],
      perspectiveOrderIds: [...order, ...extraOrderIds],
    };
  }
  return settings;
}
