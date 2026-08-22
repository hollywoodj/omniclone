import { perspectives, type ActivePerspective, type AppSettings, type CustomPerspective } from "../model.ts";

export function allPerspectiveIds(customPerspectives: CustomPerspective[]): ActivePerspective[] {
  return [
    ...perspectives.map((item) => item.id as ActivePerspective),
    ...customPerspectives.map((item) => `custom:${item.id}` as ActivePerspective),
  ];
}

export function reorderIds<T>(ids: T[], fromId: T, toId: T): T[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  if (item === undefined) return ids;
  next.splice(to, 0, item);
  return next;
}

export function orderedPerspectiveIds(
  order: string[] | undefined,
  customPerspectives: CustomPerspective[],
): ActivePerspective[] {
  const all = allPerspectiveIds(customPerspectives);
  if (!order?.length) return all;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...all].sort((a, b) => {
    const aRank = rank.get(a) ?? Number.POSITIVE_INFINITY;
    const bRank = rank.get(b) ?? Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return all.indexOf(a) - all.indexOf(b);
  });
}

export function favoriteIdsInOrder(order: ActivePerspective[], favoriteIds: string[]): string[] {
  const favorites = new Set(favoriteIds);
  return order.filter((id) => favorites.has(id));
}

export function applyPerspectiveReorder(
  settings: AppSettings,
  customPerspectives: CustomPerspective[],
  fromId: ActivePerspective,
  toId: ActivePerspective,
): Pick<AppSettings, "perspectiveOrderIds" | "perspectiveBarIds"> {
  const order = reorderIds(
    orderedPerspectiveIds(settings.perspectiveOrderIds, customPerspectives),
    fromId,
    toId,
  );
  return {
    perspectiveOrderIds: order,
    perspectiveBarIds: favoriteIdsInOrder(order, settings.perspectiveBarIds),
  };
}

export function applyPerspectiveMove(
  settings: AppSettings,
  customPerspectives: CustomPerspective[],
  id: ActivePerspective,
  direction: -1 | 1,
): Pick<AppSettings, "perspectiveOrderIds" | "perspectiveBarIds"> {
  const order = orderedPerspectiveIds(settings.perspectiveOrderIds, customPerspectives);
  const from = order.indexOf(id);
  if (from < 0) {
    return { perspectiveOrderIds: order, perspectiveBarIds: settings.perspectiveBarIds };
  }
  const toIndex = Math.max(0, Math.min(order.length - 1, from + direction));
  const toId = order[toIndex];
  if (!toId || toId === id) {
    return { perspectiveOrderIds: order, perspectiveBarIds: settings.perspectiveBarIds };
  }
  return applyPerspectiveReorder(settings, customPerspectives, id, toId);
}

export function togglePerspectiveFavorite(
  settings: AppSettings,
  customPerspectives: CustomPerspective[],
  id: ActivePerspective,
): Pick<AppSettings, "perspectiveBarIds"> {
  const exists = settings.perspectiveBarIds.includes(id);
  const nextFavorites = exists
    ? settings.perspectiveBarIds.filter((item) => item !== id)
    : [...settings.perspectiveBarIds, id];
  const order = orderedPerspectiveIds(settings.perspectiveOrderIds, customPerspectives);
  return { perspectiveBarIds: favoriteIdsInOrder(order, nextFavorites) };
}

export function withPerspectiveId(
  settings: AppSettings,
  id: ActivePerspective,
  favorite = true,
): Pick<AppSettings, "perspectiveOrderIds" | "perspectiveBarIds"> {
  const stored = settings.perspectiveOrderIds ?? [];
  const order = stored.length ? [...stored] : [...perspectives.map((item) => item.id)];
  const nextOrder = order.includes(id) ? order : [...order, id];
  const nextFavorites = favorite && !settings.perspectiveBarIds.includes(id)
    ? [...settings.perspectiveBarIds, id]
    : settings.perspectiveBarIds;
  return {
    perspectiveOrderIds: nextOrder,
    perspectiveBarIds: favoriteIdsInOrder(nextOrder as ActivePerspective[], nextFavorites),
  };
}

export function withoutPerspectiveId(
  settings: AppSettings,
  id: ActivePerspective,
): Pick<AppSettings, "perspectiveOrderIds" | "perspectiveBarIds"> {
  return {
    perspectiveOrderIds: (settings.perspectiveOrderIds ?? []).filter((item) => item !== id),
    perspectiveBarIds: settings.perspectiveBarIds.filter((item) => item !== id),
  };
}
