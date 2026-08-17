import { palette, perspectives, type ActivePerspective, type AppSettings, type CustomPerspective } from "../model";

export type RailPerspective = {
  id: ActivePerspective;
  name: string;
  icon: string;
  color: string;
  custom?: CustomPerspective;
};

export function favoritePerspectives(settings: AppSettings, customPerspectives: CustomPerspective[]): RailPerspective[] {
  const byId = new Map<string, RailPerspective>();
  for (const item of perspectives) {
    byId.set(item.id, { id: item.id, name: item.label, icon: item.icon, color: palette.purpleDark });
  }
  for (const item of customPerspectives) {
    byId.set(`custom:${item.id}`, { id: `custom:${item.id}`, name: item.name, icon: item.icon, color: item.color, custom: item });
  }
  return settings.perspectiveBarIds.map((id) => byId.get(id)).filter((item): item is RailPerspective => !!item);
}

export const projectColors = ["#8f57c8", "#2f8de4", "#58a65c", "#dc7f43", "#d05475", "#43a5a1"];
