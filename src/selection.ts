import type { ActivePerspective, PerspectiveGroupBy, Project, Task } from "./model";
import { flattenTasks, tasksByDueLabel, tasksByFlag, tasksByProjectId, tasksByTag } from "./outline.ts";

export type SelectionModifiers = {
  shift?: boolean;
  toggle?: boolean;
};

export type SelectionState = {
  ids: string[];
  anchorId: string | null;
  headId: string | null;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const emptySelection: SelectionState = { ids: [], anchorId: null, headId: null };

export function uniqueIds(ids: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function singleSelection(id: string | null): SelectionState {
  if (!id) return emptySelection;
  return { ids: [id], anchorId: id, headId: id };
}

export function rangeIds(orderedIds: string[], fromId: string | null, toId: string): string[] {
  if (!fromId || fromId === toId) return orderedIds.includes(toId) ? [toId] : [];
  const from = orderedIds.indexOf(fromId);
  const to = orderedIds.indexOf(toId);
  if (to < 0) return from >= 0 ? [fromId] : [];
  if (from < 0) return [toId];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return orderedIds.slice(start, end + 1);
}

export function applyClick(state: SelectionState, orderedIds: string[], id: string, modifiers: SelectionModifiers = {}): SelectionState {
  if (!orderedIds.includes(id)) return state;
  if (modifiers.shift) {
    const origin = state.anchorId && orderedIds.includes(state.anchorId) ? state.anchorId : state.headId ?? id;
    const range = rangeIds(orderedIds, origin, id);
    if (modifiers.toggle) {
      return { ids: uniqueIds([...state.ids, ...range]), anchorId: origin, headId: id };
    }
    return { ids: range, anchorId: origin, headId: id };
  }
  if (modifiers.toggle) {
    const exists = state.ids.includes(id);
    const ids = exists ? state.ids.filter((item) => item !== id) : [...state.ids, id];
    if (!ids.length) return emptySelection;
    return {
      ids,
      anchorId: exists && state.anchorId === id ? (ids[ids.length - 1] ?? null) : exists ? state.anchorId : id,
      headId: id,
    };
  }
  return singleSelection(id);
}

export function applySelectAll(orderedIds: string[]): SelectionState {
  if (!orderedIds.length) return emptySelection;
  return {
    ids: [...orderedIds],
    anchorId: orderedIds[0] ?? null,
    headId: orderedIds[orderedIds.length - 1] ?? null,
  };
}

export function applyMove(
  state: SelectionState,
  orderedIds: string[],
  direction: "up" | "down",
  extend = false,
): SelectionState {
  if (!orderedIds.length) return emptySelection;
  const current = state.headId && orderedIds.includes(state.headId)
    ? state.headId
    : state.ids.find((id) => orderedIds.includes(id)) ?? null;
  const currentIndex = current ? orderedIds.indexOf(current) : -1;
  const nextIndex = direction === "down"
    ? Math.min(currentIndex < 0 ? 0 : currentIndex + 1, orderedIds.length - 1)
    : Math.max(currentIndex < 0 ? orderedIds.length - 1 : currentIndex - 1, 0);
  const nextId = orderedIds[nextIndex];
  if (!nextId) return emptySelection;
  if (extend) {
    const anchor = state.anchorId && orderedIds.includes(state.anchorId) ? state.anchorId : current ?? nextId;
    return { ids: rangeIds(orderedIds, anchor, nextId), anchorId: anchor, headId: nextId };
  }
  return singleSelection(nextId);
}

export function applyMarquee(base: SelectionState, hitIds: string[], additive: boolean): SelectionState {
  const hits = uniqueIds(hitIds);
  if (!hits.length) return additive ? base : emptySelection;
  const ids = additive ? uniqueIds([...base.ids, ...hits]) : hits;
  return {
    ids,
    anchorId: additive ? (base.anchorId ?? hits[0] ?? null) : (hits[0] ?? null),
    headId: hits[hits.length - 1] ?? base.headId,
  };
}

export function pruneSelection(state: SelectionState, orderedIds: string[], retainIds: Iterable<string> = []): SelectionState {
  const visible = new Set(orderedIds);
  for (const id of retainIds) visible.add(id);
  const ids = state.ids.filter((id) => visible.has(id));
  if (!ids.length) return emptySelection;
  return {
    ids,
    anchorId: state.anchorId && visible.has(state.anchorId) ? state.anchorId : (ids[0] ?? null),
    headId: state.headId && visible.has(state.headId) ? state.headId : (ids[ids.length - 1] ?? null),
  };
}

export function neighborAfterDelete(orderedIds: string[], deletedIds: string[], direction: "menu" | "previous" | "next"): string | null {
  if (!orderedIds.length) return null;
  const deleted = new Set(deletedIds);
  const remaining = orderedIds.filter((id) => !deleted.has(id));
  if (!remaining.length) return null;
  const lastDeleted = [...orderedIds].reverse().find((id) => deleted.has(id));
  const firstDeleted = orderedIds.find((id) => deleted.has(id));
  if (direction === "next") {
    const index = lastDeleted ? orderedIds.indexOf(lastDeleted) : -1;
    return remaining.find((id) => orderedIds.indexOf(id) > index) ?? remaining[remaining.length - 1] ?? null;
  }
  if (direction === "previous") {
    const index = firstDeleted ? orderedIds.indexOf(firstDeleted) : orderedIds.length;
    return [...remaining].reverse().find((id) => orderedIds.indexOf(id) < index) ?? remaining[0] ?? null;
  }
  return remaining.find((id) => orderedIds.indexOf(id) > (lastDeleted ? orderedIds.indexOf(lastDeleted) : -1)) ?? remaining[remaining.length - 1] ?? null;
}

export function normalizedRect(x1: number, y1: number, x2: number, y2: number): Rect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function idsIntersectingRect(rows: Array<{ id: string; rect: Rect }>, marquee: Rect): string[] {
  return uniqueIds(rows.filter((row) => row.rect.width > 0 && row.rect.height > 0 && rectsIntersect(row.rect, marquee)).map((row) => row.id));
}

function pushUnique(ids: string[], seen: Set<string>, task: Task) {
  if (seen.has(task.id)) return;
  seen.add(task.id);
  ids.push(task.id);
}

export function outlineTaskIds(options: {
  tasks: Task[];
  projects: Project[];
  perspective: ActivePerspective;
  groupBy?: PerspectiveGroupBy | null;
  projectFilter: string | null;
  collapsedIds?: Iterable<string>;
}): string[] {
  const { tasks, projects, perspective, groupBy = null, projectFilter, collapsedIds = [] } = options;
  const collapsed = new Set(collapsedIds);
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (task: Task) => pushUnique(ids, seen, task);
  const byProject = tasksByProjectId(tasks);
  const pushTree = (projectId: string | null) => {
    for (const task of flattenTasks(byProject.get(projectId) ?? [], collapsed)) push(task);
  };

  if (groupBy === "project") {
    pushTree(null);
    for (const project of projects) pushTree(project.id);
    return ids;
  }
  if (groupBy === "tag") {
    const { groups, tags } = tasksByTag(tasks);
    for (const tag of tags) {
      for (const task of flattenTasks(groups.get(tag) ?? [], collapsed)) push(task);
    }
    return ids;
  }
  if (groupBy === "flagged") {
    const { flagged, unflagged } = tasksByFlag(tasks);
    for (const group of [flagged, unflagged]) {
      for (const task of flattenTasks(group, collapsed)) push(task);
    }
    return ids;
  }
  if (groupBy === "due") {
    const { groups, labels } = tasksByDueLabel(tasks);
    for (const due of labels) {
      for (const task of flattenTasks(groups.get(due) ?? [], collapsed)) push(task);
    }
    return ids;
  }
  if (groupBy === "none") {
    for (const task of flattenTasks(tasks, collapsed)) push(task);
    return ids;
  }
  if (perspective === "projects") {
    const visibleProjects = projects.filter((project) => !projectFilter || project.id === projectFilter);
    for (const project of visibleProjects) pushTree(project.id);
    return ids;
  }
  if (perspective === "tags") {
    const { groups, tags } = tasksByTag(tasks);
    for (const tag of tags) {
      for (const task of flattenTasks(groups.get(tag) ?? [], collapsed)) push(task);
    }
    return ids;
  }
  if (perspective === "review") return ids;
  for (const task of flattenTasks(tasks, collapsed)) push(task);
  return ids;
}
